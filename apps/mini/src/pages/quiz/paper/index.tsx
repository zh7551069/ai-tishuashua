import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_OUTCOME_LABELS,
  QUIZ_TYPE_LABELS,
  type QuizQuestionView,
  type QuizSessionView,
  type QuizSubmitReason,
} from '@tishuashua/shared';
import { useEffect, useRef, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { LeaveOverlay, SubmitOverlay } from '../paper-dialog';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { formatSubmittedAt } from '../../../services/format';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { HttpError } from '../../../services/http';
import { queryValue } from '../../../services/query';
import {
  fetchQuizSession,
  saveQuizAnswer,
  startQuizSession,
  submitQuizSession,
} from '../../../services/quiz-api';
import { bandHeadline, scoreBand } from '../../../ui/score-band';

export default function QuizPaperPage() {
  const sessionId = queryValue(useRouter().params.sessionId);
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [board, setBoard] = useState(false);
  const [review, setReview] = useState(false);
  const [openAnalysis, setOpenAnalysis] = useState<Record<string, boolean>>({});
  const [leftSeconds, setLeftSeconds] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'submit' | 'leave' | null>(null);
  const submitting = useRef(false);
  const timeoutSent = useRef(false);
  const handInRef = useRef<(reason: QuizSubmitReason) => Promise<void>>(async () => undefined);

  const load = async () => {
    if (!sessionId) {
      setError('缺少试卷');
      return;
    }
    setError('');
    try {
      const loaded = await withAuth(async (token) => {
        const current = await fetchQuizSession(token, sessionId);
        if (current.status === 'ready' || current.status === 'in_progress') {
          return startQuizSession(token, sessionId);
        }
        return current;
      });
      if (!loaded) {
        return;
      }
      setSession(loaded);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '试卷加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  useEffect(() => {
    timeoutSent.current = false;
    submitting.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!session || session.status === 'submitted') {
      return;
    }
    const deadlineMs = session.deadlineAt ? Date.parse(session.deadlineAt) : Number.NaN;
    const practiceEnd = practiceEndsAt(session);
    const endMs = Number.isFinite(deadlineMs) ? deadlineMs : practiceEnd;
    if (endMs === null) {
      setLeftSeconds(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
      setLeftSeconds(left);
      if (left === 0 && Number.isFinite(deadlineMs) && !timeoutSent.current) {
        timeoutSent.current = true;
        void handInRef.current('timeout');
      }
    };
    tick();
    const handle = setInterval(tick, 1000);
    return () => clearInterval(handle);
  }, [session]);

  const choose = async (question: QuizQuestionView, optionId: string) => {
    if (!session || session.status === 'submitted') {
      return;
    }
    const next =
      question.type === 'multi'
        ? question.selected.includes(optionId)
          ? question.selected.filter((id) => id !== optionId)
          : [...question.selected, optionId]
        : question.selected[0] === optionId
          ? []
          : [optionId];
    setSession(replaceSelection(session, question.id, next));
    try {
      await withAuth((token) =>
        saveQuizAnswer(token, session.id, { questionId: question.id, selected: next }),
      );
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      if (caught instanceof HttpError && caught.status === 409) {
        await load();
        return;
      }
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '保存失败',
        icon: 'none',
      });
    }
  };

  const handIn = async (reason: QuizSubmitReason) => {
    if (!sessionId || submitting.current) {
      return;
    }
    submitting.current = true;
    try {
      const next = await withAuth((token) => submitQuizSession(token, sessionId, { reason }));
      if (next) {
        setSession(next);
        setBoard(false);
        setReview(false);
      }
    } catch (caught) {
      submitting.current = false;
      if (isAuthFailure(caught)) {
        return;
      }
      if (reason === 'timeout') {
        await load();
        return;
      }
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '交卷失败',
        icon: 'none',
      });
    }
  };
  handInRef.current = handIn;

  const paper = session?.paper;
  const questions = paper?.questions ?? [];
  const submitted = session?.status === 'submitted';
  const current = questions[Math.min(index, Math.max(questions.length - 1, 0))];
  const unanswered = questions.filter((item) => item.selected.length === 0).length;

  const goBack = () => {
    void Taro.navigateBack({
      fail: () => {
        void Taro.reLaunch({ url: '/pages/home/index' });
      },
    });
  };

  const leave = () => {
    if (submitted) {
      goBack();
      return;
    }
    setDialog('leave');
  };

  return (
    <Screen
      back
      onBack={leave}
      centerTitle={Boolean(submitted)}
      title={submitted ? (review ? '错题回顾' : '答题结果') : '答题'}
      right={
        submitted && review ? (
          <Text className="u-mode">{wrongQuestions(questions).length} 题</Text>
        ) : session ? (
          <Text className={submitted ? 'u-mode u-mode-brand' : 'u-mode'}>
            {QUIZ_MODE_LABELS[session.mode]}
          </Text>
        ) : null
      }
      footer={footer({
        submitted,
        review,
        session,
        index,
        total: questions.length,
        onPrev: () => setIndex((value) => Math.max(0, value - 1)),
        onNext: () => setIndex((value) => Math.min(questions.length - 1, value + 1)),
        onBoard: () => setBoard(true),
        onSubmit: () => setDialog('submit'),
        onHome: () => void Taro.reLaunch({ url: '/pages/home/index' }),
        onReview: () => setReview(true),
        onBackResult: () => setReview(false),
      })}
    >
      <View className="u-pad u-pad-tight">
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} onBack={leave} /> : null}
        {!session && !error ? <LoadingBlock label="正在加载试卷" /> : null}
        {session && !paper ? (
          <ErrorBlock title="试卷还没准备好" onRetry={() => void load()} />
        ) : null}
        {session && paper && submitted && !review ? (
          <ResultView session={session} onReview={() => setReview(true)} />
        ) : null}
        {session && paper && submitted && review ? (
          <ReviewView
            session={session}
            open={openAnalysis}
            onToggle={(id) =>
              setOpenAnalysis((currentMap) => ({ ...currentMap, [id]: !currentMap[id] }))
            }
          />
        ) : null}
        {session && paper && !submitted && current ? (
          <QuestionView
            session={session}
            question={current}
            index={index}
            total={questions.length}
            leftSeconds={leftSeconds}
            onChoose={(optionId) => void choose(current, optionId)}
          />
        ) : null}
      </View>
      {board && !submitted ? (
        <View className="u-sheet-mask" onClick={() => setBoard(false)}>
          <View className="u-sheet" onClick={(event) => event.stopPropagation()}>
            <Text className="u-sheet-title">题号跳转</Text>
            <View className="u-board">
              {questions.map((question, questionIndex) => {
                const done = question.selected.length > 0;
                const on = questionIndex === index;
                return (
                  <Text
                    key={question.id}
                    className={
                      on
                        ? 'u-board-cell u-board-on'
                        : done
                          ? 'u-board-cell u-board-done'
                          : 'u-board-cell'
                    }
                    onClick={() => {
                      setIndex(questionIndex);
                      setBoard(false);
                    }}
                  >
                    {question.ordinal}
                  </Text>
                );
              })}
            </View>
            <Button
              className="u-btn"
              style={{ marginTop: '8px' }}
              onClick={() => setDialog('submit')}
            >
              交卷
            </Button>
          </View>
        </View>
      ) : null}
      {dialog === 'submit' && session ? (
        <SubmitOverlay
          mode={session.mode}
          timerOn={session.settings.timer.enabled}
          answered={questions.length - unanswered}
          unanswered={unanswered}
          total={questions.length}
          onContinue={() => setDialog(null)}
          onSubmit={() => {
            setDialog(null);
            void handIn('manual');
          }}
        />
      ) : null}
      {dialog === 'leave' ? (
        <LeaveOverlay
          mode={session?.mode ?? 'practice'}
          answered={questions.length - unanswered}
          total={questions.length}
          onContinue={() => setDialog(null)}
          onLeave={() => {
            setDialog(null);
            goBack();
          }}
        />
      ) : null}
    </Screen>
  );
}

