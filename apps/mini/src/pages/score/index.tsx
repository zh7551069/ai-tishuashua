import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_SUBMIT_REASON_LABELS,
  type QuizScoreSummary,
} from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { formatSubmittedAt } from '../../services/format';
import { isAuthFailure } from '../../services/guard';
import { fetchQuizScores } from '../../services/quiz-api';
import { clearToken, readToken } from '../../services/session';

export default function ScorePage() {
  const [items, setItems] = useState<QuizScoreSummary[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);

  const load = async () => {
    setError('');
    const token = readToken();
    if (!token) {
      setGuest(true);
      setItems([]);
      setReady(true);
      return;
    }
    setGuest(false);
    try {
      const data = await fetchQuizScores(token);
      setItems(data.items);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        clearToken();
        setGuest(true);
        setItems([]);
        setError('');
        setReady(true);
        return;
      }
      setGuest(false);
      setReady(false);
      setItems([]);
      setError(caught instanceof Error ? caught.message : '成绩加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  return (
    <MiniPage title="成绩" hint="这里是已交卷的成绩。点进去可以看正确答案和解析。">
      {guest ? <GuestScore /> : null}
      {!guest && error ? <Text className="error">{error}</Text> : null}
      {!guest && !ready && !error ? <Text className="hint">正在加载成绩。</Text> : null}
      {!guest && ready && items.length === 0 ? <EmptyScore /> : null}
      {!guest && ready
        ? items.map((item) => {
            const heading = scoreHeading(item);
            return (
              <View
                key={item.id}
                className="card"
                onClick={() =>
                  void Taro.navigateTo({ url: `/pages/quiz/paper/index?sessionId=${item.id}` })
                }
              >
                <Text className="tree-name">{heading.title}</Text>
                <Text className="meta">{heading.subtitle}</Text>
                <Text className="score-num">
                  {item.earnedScore}
                  <Text className="score-total"> / {item.totalScore}</Text>
                </Text>
                <Text className="meta">
                  正确率 {percent(item.accuracy)} · 得分率 {percent(item.scoreRate)} · 正确{' '}
                  {item.correctCount}/{item.questionCount}
                </Text>
                <Text className="meta">
                  {passText(item)} · {QUIZ_SUBMIT_REASON_LABELS[item.reason]}
                </Text>
                <Text className="meta">交卷 {formatSubmittedAt(item.submittedAt)}</Text>
                <Text className="meta">查看解析</Text>
              </View>
            );
          })
        : null}
      {!guest && error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}

function GuestScore() {
  return (
    <View>
      <View className="card">
        <Text className="tree-name">登录后查看成绩</Text>
        <Text className="meta">已交卷的分数、时间和解析只对当前微信账号可见。</Text>
      </View>
      <Button className="primary" onClick={() => void Taro.reLaunch({ url: '/pages/login/index' })}>
        去登录
      </Button>
    </View>
  );
}

function EmptyScore() {
  return (
    <View>
      <View className="card">
        <Text className="tree-name">还没有交卷记录</Text>
        <Text className="meta">完成一次练习或考试后，成绩会出现在这里。</Text>
      </View>
      <Button
        className="primary"
        onClick={() => {
          void Taro.navigateBack({
            fail: () => {
              void Taro.reLaunch({ url: '/pages/home/index' });
            },
          });
        }}
      >
        去刷题
      </Button>
    </View>
  );
}

function scoreHeading(item: QuizScoreSummary): { title: string; subtitle: string } {
  const mode = QUIZ_MODE_LABELS[item.mode];
  const cert = item.certName.trim();
  const pack = item.packName.trim();
  if (cert && pack && cert !== pack) {
    return { title: cert, subtitle: `${pack} · ${mode}` };
  }
  return { title: cert || pack || '一次刷题', subtitle: mode };
}

function passText(item: QuizScoreSummary): string {
  const verdict = item.passed === null ? '未设及格线' : item.passed ? '及格' : '未及格';
  return item.passScore === null ? verdict : `${verdict} · 及格线 ${item.passScore}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
