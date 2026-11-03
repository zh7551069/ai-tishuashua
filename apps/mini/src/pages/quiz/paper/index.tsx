import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_OUTCOME_LABELS,
  QUIZ_SUBMIT_REASON_LABELS,
  QUIZ_TYPE_LABELS,
  type QuizQuestionView,
  type QuizSessionView,
  type QuizSubmitReason,
} from '@tishuashua/shared';
import { useEffect, useRef, useState } from 'react';
import { MiniPage } from '../../../components/MiniPage';
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

export default function QuizPaperPage() {
  const sessionId = queryValue(useRouter().params.sessionId);
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [error, setError] = useState('');
  const [leftSeconds, setLeftSeconds] = useState<number | null>(null);
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

  const confirmSubmit = async () => {
    const result = await Taro.showModal({
      title: '交卷',
      content: '交卷后不能再改答案，并会显示成绩和解析。',
      confirmText: '交卷',
    });
    if (!result.confirm) {
      return;
    }
    await handIn('manual');
  };

  const paper = session?.paper;
  const timer = session?.settings.timer;
  const submitted = session?.status === 'submitted';
  return (
    <MiniPage
      title={submitted ? '成绩' : session ? `${QUIZ_MODE_LABELS[session.mode]}答题` : '答题'}
      hint={
        submitted
          ? '下面是得分、正确答案和解析。答错的题已经写入错题本。'
          : '选完后可以交卷。未交卷不会看到正确答案。'
      }
    >
      {error ? <Text className="error">{error}</Text> : null}
      {!session && !error ? <Text className="hint">正在加载试卷。</Text> : null}
      {session && !paper ? <Text className="error">试卷还没准备好。</Text> : null}
      {session && paper ? (
        <View>
          {session.result ? <ResultCard session={session} /> : null}
          <View className="card">
            <Text className="tree-name">
              {session.context.certName || session.context.packName}
            </Text>
            <Text className="meta">
              {paper.questions.length} 题 · 总分 {paper.totalScore}
            </Text>
            {!submitted && session.mode === 'exam' && session.deadlineAt ? (
              <Text className={leftSeconds === 0 ? 'error' : 'meta'}>
                {leftSeconds === 0
                  ? '时间到，正在收卷。'
                  : `${timer?.enabled && timer.kind === 'per_question' ? '考试' : '整卷'}剩余 ${formatClock(leftSeconds ?? 0)}`}
              </Text>
            ) : null}
            {!submitted &&
            session.mode === 'practice' &&
            timer?.enabled &&
            timer.kind === 'paper' ? (
              <Text className="meta">
                {leftSeconds === 0
                  ? '时间到。练习模式仍可继续作答。'
                  : `整卷剩余 ${formatClock(leftSeconds ?? 0)}`}
              </Text>
            ) : null}
            {!submitted &&
            timer?.enabled &&
            timer.kind === 'per_question' &&
            session.mode === 'practice' ? (
              <Text className="meta">
                每题限时 {timer.perQuestionSeconds} 秒。练习模式不强制收卷。
              </Text>
            ) : null}
            {!submitted && !timer?.enabled ? <Text className="meta">不限时</Text> : null}
          </View>
          {paper.questions.map((question) => (
            <View key={question.id} className="card">
              <Text className="meta">
                {question.ordinal}. {QUIZ_TYPE_LABELS[question.type]} · {question.score} 分
                {question.source === 'wrong_carry' ? ' · 错题' : ''}
                {question.review ? ` · ${QUIZ_OUTCOME_LABELS[question.review.outcome]}` : ''}
                {question.review ? ` · 得 ${question.review.earnedScore} 分` : ''}
              </Text>
              <Text className="tree-name">{question.stem}</Text>
              {question.options.map((option) => {
                const selected = question.selected.includes(option.id);
                return (
                  <View
                    key={option.id}
                    className={optionClass(question, option.id)}
                    onClick={() => void choose(question, option.id)}
                  >
                    <Text className={selected ? 'option-text option-text-on' : 'option-text'}>
                      {option.id}. {option.text}
                      {question.review?.answer.includes(option.id) ? ' · 正确答案' : ''}
                    </Text>
                  </View>
                );
              })}
              {question.review ? (
                <Text className="analysis">{question.review.analysis || '这道题没有解析。'}</Text>
              ) : null}
            </View>
          ))}
          {submitted ? (
            <Button
              className="primary"
              onClick={() => void Taro.navigateTo({ url: '/pages/wrong-book/index' })}
            >
              查看错题本
            </Button>
          ) : (
            <Button className="primary" onClick={() => void confirmSubmit()}>
              交卷
            </Button>
          )}
          <Button className="ghost" onClick={() => void Taro.navigateBack()}>
            返回
          </Button>
        </View>
      ) : null}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}

function ResultCard(props: { session: QuizSessionView }) {
  const result = props.session.result;
  if (!result) {
    return null;
  }
  const passed = result.passed === null ? '未设及格线' : result.passed ? '及格' : '未及格';
  return (
    <View className="card">
      <Text className="score-num">
        {result.earnedScore}
        <Text className="score-total"> / {result.totalScore}</Text>
      </Text>
      <Text className="meta">
        {passed}
        {result.passScore === null ? '' : ` · 及格线 ${result.passScore}`}
      </Text>
      <Text className="meta">
        正确率 {percent(result.accuracy)} · 得分率 {percent(result.scoreRate)}
      </Text>
      <Text className="meta">
        正确 {result.correctCount} · 少选 {result.partialCount} · 答错 {result.wrongCount} · 未作答{' '}
        {result.unansweredCount}
      </Text>
      <Text className="meta">
        {QUIZ_SUBMIT_REASON_LABELS[result.reason]} · {formatSubmittedAt(result.submittedAt)}
      </Text>
    </View>
  );
}

function optionClass(question: QuizQuestionView, optionId: string): string {
  const selected = question.selected.includes(optionId);
  if (!question.review) {
    return selected ? 'option option-on' : 'option';
  }
  if (question.review.answer.includes(optionId)) {
    return 'option option-right';
  }
  if (selected) {
    return 'option option-wrong';
  }
  return 'option';
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

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
