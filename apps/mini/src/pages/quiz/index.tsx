import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  DEFAULT_PAPER_MINUTES,
  DEFAULT_PER_QUESTION_SECONDS,
  DEFAULT_QUIZ_COUNT,
  DEFAULT_QUIZ_DIFFICULTY,
  DEFAULT_QUIZ_MODE,
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_MODES,
  QUIZ_MODE_LABELS,
  QUIZ_TYPES,
  QUIZ_TYPE_LABELS,
  type PackView,
  type QuizCount,
  type QuizDifficulty,
  type QuizMode,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchPack } from '../../services/pack-api';
import { queryValue } from '../../services/query';
import { createQuizSession } from '../../services/quiz-api';
import { RETRAIN_KP_HELP, parseIdList } from '../../services/retrain';

const KNOWN_TYPES = new Set<string>(QUIZ_TYPES);

export default function QuizSettingsPage() {
  const params = useRouter().params;
  const packId = queryValue(params.packId);
  const fromRetrain = queryValue(params.from) === 'retrainSimilar';
  const requestedKpIds = parseIdList(queryValue(params.kpIds));
  const seeded = useRef(false);
  const [pack, setPack] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const [kept, setKept] = useState<string[] | null>(null);
  const [count, setCount] = useState<QuizCount>(DEFAULT_QUIZ_COUNT);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(DEFAULT_QUIZ_DIFFICULTY);
  const [types, setTypes] = useState<QuizTypeCode[]>([]);
  const [typesTouched, setTypesTouched] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const [timerKind, setTimerKind] = useState<'paper' | 'per_question'>('paper');
  const [paperMinutes, setPaperMinutes] = useState(DEFAULT_PAPER_MINUTES);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(DEFAULT_PER_QUESTION_SECONDS);
  const [mode, setMode] = useState<QuizMode>(DEFAULT_QUIZ_MODE);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!packId) {
      setError('缺少刷题包');
      setReady(true);
      return;
    }
    setError('');
    try {
      const data = await withAuth((token) => fetchPack(token, packId));
      if (!data) {
        return;
      }
      setPack(data);
      if (!typesTouched) {
        setTypes(
          data.enabledQuestionTypeCodes.filter((code): code is QuizTypeCode =>
            KNOWN_TYPES.has(code),
          ),
        );
      }
      if (fromRetrain && !seeded.current) {
        seeded.current = true;
        const allowed = new Set(data.knowledgePointIds.map((id) => id.toLowerCase()));
        const ids = requestedKpIds.filter((id) => allowed.has(id));
        setPrefilled(ids);
        setKept(ids);
      }
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const secondsInvalid =
    timerOn &&
    timerKind === 'per_question' &&
    (!Number.isInteger(perQuestionSeconds) || perQuestionSeconds < 1 || perQuestionSeconds > 600);
  const typeMissing = types.length === 0;
  const kpMissing = fromRetrain && kept !== null && kept.length === 0;
  const retrainPending = fromRetrain && kept === null;
  const blocked =
    !pack ||
    pack.unavailable ||
    typeMissing ||
    secondsInvalid ||
    busy ||
    kpMissing ||
    retrainPending;
  const enabledTypes = (pack?.enabledQuestionTypeCodes ?? []).filter((code): code is QuizTypeCode =>
    KNOWN_TYPES.has(code),
  );

  const toggleType = (type: QuizTypeCode) => {
    setTypesTouched(true);
    setTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  };

  const toggleKept = (id: string) => {
    setKept((current) => {
      const list = current ?? [];
      return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
    });
  };

  const start = async () => {
    if (!pack || blocked) {
      return;
    }
    if (fromRetrain && (!kept || kept.length === 0)) {
      return;
    }
    setBusy(true);
    try {
      const created = await withAuth((token) =>
        createQuizSession(token, {
          packId: pack.id,
          count,
          difficulty,
          types,
          mode,
          timer: !timerOn
            ? { enabled: false }
            : timerKind === 'per_question'
              ? { enabled: true, kind: 'per_question', perQuestionSeconds }
              : { enabled: true, kind: 'paper', paperMinutes },
          ...(fromRetrain
            ? { source: 'retrain_similar' as const, knowledgePointIds: kept ?? [] }
            : {}),
        }),
      );
      if (!created) {
        return;
      }
      await Taro.navigateTo({ url: `/pages/quiz/progress/index?sessionId=${created.id}` });
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '出题失败',
        icon: 'none',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="出题设置"
      footer={
        pack && !pack.unavailable ? (
          <View>
            <Button
              className="u-btn"
              disabled={blocked}
              loading={busy}
              onClick={() => void start()}
            >
              AI 开始出题
            </Button>
            {kpMissing ? <Text className="u-help-alert">{RETRAIN_KP_HELP}</Text> : null}
          </View>
        ) : null
      }
    >
      <View className="u-pad">
        {!ready && !error ? <LoadingBlock /> : null}
        {error ? (
          <ErrorBlock
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {pack ? (
          <View className="u-panel">
            <Text className="u-kicker">当前刷题包</Text>
            <Text
              className="u-h1"
              style={{ marginTop: '6px', fontSize: '27px', lineHeight: '42px' }}
            >
              {fromRetrain
                ? `${pack.certName || pack.name} · 复练同类`
                : `${pack.certName || pack.name} · ${pack.knowledgePointCount} 知识点`}
            </Text>
            {pack.unavailable ? <Text className="u-meta">关联证书已下架，不能出题</Text> : null}
          </View>
        ) : null}
        {pack && !pack.unavailable && fromRetrain ? (
          <View className="u-panel">
            <Text className="u-kicker">复练同类</Text>
            <Text className="u-label" style={{ marginTop: '8px' }}>
              知识点
            </Text>
            <Text className="u-note">只使用这些知识点，点一下可去掉或加回。不能改成整包。</Text>
            {prefilled.length > 0 ? (
              <View className="u-chips">
                {prefilled.map((id) => {
                  const on = (kept ?? []).includes(id);
                  return (
                    <Text
                      key={id}
                      className={on ? 'u-chip u-chip-on' : 'u-chip u-chip-line'}
                      onClick={() => toggleKept(id)}
                    >
                      {knowledgeName(pack, id)}
                      {on ? ' ×' : ''}
                    </Text>
                  );
                })}
              </View>
            ) : null}
            {kpMissing ? <Text className="u-help-alert">{RETRAIN_KP_HELP}</Text> : null}
          </View>
        ) : null}
        {pack && !pack.unavailable ? (
          <View className="u-panel">
            <Text className="u-label">题量</Text>
            <View className="u-pills">
              {QUIZ_COUNTS.map((item) => (
                <Text
                  key={item}
                  className={item === count ? 'u-pill u-pill-on' : 'u-pill'}
                  onClick={() => setCount(item)}
                >
                  {item}
                </Text>
              ))}
            </View>
            <View className="u-rule" />
            <Text className="u-label">难度</Text>
            <View className="u-pills">
              {QUIZ_DIFFICULTIES.map((item) => (
                <Text
                  key={item}
                  className={item === difficulty ? 'u-pill u-pill-on' : 'u-pill'}
                  onClick={() => setDifficulty(item)}
                >
                  {QUIZ_DIFFICULTY_LABELS[item]}
                </Text>
              ))}
            </View>
            <Text className="u-note">影响题干复杂度与干扰项强度</Text>
            <View className="u-rule" />
            <View className="u-label-row">
              <Text className="u-label">题型</Text>
              <Text className="u-label-note">可多选</Text>
            </View>
            <View className="u-pills">
              {enabledTypes.map((item) => (
                <Text
                  key={item}
                  className={types.includes(item) ? 'u-pill u-pill-on' : 'u-pill'}
                  onClick={() => toggleType(item)}
                >
                  {QUIZ_TYPE_LABELS[item]}
                </Text>
              ))}
            </View>
            {typeMissing ? <Text className="u-state-sub">请至少选择一种题型</Text> : null}
            <View className="u-rule" />
            <View className="u-switch-row" onClick={() => setTimerOn((value) => !value)}>
              <Text className="u-label">计时</Text>
              <View className={timerOn ? 'u-toggle u-toggle-on' : 'u-toggle'}>
                <View className="u-toggle-knob" />
              </View>
            </View>
            {timerOn ? (
              <View>
                <Text className="u-note" style={{ marginTop: '15px' }}>
                  计时方式
                </Text>
                <View className="u-seg">
                  <Text
                    className={timerKind === 'paper' ? 'u-seg-item u-seg-on' : 'u-seg-item'}
                    onClick={() => setTimerKind('paper')}
                  >
                    整卷倒计时
                  </Text>
                  <Text
                    className={timerKind === 'per_question' ? 'u-seg-item u-seg-on' : 'u-seg-item'}
                    onClick={() => setTimerKind('per_question')}
                  >
                    每题限时
                  </Text>
                </View>
                <View className="u-between">
                  <Text className="u-note">
                    {timerKind === 'paper' ? '总时长（分钟）' : '每题限时（秒）'}
                  </Text>
                  {timerKind === 'paper' ? (
                    <Stepper
                      value={paperMinutes}
                      onChange={(next) => setPaperMinutes(clamp(next, 1, 180))}
                    />
                  ) : (
                    <Stepper
                      value={perQuestionSeconds}
                      step={10}
                      onChange={(next) => setPerQuestionSeconds(clamp(next, 1, 600))}
                    />
                  )}
                </View>
                {secondsInvalid ? (
                  <Text className="u-state-sub">每题限时须为 1 到 600 秒</Text>
                ) : null}
              </View>
            ) : (
              <Text className="u-note">关闭后不限时</Text>
            )}
            <View className="u-rule" />
            <Text className="u-label">模式</Text>
            <View className="u-pills">
              {QUIZ_MODES.map((item) => (
                <Text
                  key={item}
                  className={item === mode ? 'u-pill u-pill-on' : 'u-pill'}
                  onClick={() => setMode(item)}
                >
                  {QUIZ_MODE_LABELS[item]}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function knowledgeName(pack: PackView, id: string): string {
  return pack.knowledgePoints.find((item) => item.id.toLowerCase() === id)?.name.trim() || '知识点';
}

function Stepper(props: { value: number; step?: number; onChange: (next: number) => void }) {
  const step = props.step ?? 5;
  return (
    <View className="u-stepper">
      <Text className="u-stepper-btn" onClick={() => props.onChange(props.value - step)}>
        −
      </Text>
      <Text className="u-stepper-val">{props.value}</Text>
      <Text className="u-stepper-btn" onClick={() => props.onChange(props.value + step)}>
        +
      </Text>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
