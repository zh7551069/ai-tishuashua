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
import hero from './assets/settings-hero.jpg';
import typeCheck from './assets/type-check.svg';
import { quizSettingsFooterLine } from './footer-copy';
import {
  applyWholePackSwitch,
  dailyPlanPointSelected,
  dailyPlanSessionKnowledgePointIds,
  toggleDailyPlanPoint,
} from './whole-pack';
import './index.css';

const KNOWN_TYPES = new Set<string>(QUIZ_TYPES);

export default function QuizSettingsPage() {
  const params = useRouter().params;
  const packId = queryValue(params.packId);
  const fromRetrain = queryValue(params.from) === 'retrainSimilar';
  const fromDailyPlan = queryValue(params.intent) === 'dailyPlan' && !fromRetrain;
  const requestedKpIds = parseIdList(queryValue(params.kpIds));
  const seeded = useRef(false);
  const [pack, setPack] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const [kept, setKept] = useState<string[] | null>(null);
  const [wholePack, setWholePack] = useState(false);
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
      if (fromDailyPlan && !seeded.current) {
        seeded.current = true;
        const allowed = new Set(data.knowledgePointIds.map((id) => id.toLowerCase()));
        setKept(requestedKpIds.filter((id) => allowed.has(id)));
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
  const dailyMissing = fromDailyPlan && !wholePack && (!kept || kept.length === 0);
  const retrainPending = fromRetrain && kept === null;
  const blocked =
    !pack ||
    pack.unavailable ||
    typeMissing ||
    secondsInvalid ||
    busy ||
    gate.sheetOpen ||
    kpMissing ||
    dailyMissing ||
    retrainPending;
  const enabledTypes = (pack?.enabledQuestionTypeCodes ?? []).filter((code): code is QuizTypeCode =>
    KNOWN_TYPES.has(code),
  );
  const footerLine =
    pack && !pack.unavailable
      ? quizSettingsFooterLine({
          types,
          count,
          difficulty,
          timerOn,
          timerKind,
          paperMinutes,
          perQuestionSeconds,
        })
      : null;
  const ctaOn = Boolean(footerLine && footerLine.kind === 'summary' && (!blocked || busy));

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

  const packPointIds = pack?.knowledgePoints.map((item) => item.id) ?? [];

  const toggleWholePack = () => {
    const next = applyWholePackSwitch(!wholePack, packPointIds);
    setWholePack(next.wholePack);
    setKept(next.kept);
  };

  const toggleDailyPoint = (id: string) => {
    const next = toggleDailyPlanPoint({ wholePack, kept: kept ?? [] }, id, packPointIds);
    setWholePack(next.wholePack);
    setKept(next.kept);
  };

  const start = async () => {
    if (!pack || blocked) {
      return;
    }
    if (fromRetrain && (!kept || kept.length === 0)) {
      return;
    }
    if (fromDailyPlan && !wholePack && (!kept || kept.length === 0)) {
      return;
    }
    const dailyPointIds = fromDailyPlan
      ? dailyPlanSessionKnowledgePointIds({ wholePack, kept: kept ?? [] })
      : undefined;
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
              : dailyPointIds !== undefined
                ? { knowledgePointIds: dailyPointIds }
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
      navClassName="qs-nav qs-set-nav"
      footerClassName="qs-set-foot"
      title="出题设置"
      footer={
        footerLine ? (
          <View className="qs-set-foot-col">
            <View className="qs-set-foot-line">
              <Text
                className={
                  footerLine.kind === 'alert' ? 'qs-set-foot-alert' : 'qs-set-foot-summary'
                }
              >
                {footerLine.text}
              </Text>
            </View>
            <Button
              className={classes('u-btn', 'qs-set-cta', ctaOn ? 'qs-set-cta-on' : 'qs-set-cta-off')}
              disabled={blocked}
              loading={busy}
              onClick={() => void start()}
            >
              AI 开始出题
            </Button>
            {kpMissing ? <Text className="u-help-alert">{RETRAIN_KP_HELP}</Text> : null}
            {dailyMissing ? (
              <Text className="u-help-alert">请选择至少一个知识点，或打开整包练习</Text>
            ) : null}
          </View>
        ) : null
      }
    >
      <View className="qs-stack qs-set">
        {!ready && !error ? <LoadingBlock /> : null}
        {error ? (
          <ErrorBlock
            detail={error}
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {pack ? (
          <View className="qs-hero">
            <Image className="qs-hero-img" src={hero} mode="scaleToFill" />
          </View>
        ) : null}
        {pack ? (
          <View className="qs-pack">
            <Text className="qs-kicker">当前刷题包</Text>
            <Text className="qs-pack-line">
              {fromRetrain
                ? `${pack.certName || pack.name} · 复练同类`
                : fromDailyPlan
                  ? `${pack.certName || pack.name} · 今日计划`
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
        {pack && !pack.unavailable && fromDailyPlan ? (
          <View className="qs-panel qs-retrain">
            <Text className="qs-kicker">今日计划</Text>
            <Text className="qs-label">知识点</Text>
            <Text className="qs-hint">默认只练带入的知识点。可以改选多个，或打开整包练习。</Text>
            <View className="qs-chips">
              {pack.knowledgePoints.map((item) => {
                const id = item.id.toLowerCase();
                const on = dailyPlanPointSelected({ wholePack, kept: kept ?? [] }, id);
                return (
                  <View
                    key={item.id}
                    className={classes('qs-chip', on && 'qs-chip-on')}
                    onClick={() => toggleDailyPoint(id)}
                  >
                    <Text className={classes('qs-chip-label', on && 'qs-chip-label-on')}>
                      {item.name}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View className="qs-timer-row" onClick={toggleWholePack}>
              <Text className="qs-label">整包练习</Text>
              <View className={classes('qs-switch', wholePack && 'qs-switch-on')}>
                <View className="qs-knob"/>
              </View>
            </View>
            {dailyMissing ? (
              <Text className="u-help-alert">请选择至少一个知识点，或打开整包练习</Text>
            ) : null}
          </View>
        ) : null}
        {pack && !pack.unavailable ? (
          <View className="qs-form">
            <View className="qs-sec">
              <View className="qs-sec-head">
                <Text className="qs-sec-label">题量</Text>
              </View>
              <View className="qs-choice-row">
                {QUIZ_COUNTS.map((item) => (
                  <CountChip
                    key={item}
                    label={String(item)}
                    on={item === count}
                    onClick={() => setCount(item)}
                  />
                ))}
              </View>
            </View>
            <View className="qs-sec">
              <View className="qs-sec-head">
                <Text className="qs-sec-label">难度</Text>
              </View>
              <View className="qs-diff">
                {QUIZ_DIFFICULTIES.map((item) => (
                  <View
                    key={item}
                    className={classes('qs-diff-item', item === difficulty && 'qs-diff-on')}
                    onClick={() => setDifficulty(item)}
                  >
                    <Text
                      className={classes(
                        'qs-diff-label',
                        item === difficulty && 'qs-diff-label-on',
                      )}
                    >
                      {QUIZ_DIFFICULTY_LABELS[item]}
                    </Text>
                  </View>
                ))}
              </View>
              <Text className="qs-sec-hint">影响题干复杂度与干扰项强度</Text>
            </View>
            <View className="qs-sec">
              <View className="qs-sec-head">
                <Text className="qs-sec-label">题型</Text>
                <View className="qs-multi">
                  <Text className="qs-multi-label">可多选</Text>
                </View>
              </View>
              <View className="qs-choice-row">
                {enabledTypes.map((item) => (
                  <TypeChip
                    key={item}
                    label={QUIZ_TYPE_LABELS[item]}
                    on={types.includes(item)}
                    anyOn={types.length > 0}
                    onClick={() => toggleType(item)}
                  />
                ))}
              </View>
            </View>
            <View className={classes('qs-timer-card', timerOn && 'qs-timer-card-on')}>
              <View className="qs-set-timer-row" onClick={() => setTimerOn((value) => !value)}>
                <Text className="qs-set-timer-label">计时</Text>
                <View className={classes('qs-set-switch', timerOn && 'qs-set-switch-on')}>
                  <View className="qs-set-knob" />
                </View>
              </View>
              {timerOn ? (
                <View className="qs-set-on">
                  <Text className="qs-set-field">计时方式</Text>
                  <View className="qs-set-seg">
                    <View
                      className={classes(
                        'qs-set-seg-item',
                        timerKind === 'paper' && 'qs-set-seg-on',
                      )}
                      onClick={() => setTimerKind('paper')}
                    >
                      <Text
                        className={classes(
                          'qs-set-seg-label',
                          timerKind === 'paper' && 'qs-set-seg-label-on',
                        )}
                      >
                        整卷倒计时
                      </Text>
                    </View>
                    <View
                      className={classes(
                        'qs-set-seg-item',
                        timerKind === 'per_question' && 'qs-set-seg-on',
                      )}
                      onClick={() => setTimerKind('per_question')}
                    >
                      <Text
                        className={classes(
                          'qs-set-seg-label',
                          timerKind === 'per_question' && 'qs-set-seg-label-on',
                        )}
                      >
                        每题限时
                      </Text>
                    </View>
                  </View>
                  <Text className="qs-set-field">
                    {timerKind === 'paper' ? '总时长（分钟）' : '每题限时（秒）'}
                  </Text>
                  {timerKind === 'paper' ? (
                    <Stepper
                      value={paperMinutes}
                      onChange={(next) => setPaperMinutes(clamp(next, 1, 180))}
                    />
                  ) : (
                    <Stepper
                      pin
                      value={perQuestionSeconds}
                      step={10}
                      onChange={(next) => setPerQuestionSeconds(clamp(next, 1, 600))}
                    />
                  )}
                  {secondsInvalid ? (
                    <Text className="qs-alert">每题限时须为 1 到 600 秒</Text>
                  ) : null}
                </View>
              ) : (
                <Text className="qs-set-off">关闭后不限时作答</Text>
              )}
            </View>
            <View className="qs-panel qs-mode">
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

function CountChip(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <View
      className={classes('qs-count', props.on ? 'qs-count-on' : 'qs-count-off')}
      onClick={props.onClick}
    >
      <Text className={classes('qs-count-label', props.on && 'qs-count-label-on')}>
        {props.label}
      </Text>
    </View>
  );
}

function TypeChip(props: { label: string; on: boolean; anyOn: boolean; onClick: () => void }) {
  const width = props.on ? 'qs-type-on' : props.anyOn ? 'qs-type-off' : 'qs-type-idle';
  return (
    <View className={classes('qs-type', width)} onClick={props.onClick}>
      <View className={classes('qs-type-tick', props.on ? 'qs-type-tick-on' : 'qs-type-tick-off')}>
        {props.on ? <Image className="qs-type-check" src={typeCheck} mode="aspectFit" /> : null}
      </View>
      <Text className={classes('qs-type-label', props.on && 'qs-type-label-on')}>
        {props.label}
      </Text>
    </View>
  );
}

function Stepper(props: {
  value: number;
  step?: number;
  pin?: boolean;
  onChange: (next: number) => void;
}) {
  const step = props.step ?? 5;
  const buttonClass = classes('qs-set-step', props.pin && 'qs-set-step-pin');
  return (
    <View className="qs-set-stepper">
      <View className={buttonClass} onClick={() => props.onChange(props.value - step)}>
        <Text className="qs-set-sign">−</Text>
      </View>
      <Text className="qs-set-num">{props.value}</Text>
      <View className={buttonClass} onClick={() => props.onChange(props.value + step)}>
        <Text className="qs-set-sign">+</Text>
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
