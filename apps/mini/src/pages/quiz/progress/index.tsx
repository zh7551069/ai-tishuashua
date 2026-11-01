import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import type { QuizSessionView } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { MiniPage } from '../../../components/MiniPage';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { cancelQuizSession, fetchQuizSession } from '../../../services/quiz-api';

export default function QuizProgressPage() {
  const sessionId = queryValue(useRouter().params.sessionId);
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
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
    const confirmed = await Taro.showModal({
      title: '取消出题',
      content: '取消后会丢弃未完成的试卷。',
      confirmText: '取消出题',
      confirmColor: '#b42318',
    });
    if (!confirmed.confirm) {
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
  const percent = total > 0 ? Math.min(100, Math.round((generated / total) * 100)) : 0;
  const failed = session?.status === 'failed';

  return (
    <MiniPage
      title="正在出题"
      hint={failed ? '这次没有生成试卷。' : '正在按知识点原创题目，可以取消。'}
    >
      {error ? <Text className="error">{error}</Text> : null}
      {failed && session?.error ? <Text className="error">{session.error.message}</Text> : null}
      {!failed ? (
        <View className="card">
          <Text className="tree-name">
            已生成 {generated}/{total || '…'}
          </Text>
          <View className="bar">
            <View className="bar-fill" style={{ width: `${percent}%` }} />
          </View>
          <Text className="meta">
            {session ? statusText(session.status) : '正在连接出题任务。'}
          </Text>
        </View>
      ) : null}
      {failed ? (
        <Button className="primary" onClick={() => void Taro.navigateBack()}>
          返回设置
        </Button>
      ) : (
        <Button className="danger" disabled={cancelling} onClick={() => void cancel()}>
          取消出题
        </Button>
      )}
    </MiniPage>
  );
}

function statusText(status: QuizSessionView['status']): string {
  if (status === 'pending') {
    return '已排队，等待开始生成。';
  }
  if (status === 'generating') {
    return '正在写入题目。取消会丢弃已生成的部分。';
  }
  return '正在更新进度。';
}
