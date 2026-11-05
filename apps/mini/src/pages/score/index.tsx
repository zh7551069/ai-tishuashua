import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_SCORE_LIST_TRUNCATED_HINT,
  QUIZ_SUBMIT_REASON_LABELS,
  type QuizScoreSummary,
} from '@tishuashua/shared';
import { useState } from 'react';
import { Screen } from '../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { formatSubmittedAt } from '../../services/format';
import { isAuthFailure } from '../../services/guard';
import { fetchQuizScores } from '../../services/quiz-api';
import { clearToken, readToken } from '../../services/session';
import { bandHeadline, scoreBand } from '../../ui/score-band';

export default function ScorePage() {
  const [items, setItems] = useState<QuizScoreSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);

  const load = async () => {
    setError('');
    const token = readToken();
    if (!token) {
      setGuest(true);
      setItems([]);
      setHasMore(false);
      setReady(true);
      return;
    }
    setGuest(false);
    try {
      const data = await fetchQuizScores(token);
      setItems(data.items);
      setHasMore(data.hasMore);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        clearToken();
        setGuest(true);
        setItems([]);
        setHasMore(false);
        setError('');
        setReady(true);
        return;
      }
      setGuest(false);
      setReady(false);
      setItems([]);
      setHasMore(false);
      setError(caught instanceof Error ? caught.message : '成绩加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  return (
    <Screen back centerTitle title="成绩">
      <View className="u-pad u-pad-set">
        {guest ? (
          <EmptyBlock
            title="登录后查看成绩"
            detail="已交卷的分数、时间和解析只对当前微信账号可见。"
            action="去登录"
            onAction={() => void Taro.reLaunch({ url: '/pages/login/index' })}
          />
        ) : null}
        {!guest && !ready && !error ? <LoadingBlock label="正在加载成绩" /> : null}
        {!guest && error ? (
          <ErrorBlock detail={error} onRetry={() => void load()} onBack={() => void Taro.navigateBack()} />
        ) : null}
        {!guest && ready && hasMore ? <Text className="u-note">{QUIZ_SCORE_LIST_TRUNCATED_HINT}</Text> : null}
        {!guest && ready && items.length === 0 && !hasMore ? (
          <EmptyBlock
            title="还没有交卷记录"
            detail="完成一次练习或考试后，成绩会出现在这里。"
            action="去刷题"
            onAction={() => {
              void Taro.navigateBack({
                fail: () => {
                  void Taro.reLaunch({ url: '/pages/home/index' });
                },
              });
            }}
          />
        ) : null}
        {!guest && ready
          ? items.map((item) => {
              const band = scoreBand({
                mode: item.mode,
                passed: item.passed,
                scoreRate: item.scoreRate,
              });
              const heading = scoreHeading(item);
              return (
                <View
                  key={item.id}
                  className="u-card"
                  onClick={() =>
                    void Taro.navigateTo({ url: `/pages/quiz/paper/index?sessionId=${item.id}` })
                  }
                >
                  <View className="u-card-copy">
                    <Text className={`u-kicker u-band-${band}`}>{bandHeadline(band, item.mode)}</Text>
                    <Text className="u-card-title">{heading.title}</Text>
                    <Text className="u-card-sub">{heading.subtitle}</Text>
                    <Text className="u-clock">
                      {item.earnedScore}
                      <Text className="u-note"> / {item.totalScore}</Text>
                    </Text>
                    <Text className="u-card-sub">
                      正确率 {percent(item.accuracy)} · 正确 {item.correctCount}/{item.questionCount} ·{' '}
                      {passText(item)} · {QUIZ_SUBMIT_REASON_LABELS[item.reason]}
                    </Text>
                    <Text className="u-card-sub">交卷 {formatSubmittedAt(item.submittedAt)}</Text>
                  </View>
                  <Text className="u-chev">›</Text>
                </View>
              );
            })
          : null}
      </View>
    </Screen>
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
