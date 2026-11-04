import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import { QUIZ_DIFFICULTY_LABELS, QUIZ_TYPE_LABELS, type QuizSessionView } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Screen } from '../../../components/Screen';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { cancelQuizSession, fetchQuizSession } from '../../../services/quiz-api';

export default function QuizProgressPage() {
  const sessionId = queryValue(useRouter().params.sessionId);
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
    if (!sessionId || stopped.current) {
      return;
    }
    try {
      const next = await withAuth((token) => fetchQuizSession(token, sessionId));
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

  const generated = session?.progress.generated ?? 0;
  const total = session?.progress.total ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((generated / total) * 100)) : 8;
  const failed = session?.status === 'failed' || Boolean(error);

  return (
    <Screen back title="出题设置" navPlain>
      <View className="u-scrim" />
      <View className="u-center-card">
        {failed ? <View className="u-fail-lg">!</View> : <View className="u-spin" />}
        <Text className="u-state-title">{failed ? '出题失败' : '正在出题…'}</Text>
        <Text className="u-state-sub">
          {failed ? session?.error?.message || error || '这次没有生成试卷。' : '预计很快完成'}
        </Text>
        {!failed ? (
          <Text className="u-link" style={{ marginTop: '12px' }}>
            已生成 {generated} / {total || '…'}
          </Text>
        ) : null}
        {!failed ? (
          <View className="u-bar" style={{ width: '100%' }}>
            <View className="u-bar-fill" style={{ width: `${percent}%` }} />
          </View>
        ) : null}
        {session ? <Text className="u-note">{metaLine(session)}</Text> : null}
        {failed ? (
          <Button className="u-btn" style={{ marginTop: '23px', width: '100%' }} onClick={() => void Taro.navigateBack()}>
            返回设置
          </Button>
        ) : (
          <Button
            className="u-btn-ghost"
            style={{ marginTop: '23px', width: '100%' }}
            disabled={cancelling}
            onClick={() => setConfirming(true)}
          >
            取消
          </Button>
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

function metaLine(session: QuizSessionView): string {
  const types = session.settings.types.map((item) => QUIZ_TYPE_LABELS[item]).join('+');
  const timer = session.settings.timer.enabled
    ? session.settings.timer.kind === 'paper'
      ? `限时 ${session.settings.timer.paperMinutes} 分钟`
      : `每题 ${session.settings.timer.perQuestionSeconds} 秒`
    : '不限时';
  return `${session.context.certName || session.context.packName} · ${QUIZ_DIFFICULTY_LABELS[session.settings.difficulty]} · ${types} · ${timer}`;
}
