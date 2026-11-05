import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import {
  QUIZ_COUNTS,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_TYPE_LABELS,
  type QuizSessionView,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Screen } from '../../../components/Screen';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { cancelQuizSession, createQuizSession, fetchQuizSession } from '../../../services/quiz-api';
import { isQuizType, variantProgressUrl, variantSessionInput } from '../../../services/retrain';

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
  const [confirming, setConfirming] = useState(false);
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

  useDidShow(() => {
    if (timer.current) {
      clearInterval(timer.current);
    }
    stopped.current = false;
    void poll();
    timer.current = setInterval(() => {
      void poll();
    }, 1500);
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
        stopped.current = false;
        void poll();
        timer.current = setInterval(() => {
          void poll();
        }, 1500);
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
  const headline = session?.context.certName || session?.context.packName || '题型变异';

  return (
    <Screen back title="出题设置" navPlain>
      {isVariant ? (
        <View className="u-progress-lock">
          <SettingsBackdrop headline={headline} />
        </View>
      ) : null}
      <View className="u-scrim" onClick={() => undefined} />
      <View className={isVariant ? 'u-center-card u-center-card-float' : 'u-center-card'}>
        {isVariant ? (
          <VariantCard
            failed={failed}
            percent={percent}
            message={session?.error?.message || error}
            cancelling={cancelling}
            retrying={retrying}
            onCancel={() => setConfirming(true)}
            onRetry={() => void retryVariant()}
            onBack={backToDetail}
          />
        ) : (
          <NormalCard
            failed={failed}
            percent={percent}
            generated={generated}
            total={total}
            message={session?.error?.message || error}
            session={session}
            cancelling={cancelling}
            onCancel={() => setConfirming(true)}
          />
        )}
      </View>
      {confirming ? (
        <ConfirmDialog
          title="取消出题"
          body="取消后会丢弃未完成的试卷。"
          confirmText="取消出题"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void cancel();
          }}
        />
      ) : null}
    </Screen>
  );
}

function NormalCard(props: {
  failed: boolean;
  percent: number;
  generated: number;
  total: number;
  message: string;
  session: QuizSessionView | null;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <View style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {props.failed ? <View className="u-fail-lg">!</View> : <View className="u-spin" />}
      <Text className="u-state-title">{props.failed ? '出题失败' : '正在出题…'}</Text>
      <Text className="u-state-sub">
        {props.failed ? props.message || '这次没有生成试卷。' : '预计很快完成'}
      </Text>
      {!props.failed ? (
        <Text className="u-link" style={{ marginTop: '6px' }}>
          已生成 {props.generated} / {props.total || '…'}
        </Text>
      ) : null}
      {!props.failed ? (
        <View className="u-bar" style={{ width: '100%' }}>
          <View className="u-bar-fill" style={{ width: `${props.percent}%` }} />
        </View>
      ) : null}
      {props.session ? <Text className="u-note">{metaLine(props.session)}</Text> : null}
      {props.failed ? (
        <Button
          className="u-btn"
          style={{ marginTop: '12px', width: '100%' }}
          onClick={() => void Taro.navigateBack()}
        >
          返回设置
        </Button>
      ) : (
        <Button
          className="u-btn-ghost"
          style={{ marginTop: '12px', width: '100%' }}
          disabled={props.cancelling}
          onClick={props.onCancel}
        >
          取消
        </Button>
      )}
    </View>
  );
}

function VariantCard(props: {
  failed: boolean;
  percent: number;
  message: string;
  cancelling: boolean;
  retrying: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const detail = props.message || '题目未能生成，可重试（将开启新会话）';
  if (props.failed) {
    return (
      <View
        style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <View className="u-fail-lg">!</View>
        <Text className="u-state-title">变异题生成失败</Text>
        <Text className="u-state-sub">{detail}</Text>
        {detail === '题目未能生成，可重试（将开启新会话）' ? null : (
          <Text className="u-note">可重试（将开启新会话）</Text>
        )}
        <Text className="u-keep-note">已生成进度不会保留</Text>
        <Button
          className="u-btn"
          style={{ marginTop: '12px', width: '100%' }}
          loading={props.retrying}
          disabled={props.retrying}
          onClick={props.onRetry}
        >
          重新生成
        </Button>
        <Text className="u-link" style={{ marginTop: '12px' }} onClick={props.onBack}>
          返回详情
        </Text>
      </View>
    );
  }
  return (
    <View style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <View className="u-spin" />
      <Text className="u-state-title">正在生成变异题…</Text>
      <Text className="u-link" style={{ marginTop: '6px' }}>
        基于本题换题型或语境
      </Text>
      <Text className="u-link" style={{ marginTop: '4px' }}>
        预计很快完成
      </Text>
      <View className="u-bar" style={{ width: '100%' }}>
        <View className="u-bar-fill" style={{ width: `${props.percent}%` }} />
      </View>
      <Text className="u-note">题型变异 · 练习 · 1 题</Text>
      <Text className="u-note">答对不消灭原错题</Text>
      <Button
        className="u-btn-ghost"
        style={{ marginTop: '12px', width: '100%' }}
        disabled={props.cancelling}
        onClick={props.onCancel}
      >
        取消
      </Button>
    </View>
  );
}

/** B1：出题设置只作底衬。没有点击处理，并盖在蒙层下面。 */
function SettingsBackdrop(props: { headline: string }) {
  return (
    <View className="u-settings-ghost">
      <View className="u-pad u-pad-quiz">
        <View className="u-pack-mini">
          <Text className="u-kicker-sm">当前刷题包</Text>
          <Text className="u-pack-line">
            {props.headline}
          </Text>
        </View>
        <View className="u-panel">
          <Text className="u-label">题量</Text>
          <View className="u-pills">
            {QUIZ_COUNTS.map((item) => (
              <Text key={item} className={item === 20 ? 'u-pill u-pill-on' : 'u-pill'}>
                {item}
              </Text>
            ))}
          </View>
        </View>
      </View>
      <View className="u-foot">
        <View className="u-btn">AI 开始出题</View>
      </View>
    </View>
  );
}

function metaLine(session: QuizSessionView): string {
  const types = session.settings.types.map((item) => QUIZ_TYPE_LABELS[item]).join('+');
  const timer = session.settings.timer.enabled
    ? session.settings.timer.kind === 'paper'
      ? `限时 ${session.settings.timer.paperMinutes} 分钟`
      : `每题 ${session.settings.timer.perQuestionSeconds} 秒`
    : '不限时';
  return `${session.context.certName || session.context.packName} · ${QUIZ_DIFFICULTY_LABELS[session.settings.difficulty]} · ${types} · ${timer}`;
}
