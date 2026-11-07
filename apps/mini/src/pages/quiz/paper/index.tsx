import { Button, Image, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_OUTCOME_LABELS,
  QUIZ_TYPE_LABELS,
  type QuizMode,
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
import iconBack from '../../../assets/me-settings/3fbuza.svg';
import iconCheck from './assets/check-on.png';
import './index.css';
import {
  PAPER_TAG_LABEL,
  PAPER_TYPE_LABEL,
  cellTone,
  optionFace,
  questionHint,
  type CellTone,
} from './option-state';

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
  const answering = Boolean(session && paper && !submitted && current);

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

  const askSubmit = () => setDialog('submit');

  return (
    <Screen
      bare={!submitted}
      back
      onBack={leave}
      centerTitle={Boolean(submitted)}
      title={submitted ? (review ? '错题回顾' : '答题结果') : '答题'}
      right={
        submitted && review ? (
          <Text className="u-mode">{wrongQuestions(questions).length} 题</Text>
        ) : submitted && session ? (
          <Text className="u-mode u-mode-brand">{QUIZ_MODE_LABELS[session.mode]}</Text>
        ) : null
      }
      footer={
        submitted && paper
          ? resultFooter({
              review,
              onHome: () => void Taro.reLaunch({ url: '/pages/home/index' }),
              onReview: () => setReview(true),
              onBackResult: () => setReview(false),
            })
          : null
      }
    >
      {submitted ? null : <PaperNav mode={session?.mode ?? null} onBack={leave} />}
      <View className={submitted ? 'u-pad u-pad-tight' : 'paper-body'}>
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
        {answering && session && current ? (
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
      {answering ? (
        <AnswerBar
          mode={session?.mode ?? 'practice'}
          index={index}
          total={questions.length}
          onPrev={() => setIndex((value) => Math.max(0, value - 1))}
          onNext={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
          onBoard={() => setBoard(true)}
          onSubmit={askSubmit}
        />
      ) : null}
      {board && !submitted ? (
        <View className="paper-mask" onClick={() => setBoard(false)}>
          <View className="paper-sheet" onClick={(event) => event.stopPropagation()}>
            <View className="paper-handle-wrap">
              <View className="paper-handle" />
            </View>
            <View className="paper-sheet-head">
              <Text className="paper-sheet-title">题目跳转</Text>
              <Text className="paper-sheet-close" onClick={() => setBoard(false)}>
                关闭
              </Text>
            </View>
            <View className="paper-legend">
              <LegendItem tone="right" label="答对" />
              <LegendItem tone="wrong" label="答错" />
              <LegendItem tone="current" label="当前" />
              <LegendItem tone="blank" label="未答" />
            </View>
            <BoardGrid
              questions={questions}
              index={index}
              onPick={(questionIndex) => {
                setIndex(questionIndex);
                setBoard(false);
              }}
            />
            <View className="paper-sheet-submit" onClick={askSubmit}>
              <Text className="paper-sheet-submit-text">交卷</Text>
            </View>
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

function PaperNav(props: { mode: QuizMode | null; onBack: () => void }) {
  return (
    <View className="paper-nav u-pin-nav">
      <View className="u-pin-back" onClick={props.onBack}>
        <Image className="u-back-ico" src={iconBack} mode="aspectFit" />
      </View>
      <Text className="paper-nav-title">答题</Text>
      <View className="u-pin-side">
        {props.mode ? (
          <Text className={props.mode === 'exam' ? 'paper-mode paper-mode-exam' : 'paper-mode'}>
            {QUIZ_MODE_LABELS[props.mode]}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function AnswerBar(props: {
  mode: QuizMode;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onBoard: () => void;
  onSubmit: () => void;
}) {
  const atFirst = props.index <= 0;
  const atLast = props.total === 0 || props.index >= props.total - 1;
  // 稿面非末题是「下一题」。练习末题没有单独的交卷文字钮，主按钮改为交卷，避免只能从题板交卷。
  const practiceHandIn = props.mode !== 'exam' && atLast;
  return (
    <View className="paper-foot">
      <View className="paper-foot-row">
        <View
          className={atFirst ? 'paper-prev paper-btn-off' : 'paper-prev'}
          onClick={atFirst ? undefined : props.onPrev}
        >
          <Text className="paper-prev-text">上一题</Text>
        </View>
        <View
          className={atLast && !practiceHandIn ? 'paper-next paper-btn-off' : 'paper-next'}
          onClick={practiceHandIn ? props.onSubmit : atLast ? undefined : props.onNext}
        >
          <Text className="paper-next-text">{practiceHandIn ? '交卷' : '下一题'}</Text>
        </View>
        {props.mode === 'exam' ? (
          <View className="paper-handin" onClick={props.onSubmit}>
            <Text className="paper-handin-text">交卷</Text>
          </View>
        ) : null}
        <View className="paper-board-btn" onClick={props.onBoard}>
          <Text className="paper-board-text">题板</Text>
        </View>
      </View>
    </View>
  );
}

function resultFooter(props: {
  review: boolean;
  onHome: () => void;
  onReview: () => void;
  onBackResult: () => void;
}) {
  if (props.review) {
    return (
      <Button className="u-btn-ghost" onClick={props.onBackResult}>
        返回结果
      </Button>
    );
  }
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

function QuestionView(props: {
  session: QuizSessionView;
  question: QuizQuestionView;
  index: number;
  total: number;
  leftSeconds: number | null;
  onChoose: (optionId: string) => void;
}) {
  const revealed = props.question.review !== null;
  const hint = questionHint(props.session.mode, props.question.type, revealed);
  return (
    <View className="paper-stack">
      <ProgressCard
        session={props.session}
        index={props.index}
        total={props.total}
        leftSeconds={props.leftSeconds}
      />
      <View className="paper-question">
        <View className="paper-type-row">
          <Text
            className={
              props.session.mode === 'exam' ? 'paper-badge paper-badge-exam' : 'paper-badge'
            }
          >
            {PAPER_TYPE_LABEL[props.question.type]}
          </Text>
          {hint ? <Text className="paper-hint">{hint}</Text> : null}
        </View>
        <Text className="paper-stem">{props.question.stem}</Text>
        <OptionList
          mode={props.session.mode}
          question={props.question}
          onChoose={revealed ? undefined : props.onChoose}
        />
        {props.session.mode === 'exam' && !revealed ? (
          <View className="paper-exam">
            <Text className="paper-exam-text">考试模式：交卷后统一查看解析</Text>
          </View>
        ) : null}
        {revealed ? <AnalysisBlock text={props.question.review?.analysis ?? ''} /> : null}
      </View>
    </View>
  );
}

function ProgressCard(props: {
  session: QuizSessionView;
  index: number;
  total: number;
  leftSeconds: number | null;
}) {
  const timer = props.session.settings.timer;
  const progress = props.total > 0 ? ((props.index + 1) / props.total) * 100 : 0;
  const count = `第 ${props.index + 1} / ${props.total} 题`;
  return (
    <View className={timer.enabled ? 'paper-progress' : 'paper-progress paper-progress-free'}>
      {timer.enabled ? (
        <View className="paper-time-row">
          <View className="paper-time-left">
            <Text className="paper-time-label">
              {timer.kind === 'paper' ? '整卷倒计时' : '每题限时'}
            </Text>
            <Text className="paper-time-value">
              {props.leftSeconds === null ? '不限时' : formatClock(props.leftSeconds)}
            </Text>
          </View>
          <Text className="paper-time-count">{count}</Text>
        </View>
      ) : (
        <View className="paper-free-row">
          <Text className="paper-time-label">不计时</Text>
          <Text className="paper-free-count">{count}</Text>
        </View>
      )}
      <View className="paper-bar">
        <View className="paper-bar-fill" style={{ width: `${progress}%` }} />
      </View>
      {timer.enabled ? (
        <Text className="paper-limit">
          {timer.kind === 'paper'
            ? `限时 ${formatClock(timer.paperMinutes * 60)}`
            : `限时 ${formatClock(timer.perQuestionSeconds)}`}
        </Text>
      ) : null}
    </View>
  );
}

function OptionList(props: {
  mode: QuizMode;
  question: QuizQuestionView;
  onChoose?: (optionId: string) => void;
}) {
  const answer = props.question.review ? props.question.review.answer : null;
  return (
    <View className="paper-options">
      {props.question.options.map((option) => {
        const face = optionFace({
          mode: props.mode,
          type: props.question.type,
          selected: props.question.selected,
          answer,
          optionId: option.id,
        });
        return (
          <View
            key={option.id}
            className={`paper-option paper-option-${face.tone}`}
            onClick={props.onChoose ? () => props.onChoose?.(option.id) : undefined}
          >
            {face.control === 'check' ? (
              face.tone === 'picked' ? (
                <Image className="paper-check" src={iconCheck} mode="aspectFit" />
              ) : (
                <View className="paper-check paper-check-off" />
              )
            ) : (
              <Text className={`paper-letter paper-letter-${face.tone}`}>{option.id}</Text>
            )}
            <Text className="paper-option-text">{option.text}</Text>
            {face.tag ? (
              <Text className={`paper-tag paper-tag-${face.tag}`}>{PAPER_TAG_LABEL[face.tag]}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function AnalysisBlock(props: { text: string; follow?: boolean }) {
  return (
    <View className={props.follow ? 'paper-analysis paper-analysis-follow' : 'paper-analysis'}>
      <View className="paper-analysis-bar" />
      <View className="paper-analysis-copy">
        <Text className="paper-analysis-title">解析</Text>
        <Text className="paper-analysis-body">{props.text || '这道题没有解析。'}</Text>
      </View>
    </View>
  );
}

function LegendItem(props: { tone: 'right' | 'wrong' | 'current' | 'blank'; label: string }) {
  return (
    <View className="paper-legend-item">
      <View className={`paper-swatch paper-swatch-${props.tone}`} />
      <Text className="paper-legend-label">{props.label}</Text>
    </View>
  );
}

function BoardGrid(props: {
  questions: QuizQuestionView[];
  index: number;
  onPick: (index: number) => void;
}) {
  const rows = Math.ceil(props.questions.length / 5);
  const height = rows * 56 + Math.max(0, rows - 1) * 10;
  const grid = (
    <View className="paper-grid">
      {props.questions.map((question, questionIndex) => {
        const tone: CellTone = cellTone({
          current: questionIndex === props.index,
          outcome: question.review?.outcome ?? null,
          answered: question.selected.length > 0,
        });
        return (
          <View
            key={question.id}
            className={`paper-cell paper-cell-${tone}`}
            onClick={() => props.onPick(questionIndex)}
          >
            <Text className={`paper-cell-num paper-cell-num-${tone}`}>{question.ordinal}</Text>
          </View>
        );
      })}
    </View>
  );
  if (height <= 280) {
    return grid;
  }
  return (
    <ScrollView scrollY className="paper-grid-scroll" style={{ height: '280px' }}>
      {grid}
    </ScrollView>
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
          <OptionList mode={props.session.mode} question={question} />
          <View className="u-parse-btn" onClick={() => props.onToggle(question.id)}>
            <Text>{props.open[question.id] ? '收起解析' : '查看解析'}</Text>
            <Text>{props.open[question.id] ? '▾' : '›'}</Text>
          </View>
          {props.open[question.id] ? (
            <AnalysisBlock follow text={question.review?.analysis ?? ''} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function wrongQuestions(questions: QuizQuestionView[]): QuizQuestionView[] {
  return questions.filter((question) => question.review && question.review.outcome !== 'correct');
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
