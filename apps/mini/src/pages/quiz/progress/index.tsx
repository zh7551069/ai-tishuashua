import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import {
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_MODES,
  QUIZ_MODE_LABELS,
  QUIZ_TYPES,
  QUIZ_TYPE_LABELS,
  type QuizCount,
  type QuizSessionView,
  type QuizTimer,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { cancelQuizSession, createQuizSession, fetchQuizSession } from '../../../services/quiz-api';
import { isQuizType, variantProgressUrl, variantSessionInput } from '../../../services/retrain';
import iconBack from '../assets/icon-back.png';
import iconKnob from '../assets/icon-knob.png';
import { SpinGlyph, StatusGlyph } from '../glyphs';
import '../index.css';

const VARIANT_PACK_LINE = '题型变异 · 练习 · 1 题';

export default function QuizProgressPage() {
  const params = useRouter().params;
  const routeSessionId = queryValue(params.sessionId);
  const fromVariant = queryValue(params.from) === 'variant';
  const wrongItemId = queryValue(params.wrongItemId);
  const packId = queryValue(params.packId);
  const [sessionId, setSessionId] = useState(routeSessionId);
  const sessionIdRef = useRef(routeSessionId);
  sessionIdRef.current = sessionId;
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const follow = (next: QuizSessionView) => {
    setSession(next);
    if (next.status === 'ready' || next.status === 'in_progress') {
      stopped.current = true;
      void Taro.redirectTo({ url: `/pages/quiz/paper/index?sessionId=${next.id}` });
      return;
    }
    if (next.status === 'cancelled') {
      stopped.current = true;
      void Taro.navigateBack().catch(() => {
        void Taro.redirectTo({ url: '/pages/home/index' });
      });
    }
  };

  const poll = async () => {
    const currentId = sessionIdRef.current;
    if (!currentId || stopped.current) {
      return;
    }
    try {
      const next = await withAuth((token) => fetchQuizSession(token, currentId));
      if (!next || stopped.current) {
        return;
      }
      setError('');
      follow(next);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        stopped.current = true;
        return;
      }
      setError(caught instanceof Error ? caught.message : '进度加载失败');
    }
  };

  const stopPolling = () => {
    stopped.current = true;
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const resumePolling = () => {
    if (timer.current) {
      clearInterval(timer.current);
    }
    stopped.current = false;
    void poll();
    timer.current = setInterval(() => {
      void poll();
    }, 1500);
  };

  useDidShow(() => {
    resumePolling();
  });

  useDidHide(() => {
    stopPolling();
  });

  const cancel = async () => {
    if (!sessionId || cancelling) {
      return;
    }
    setCancelling(true);
    try {
      const next = await withAuth((token) => cancelQuizSession(token, sessionId));
      if (!next) {
        return;
      }
      follow(next);
    } catch (caught) {
      if (!isAuthFailure(caught)) {
        await Taro.showToast({
          title: caught instanceof Error ? caught.message : '取消失败',
          icon: 'none',
        });
      }
    } finally {
      setCancelling(false);
    }
  };

  const retryVariant = async () => {
    const nextPackId = session?.packId || packId;
    if (retrying) {
      return;
    }
    if (!wrongItemId || !nextPackId) {
      await Taro.showToast({ title: '请返回详情后重新发起', icon: 'none' });
      return;
    }
    setRetrying(true);
    stopPolling();
    let createdId = '';
    try {
      const types = (session?.settings.types ?? []).filter((item): item is QuizTypeCode =>
        isQuizType(item),
      );
      const created = await withAuth((token) =>
        createQuizSession(
          token,
          variantSessionInput({
            packId: nextPackId,
            wrongItemId,
            difficulty: session?.settings.difficulty,
            types,
          }),
        ),
      );
      if (!created) {
        return;
      }
      createdId = created.id;
      setSession(null);
      setError('');
      sessionIdRef.current = created.id;
      setSessionId(created.id);
      stopped.current = false;
      await Taro.redirectTo({
        url: variantProgressUrl({
          sessionId: created.id,
          wrongItemId,
          packId: nextPackId,
        }),
      });
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      if (createdId) {
        resumePolling();
        return;
      }
      setError(caught instanceof Error ? caught.message : '重新生成失败');
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '重新生成失败',
        icon: 'none',
      });
    } finally {
      setRetrying(false);
    }
  };

  const retryNormal = async () => {
    if (retrying) {
      return;
    }
    if (!session || session.status !== 'failed' || session.source !== 'normal' || !session.packId) {
      void Taro.navigateBack().catch(() => {
        void Taro.redirectTo({ url: '/pages/home/index' });
      });
      return;
    }
    const count = session.settings.count;
    if (!isListedCount(count)) {
      void Taro.navigateBack().catch(() => {
        void Taro.redirectTo({ url: '/pages/home/index' });
      });
      return;
    }
    setRetrying(true);
    stopPolling();
    let createdId = '';
    try {
      const created = await withAuth((token) =>
        createQuizSession(token, {
          packId: session.packId || '',
          count,
          difficulty: session.settings.difficulty,
          types: session.settings.types,
          mode: session.settings.mode,
          timer: session.settings.timer,
          source: 'normal',
        }),
      );
      if (!created) {
        return;
      }
      createdId = created.id;
      setSession(null);
      setError('');
      sessionIdRef.current = created.id;
      setSessionId(created.id);
      stopped.current = false;
      await Taro.redirectTo({ url: `/pages/quiz/progress/index?sessionId=${created.id}` });
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      if (createdId) {
        resumePolling();
        return;
      }
      setError(caught instanceof Error ? caught.message : '重新出题失败');
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '重新出题失败',
        icon: 'none',
      });
    } finally {
      setRetrying(false);
    }
  };

  const backToSettings = () => {
    void Taro.navigateBack().catch(() => {
      void Taro.redirectTo({ url: '/pages/home/index' });
    });
  };

  const backToDetail = () => {
    void Taro.navigateBack().catch(() => {
      if (wrongItemId) {
        void Taro.redirectTo({ url: `/pages/wrong-book/detail/index?id=${wrongItemId}` });
        return;
      }
      void Taro.redirectTo({ url: '/pages/home/index' });
    });
  };

  const generated = session?.progress.generated ?? 0;
  const total = session?.progress.total ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((generated / total) * 100)) : 8;
  const failed = session?.status === 'failed' || Boolean(error);
  const isVariant = session ? session.source === 'variant' : fromVariant;

  return (
    <Screen
      back
      navPlain
      navClassName="qs-nav"
      title="出题设置"
      backMark={
        <View className="qs-back-clip">
          <Image className="qs-back-ico" src={iconBack} mode="aspectFit" />
        </View>
      }
      footer={
        <View className="u-btn qs-cta dlg-foot-cta">
          <Text className="dlg-cta-text">AI 开始出题</Text>
        </View>
      }
      footerClassName="qs-foot"
    >
      <View className="dlg-stage">
        <SettingsGhost session={session} variant={isVariant} />
      </View>
      <View className="dlg-scrim" catchMove>
        <View className="dlg-card" catchMove>
          {isVariant ? (
            <VariantCard
              failed={failed}
              percent={percent}
              cancelling={cancelling}
              retrying={retrying}
              onCancel={() => void cancel()}
              onRetry={() => void retryVariant()}
              onBack={backToDetail}
            />
          ) : (
            <NormalCard
              failed={failed}
              percent={percent}
              generated={generated}
              total={total}
              session={session}
              cancelling={cancelling}
              retrying={retrying}
              onCancel={() => void cancel()}
              onRetry={() => {
                if (session?.status === 'failed') {
                  void retryNormal();
                  return;
                }
                setError('');
              }}
              onBack={backToSettings}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

function NormalCard(props: {
  failed: boolean;
  percent: number;
  generated: number;
  total: number;
  session: QuizSessionView | null;
  cancelling: boolean;
  retrying: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  if (props.failed) {
    return (
      <>
        <StatusGlyph kind="danger" />
        <Text className="dlg-title">出题失败</Text>
        <View className="dlg-bodyblock">
          <Text className="dlg-body">网络不稳定，题目未能生成完成</Text>
          <View className="dlg-banner">
            <Text className="dlg-banner-text">已生成进度不会保留</Text>
          </View>
        </View>
        <Button
          className="dlg-btn dlg-btn-block dlg-btn-primary"
          hoverClass="none"
          loading={props.retrying}
          disabled={props.retrying}
          onClick={props.onRetry}
        >
          重新出题
        </Button>
        <View className="dlg-link" onClick={props.onBack}>
          <Text className="dlg-link-text">返回设置</Text>
        </View>
      </>
    );
  }
  const lines = props.session ? metaLines(props.session) : null;
  return (
    <>
      <SpinGlyph />
      <View className="dlg-titleblock">
        <Text className="dlg-title">正在出题…</Text>
        <Text className="dlg-sub">预计很快完成</Text>
      </View>
      <Text className="dlg-count">
        已生成 {props.generated} / {props.total || '…'}
      </Text>
      <View className="dlg-bar">
        <View className="dlg-bar-fill" style={{ width: `${props.percent}%` }} />
      </View>
      {lines ? (
        <View className="dlg-meta">
          <Text className="dlg-meta-line">{lines.topic}</Text>
          <Text className="dlg-meta-line">{lines.timer}</Text>
        </View>
      ) : null}
      <Button
        className="dlg-btn dlg-btn-block dlg-btn-cancel"
        hoverClass="none"
        disabled={props.cancelling}
        onClick={props.onCancel}
      >
        取消
      </Button>
    </>
  );
}

function VariantCard(props: {
  failed: boolean;
  percent: number;
  cancelling: boolean;
  retrying: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  if (props.failed) {
    return (
      <>
        <StatusGlyph kind="danger" />
        <Text className="dlg-title">变异题生成失败</Text>
        <View className="dlg-bodyblock">
          <Text className="dlg-body">题目未能生成，可重试（将开启新会话）</Text>
          <View className="dlg-banner">
            <Text className="dlg-banner-text">已生成进度不会保留</Text>
          </View>
        </View>
        <Button
          className="dlg-btn dlg-btn-block dlg-btn-primary"
          hoverClass="none"
          loading={props.retrying}
          disabled={props.retrying}
          onClick={props.onRetry}
        >
          重新生成
        </Button>
        <View className="dlg-link" onClick={props.onBack}>
          <Text className="dlg-link-text">返回详情</Text>
        </View>
      </>
    );
  }
  return (
    <>
      <SpinGlyph />
      <View className="dlg-titleblock">
        <Text className="dlg-title">正在生成变异题…</Text>
        <Text className="dlg-sub">基于本题换题型或语境</Text>
      </View>
      <Text className="dlg-count">预计很快完成</Text>
      <View className="dlg-bar">
        <View className="dlg-bar-fill" style={{ width: `${props.percent}%` }} />
      </View>
      <View className="dlg-meta">
        <Text className="dlg-meta-line">{VARIANT_PACK_LINE}</Text>
        <Text className="dlg-meta-line">答对不消灭原错题</Text>
      </View>
      <Button
        className="dlg-btn dlg-btn-block dlg-btn-cancel"
        hoverClass="none"
        disabled={props.cancelling}
        onClick={props.onCancel}
      >
        取消
      </Button>
    </>
  );
}

function SettingsGhost(props: { session: QuizSessionView | null; variant: boolean }) {
  const settings = props.session?.settings;
  const count = settings && isListedCount(settings.count) ? settings.count : 20;
  const difficulty = settings?.difficulty ?? 'medium';
  const types = new Set(settings?.types ?? (['single', 'multi'] as QuizTypeCode[]));
  const mode = props.variant ? 'practice' : (settings?.mode ?? 'practice');
  const timer = settings?.timer ?? { enabled: true, kind: 'paper' as const, paperMinutes: 30 };
  const packLine = props.variant
    ? VARIANT_PACK_LINE
    : props.session?.context.certName || props.session?.context.packName || '当前刷题包';
  return (
    <View className="qs-stack">
      <View className="qs-pack">
        <Text className="qs-kicker">当前刷题包</Text>
        <Text className="qs-pack-line">{packLine}</Text>
      </View>
      <View className="qs-panel">
        <View className="qs-block">
          <View className="qs-head">
            <Text className="qs-label">题量</Text>
          </View>
          <View className="qs-chips">
            {QUIZ_COUNTS.map((item) => (
              <GhostChip key={item} count label={String(item)} on={item === count} />
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
              <GhostChip key={item} label={QUIZ_DIFFICULTY_LABELS[item]} on={item === difficulty} />
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
            {QUIZ_TYPES.map((item) => (
              <GhostChip key={item} label={QUIZ_TYPE_LABELS[item]} on={types.has(item)} />
            ))}
          </View>
          <View className="qs-rule" />
        </View>
        <View>
          <View className="qs-timer-row">
            <Text className="qs-label">计时</Text>
            <View className={timer.enabled ? 'qs-switch qs-switch-on' : 'qs-switch'}>
              <Image className="qs-knob" src={iconKnob} mode="aspectFit" />
            </View>
          </View>
          {timer.enabled ? (
            <TimerGhost timer={timer} />
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
              <GhostChip key={item} label={QUIZ_MODE_LABELS[item]} on={item === mode} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function TimerGhost(props: { timer: QuizTimer }) {
  if (!props.timer.enabled) {
    return null;
  }
  const paper = props.timer.kind === 'paper';
  const amount =
    props.timer.kind === 'paper' ? props.timer.paperMinutes : props.timer.perQuestionSeconds;
  return (
    <View className="qs-timer-on">
      <View className="qs-method">
        <Text className="qs-field">计时方式</Text>
        <View className="qs-seg">
          <View className={paper ? 'qs-seg-item qs-seg-on' : 'qs-seg-item'}>
            <Text className={paper ? 'qs-seg-label qs-seg-label-on' : 'qs-seg-label'}>
              整卷倒计时
            </Text>
          </View>
          <View className={paper ? 'qs-seg-item' : 'qs-seg-item qs-seg-on'}>
            <Text className={paper ? 'qs-seg-label' : 'qs-seg-label qs-seg-label-on'}>
              每题限时
            </Text>
          </View>
        </View>
      </View>
      <View className="qs-duration">
        <Text className="qs-field">{paper ? '总时长（分钟）' : '每题限时（秒）'}</Text>
        <View className="qs-stepper">
          <View className="qs-step">
            <Text className="qs-step-sign">−</Text>
          </View>
          <View className="qs-step-val">
            <Text className="qs-step-num">{amount}</Text>
          </View>
          <View className="qs-step-plus">
            <Text className="qs-step-sign">+</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function GhostChip(props: { label: string; on: boolean; count?: boolean }) {
  return (
    <View className={classes('qs-chip', props.count && 'qs-chip-count', props.on && 'qs-chip-on')}>
      <Text className={classes('qs-chip-label', props.on && 'qs-chip-label-on')}>
        {props.label}
      </Text>
    </View>
  );
}

function metaLines(session: QuizSessionView): { topic: string; timer: string } {
  const name = session.context.certName || session.context.packName;
  const types = session.settings.types.map((item) => QUIZ_TYPE_LABELS[item]).join('+');
  const topic = types
    ? `${name} · ${QUIZ_DIFFICULTY_LABELS[session.settings.difficulty]} · ${types}`
    : `${name} · ${QUIZ_DIFFICULTY_LABELS[session.settings.difficulty]}`;
  return { topic, timer: timerLabel(session.settings.timer) };
}

function timerLabel(timer: QuizTimer): string {
  if (!timer.enabled) {
    return '不限时';
  }
  if (timer.kind === 'paper') {
    return `限时 ${timer.paperMinutes} 分钟`;
  }
  return `每题 ${timer.perQuestionSeconds} 秒`;
}

function isListedCount(value: number): value is QuizCount {
  return value === 10 || value === 20 || value === 30 || value === 50;
}

function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}