function footer(props: {
  submitted: boolean;
  review: boolean;
  session: QuizSessionView | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBoard: () => void;
  onSubmit: () => void;
  onHome: () => void;
  onReview: () => void;
  onBackResult: () => void;
}) {
  if (!props.session?.paper) {
    return null;
  }
  if (props.submitted && props.review) {
    return (
      <Button className="u-btn-ghost" onClick={props.onBackResult}>
        返回结果
      </Button>
    );
  }
  if (props.submitted) {
    return (
      <View className="u-foot-row">
        <Button className="u-btn-ghost" onClick={props.onHome}>
          回首页
        </Button>
        <View className="u-foot-gap" />
        <Button className="u-btn-danger" onClick={props.onReview}>
          错题回顾
        </Button>
      </View>
    );
  }
  return (
    <View className="u-foot-row">
      <Button className="u-btn-ghost" disabled={props.index === 0} onClick={props.onPrev}>
        上一题
      </Button>
      <View className="u-foot-gap" />
      {props.index < props.total - 1 ? (
        <Button className="u-btn" onClick={props.onNext}>
          下一题
        </Button>
      ) : (
        <Button className="u-btn" onClick={props.onSubmit}>
          交卷
        </Button>
      )}
      <View className="u-foot-gap" />
      <Button className="u-btn-ghost" onClick={props.onBoard}>
        题板
      </Button>
    </View>
  );
}

