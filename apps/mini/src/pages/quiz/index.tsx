import { Button, Image, Text, View } from '@tarojs/components';
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
import { useExhaustedGate } from '../../components/use-exhausted-gate';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchPack } from '../../services/pack-api';
import { queryValue } from '../../services/query';
import { createQuizSession } from '../../services/quiz-api';
import { RETRAIN_KP_HELP, parseIdList } from '../../services/retrain';
import iconKnob from './assets/icon-knob.png';
import './index.css';

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
  const gate = useExhaustedGate();

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
    gate.sheetOpen ||
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
      const result = await gate.run({
        source: fromRetrain ? 'retrain_similar' : 'normal',
        create: (token) =>
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
      });
      if (result.kind !== 'created') {
        return;
      }
      await Taro.navigateTo({ url: `/pages/quiz/progress/index?sessionId=${result.session.id}` });
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
      centerTitle
      navPlain
      navClassName="qs-nav"
      footerClassName="qs-foot"
      title="出题设置"
      footer={
        pack && !pack.unavailable ? (
          <View>
            <Button
              className="u-btn qs-cta"
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
      <View className="qs-stack">
        {!ready && !error ? <LoadingBlock /> : null}
        {error ? (
          <ErrorBlock
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {pack ? (
          <View className="qs-pack">
            <Text className="qs-kicker">当前刷题包</Text>
            <Text className="qs-pack-line">
              {fromRetrain
                ? `${pack.certName || pack.name} · 复练同类`
                : `${pack.certName || pack.name} · ${pack.knowledgePointCount} 知识点`}
            </Text>
            {pack.unavailable ? (
              <Text className="qs-pack-off">关联证书已下架，不能出题</Text>
            ) : null}
          </View>
        ) : null}
        {pack && !pack.unavailable && fromRetrain ? (
          <View className="qs-panel qs-retrain">
            <Text className="qs-kicker">复练同类</Text>
            <Text className="qs-label">知识点</Text>
            <Text className="qs-hint">只使用这些知识点，点一下可去掉或加回。不能改成整包。</Text>
            {prefilled.length > 0 ? (
              <View className="qs-chips">
                {prefilled.map((id) => {
                  const on = (kept ?? []).includes(id);
                  return (
                    <View
                      key={id}
                      className={classes('qs-chip', on && 'qs-chip-on')}
                      onClick={() => toggleKept(id)}
                    >
                      <Text className={classes('qs-chip-label', on && 'qs-chip-label-on')}>
                        {knowledgeName(pack, id)}
                        {on ? ' ×' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {kpMissing ? <Text className="u-help-alert">{RETRAIN_KP_HELP}</Text> : null}
          </View>
        ) : null}
        {pack && !pack.unavailable ? (
          <View className="qs-panel">
            <View className="qs-block">
              <View className="qs-head">
                <Text className="qs-label">题量</Text>
              </View>
              <View className="qs-chips">
                {QUIZ_COUNTS.map((item) => (
                  <Chip
                    key={item}
                    count
                    label={String(item)}
                    on={item === count}
                    onClick={() => setCount(item)}
                  />
                ))}
              </View>
              <View className="qs-rule" />
            </View>
            <View className="qs-block">
              <View className="qs-head">
                <Text className="qs-label">难度</Text>
              </View>
              <View className="qs-chips">
                {QUIZ_DIFFICULTIES.map((item) => (
                  <Chip
                    key={item}
                    label={QUIZ_DIFFICULTY_LABELS[item]}
                    on={item === difficulty}
                    onClick={() => setDifficulty(item)}
                  />
                ))}
              </View>
              <Text className="qs-hint">影响题干复杂度与干扰项强度</Text>
              <View className="qs-rule" />
            </View>
            <View className="qs-block">
              <View className="qs-head">
                <Text className="qs-label">题型</Text>
                <Text className="qs-aside">可多选</Text>
              </View>
              <View className="qs-chips">
                {enabledTypes.map((item) => (
                  <Chip
                    key={item}
                    label={QUIZ_TYPE_LABELS[item]}
                    on={types.includes(item)}
                    onClick={() => toggleType(item)}
                  />
                ))}
              </View>
              {typeMissing ? <Text className="qs-alert">请先选择题型</Text> : null}
              <View className="qs-rule" />
            </View>
            <View>
              <View className="qs-timer-row" onClick={() => setTimerOn((value) => !value)}>
                <Text className="qs-label">计时</Text>
                <View className={classes('qs-switch', timerOn && 'qs-switch-on')}>
                  <Image className="qs-knob" src={iconKnob} mode="aspectFit" />
                </View>
              </View>
              {timerOn ? (
                <View className="qs-timer-on">
                  <View className="qs-method">
                    <Text className="qs-field">计时方式</Text>
                    <View className="qs-seg">
                      <View
                        className={classes('qs-seg-item', timerKind === 'paper' && 'qs-seg-on')}
                        onClick={() => setTimerKind('paper')}
                      >
                        <Text
                          className={classes(
                            'qs-seg-label',
                            timerKind === 'paper' && 'qs-seg-label-on',
                          )}
                        >
                          整卷倒计时
                        </Text>
                      </View>
                      <View
                        className={classes(
                          'qs-seg-item',
                          timerKind === 'per_question' && 'qs-seg-on',
                        )}
                        onClick={() => setTimerKind('per_question')}
                      >
                        <Text
                          className={classes(
                            'qs-seg-label',
                            timerKind === 'per_question' && 'qs-seg-label-on',
                          )}
                        >
                          每题限时
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View className="qs-duration">
                    <Text className="qs-field">
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
                    <Text className="qs-alert">每题限时须为 1 到 600 秒</Text>
                  ) : null}
                </View>
              ) : (
                <Text className="qs-hint qs-timer-off">关闭后不限时作答</Text>
              )}
            </View>
            <View className="qs-rule qs-split" />
            <View className="qs-block qs-block-last">
              <View className="qs-head">
                <Text className="qs-label">模式</Text>
              </View>
              <View className="qs-chips">
                {QUIZ_MODES.map((item) => (
                  <Chip
                    key={item}
                    label={QUIZ_MODE_LABELS[item]}
                    on={item === mode}
                    onClick={() => setMode(item)}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {gate.sheet}
    </Screen>
  );
}

function knowledgeName(pack: PackView, id: string): string {
  return pack.knowledgePoints.find((item) => item.id.toLowerCase() === id)?.name.trim() || '知识点';
}

function Chip(props: { label: string; on: boolean; count?: boolean; onClick: () => void }) {
  return (
    <View
      className={classes('qs-chip', props.count && 'qs-chip-count', props.on && 'qs-chip-on')}
      onClick={props.onClick}
    >
      <Text className={classes('qs-chip-label', props.on && 'qs-chip-label-on')}>
        {props.label}
      </Text>
    </View>
  );
}

function Stepper(props: { value: number; step?: number; onChange: (next: number) => void }) {
  const step = props.step ?? 5;
  return (
    <View className="qs-stepper">
      <View className="qs-step" onClick={() => props.onChange(props.value - step)}>
        <Text className="qs-step-sign">−</Text>
      </View>
      <View className="qs-step-val">
        <Text className="qs-step-num">{props.value}</Text>
      </View>
      <View className="qs-step-plus" onClick={() => props.onChange(props.value + step)}>
        <Text className="qs-step-sign">+</Text>
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
