import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_SUBMIT_REASON_LABELS,
  type QuizScoreSummary,
} from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchQuizScores } from '../../services/quiz-api';

export default function ScorePage() {
  const [items, setItems] = useState<QuizScoreSummary[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth((token) => fetchQuizScores(token));
      if (!data) {
        return;
      }
      setItems(data.items);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setError(caught instanceof Error ? caught.message : '成绩加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  return (
    <MiniPage title="成绩" hint="这里是已交卷的成绩。点进去可以看正确答案和解析。">
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载成绩。</Text> : null}
      {ready && items.length === 0 ? <Text className="meta">还没有交卷记录。</Text> : null}
      {items.map((item) => (
        <View
          key={item.id}
          className="card"
          onClick={() =>
            void Taro.navigateTo({ url: `/pages/quiz/paper/index?sessionId=${item.id}` })
          }
        >
          <Text className="tree-name">
            {item.certName || item.packName || '一次刷题'} · {QUIZ_MODE_LABELS[item.mode]}
          </Text>
          <Text className="meta">
            {item.earnedScore} / {item.totalScore} · 正确率 {Math.round(item.accuracy * 100)}%
          </Text>
          <Text className="meta">
            {item.passed === null ? '未设及格线' : item.passed ? '及格' : '未及格'} ·{' '}
            {QUIZ_SUBMIT_REASON_LABELS[item.reason]} · 正确 {item.correctCount}/{item.questionCount}
          </Text>
        </View>
      ))}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}