function QuestionView(props: {
  session: QuizSessionView;
  question: QuizQuestionView;
  index: number;
  total: number;
  leftSeconds: number | null;
  onChoose: (optionId: string) => void;
}) {
  const timer = props.session.settings.timer;
  const progress = props.total > 0 ? Math.round(((props.index + 1) / props.total) * 100) : 0;
  return (
    <View>
      <View className="u-panel">
        <View className="u-q-head">
          <View>
            <Text className="u-note">
              {timer.enabled && timer.kind === 'paper'
                ? '整卷倒计时'
                : timer.enabled
                  ? '每题限时'
                  : '不限时'}
            </Text>
            {props.leftSeconds !== null ? (
              <Text className="u-clock">{formatClock(props.leftSeconds)}</Text>
            ) : (
              <Text className="u-clock">不限时</Text>
            )}
          </View>
          <Text className="u-meta">
            第 {props.index + 1} / {props.total} 题
          </Text>
        </View>
        <View className="u-bar">
          <View className="u-bar-fill" style={{ width: `${progress}%` }} />
        </View>
      </View>
      <Text className="u-tag u-tag-lg u-tag-blue">{QUIZ_TYPE_LABELS[props.question.type]}</Text>
      <Text className="u-stem">{props.question.stem}</Text>
      {props.question.options.map((option) => {
        const selected = props.question.selected.includes(option.id);
        return (
          <View
            key={option.id}
            className={selected ? 'u-option u-option-on' : 'u-option'}
            onClick={() => props.onChoose(option.id)}
          >
            <Text className={selected ? 'u-letter u-letter-on' : 'u-letter'}>{option.id}</Text>
            <Text className="u-option-text">{option.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ResultView(props: { session: QuizSessionView; onReview: () => void }) {
  const result = props.session.result;
  const questions = props.session.paper?.questions ?? [];
  const wrong = wrongQuestions(questions);
  if (!result) {
    return <Text className="u-meta">这次交卷没有可用的分数。</Text>;
  }
  const band = scoreBand({
    mode: props.session.mode,
    passed: result.passed,
    scoreRate: result.scoreRate,
  });
  const rate = Math.round(result.scoreRate * 100);
  const duration = elapsed(props.session);
  return (
    <View>
      <Text className={`u-banner u-banner-${band}`}>{bandHeadline(band, props.session.mode)}</Text>
      <View className="u-pack-mini">
        <Text className="u-kicker-sm">刷题包</Text>
        <Text className="u-title-13">
          {props.session.context.certName || props.session.context.packName}
        </Text>
      </View>
      <View className="u-hero">
        <View className="u-ring" style={{ background: ringColor(band, rate) }}>
          <View className="u-ring-hole">
            <Text className={`u-ring-num u-band-${band}`}>{rate}%</Text>
            <Text className="u-ring-sub">
              {result.correctCount}/{result.questionCount} 题
            </Text>
          </View>
        </View>
        <View className="u-card-copy">
          <Text className="u-meta">
            得分 {result.earnedScore}/{result.totalScore}
          </Text>
          <Text className="u-meta">
            正确 {result.correctCount} · 错误 {result.wrongCount + result.partialCount}
          </Text>
          <Text className="u-note">
            {result.passScore === null ? '未设及格线' : `及格线 ${result.passScore}`} ·{' '}
            {formatSubmittedAt(result.submittedAt)}
          </Text>
        </View>
      </View>
      {wrong.length > 0 ? (
        <View className="u-wrong-entry" onClick={props.onReview}>
          <View className="u-danger-dot">!</View>
          <View className="u-card-copy">
            <Text className="u-card-title">错题回顾</Text>
            <Text className="u-card-sub">{wrong.length} 道错题 · 含解析</Text>
          </View>
          <Text className="u-chev">›</Text>
        </View>
      ) : (
        <Text className="u-meta">本卷没有错题。</Text>
      )}
      {duration ? (
        <View className="u-panel" style={{ marginTop: '12px' }}>
          <Text className="u-note">用时</Text>
          <Text className="u-clock">{duration.label}</Text>
          {duration.limit ? <Text className="u-note">/ {duration.limit}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function ReviewView(props: {
  session: QuizSessionView;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const questions = wrongQuestions(props.session.paper?.questions ?? []);
  return (
    <View>
      <View className="u-panel">
        <Text className="u-kicker-sm">来自本卷</Text>
        <Text className="u-card-title">
          {props.session.context.certName || props.session.context.packName} ·{' '}
          {QUIZ_MODE_LABELS[props.session.mode]}模式
        </Text>
      </View>
      {questions.length === 0 ? <Text className="u-meta">本卷没有错题。</Text> : null}
      {questions.map((question) => (
        <View key={question.id} className="u-panel">
          <View className="u-q-head">
            <View className="u-chips">
              <Text className="u-tag u-tag-gray">第 {question.ordinal} 题</Text>
              <Text className={typeTag(question.type)}>{QUIZ_TYPE_LABELS[question.type]}</Text>
            </View>
            {question.review ? (
              <Text className="u-note">{QUIZ_OUTCOME_LABELS[question.review.outcome]}</Text>
            ) : null}
          </View>
          <Text className="u-stem">{question.stem}</Text>
          <View className="u-compare">
            <Text className="u-compare-label u-mine">你的答案</Text>
            <Text className="u-compare-value u-mine">
              {answerLine(question, question.selected)}
            </Text>
            <Text className="u-compare-label u-right" style={{ marginTop: '8px' }}>
              正确答案
            </Text>
            <Text className="u-compare-value u-right">
              {answerLine(question, question.review?.answer ?? [])}
            </Text>
          </View>
          <View className="u-parse-btn" onClick={() => props.onToggle(question.id)}>
            <Text>{props.open[question.id] ? '收起解析' : '查看解析'}</Text>
            <Text>{props.open[question.id] ? '▾' : '›'}</Text>
          </View>
          {props.open[question.id] ? (
            <View className="u-analysis">
              <View className="u-analysis-bar" />
              <View className="u-analysis-copy">
                <Text className="u-analysis-title">解析</Text>
                <Text className="u-analysis-body">
                  {question.review?.analysis || '这道题没有解析。'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function wrongQuestions(questions: QuizQuestionView[]): QuizQuestionView[] {
  return questions.filter((question) => question.review && question.review.outcome !== 'correct');
}

function answerLine(question: QuizQuestionView, ids: string[]): string {
  if (ids.length === 0) {
    return '未作答';
  }
  return ids
    .map((id) => {
      const option = question.options.find((item) => item.id === id);
      return option ? `${id} · ${option.text}` : id;
    })
    .join('  ');
}

function typeTag(type: QuizQuestionView['type']): string {
  if (type === 'multi') {
    return 'u-tag u-tag-violet';
  }
  if (type === 'judge') {
    return 'u-tag u-tag-orange';
  }
  return 'u-tag u-tag-blue';
}

function ringColor(band: ReturnType<typeof scoreBand>, rate: number): string {
  const color =
    band === 'high'
      ? '#16a34a'
      : band === 'fail'
        ? '#dc2626'
        : band === 'low'
          ? '#ea580c'
          : '#2563eb';
  return `conic-gradient(${color} ${rate * 3.6}deg, #e5e7eb 0deg)`;
}

function elapsed(session: QuizSessionView): { label: string; limit: string | null } | null {
  if (!session.startedAt || !session.result) {
    return null;
  }
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.result.submittedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const timer = session.settings.timer;
  const limit =
    timer.enabled && timer.kind === 'paper' ? formatClock(timer.paperMinutes * 60) : null;
  return { label: formatClock(Math.round((end - start) / 1000)), limit };
}

function replaceSelection(
  session: QuizSessionView,
  questionId: string,
  selected: string[],
): QuizSessionView {
  if (!session.paper) {
    return session;
  }
  return {
    ...session,
    paper: {
      ...session.paper,
      questions: session.paper.questions.map((question) =>
        question.id === questionId ? { ...question, selected } : question,
      ),
    },
  };
}

function practiceEndsAt(session: QuizSessionView): number | null {
  const timer = session.settings.timer;
  if (
    session.mode !== 'practice' ||
    !timer.enabled ||
    timer.kind !== 'paper' ||
    !session.startedAt
  ) {
    return null;
  }
  const start = Date.parse(session.startedAt);
  if (!Number.isFinite(start)) {
    return null;
  }
  return start + timer.paperMinutes * 60_000;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
