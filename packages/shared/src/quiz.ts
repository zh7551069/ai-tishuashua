export const QUIZ_COUNTS = [10, 20, 30, 50] as const;
export type QuizCount = (typeof QUIZ_COUNTS)[number];

export const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type QuizDifficulty = (typeof QUIZ_DIFFICULTIES)[number];

export const QUIZ_TYPES = ['single', 'multi', 'judge'] as const;
export type QuizTypeCode = (typeof QUIZ_TYPES)[number];

export const QUIZ_MODES = ['practice', 'exam'] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];

export const QUIZ_SESSION_STATUSES = [
  'pending',
  'generating',
  'ready',
  'in_progress',
  'submitted',
  'cancelled',
  'failed',
] as const;
export type QuizSessionStatus = (typeof QUIZ_SESSION_STATUSES)[number];

export const QUESTION_SOURCES = ['ai', 'wrong_carry'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const DEFAULT_QUIZ_COUNT: QuizCount = 20;
export const DEFAULT_QUIZ_DIFFICULTY: QuizDifficulty = 'medium';
export const DEFAULT_QUIZ_MODE: QuizMode = 'practice';
export const DEFAULT_PAPER_MINUTES = 30;
export const DEFAULT_PER_QUESTION_SECONDS = 60;

export const QUIZ_DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export const QUIZ_TYPE_LABELS: Record<QuizTypeCode, string> = {
  single: '单选',
  multi: '多选',
  judge: '判断',
};

export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  practice: '练习',
  exam: '考试',
};

export const QUIZ_OUTCOMES = ['correct', 'wrong', 'partial', 'unanswered'] as const;
export type QuizOutcome = (typeof QUIZ_OUTCOMES)[number];

export const QUIZ_OUTCOME_LABELS: Record<QuizOutcome, string> = {
  correct: '正确',
  wrong: '答错',
  partial: '少选',
  unanswered: '未作答',
};

export const QUIZ_SUBMIT_REASONS = ['manual', 'timeout'] as const;
export type QuizSubmitReason = (typeof QUIZ_SUBMIT_REASONS)[number];

export const QUIZ_SUBMIT_REASON_LABELS: Record<QuizSubmitReason, string> = {
  manual: '主动交卷',
  timeout: '到时收卷',
};

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizTimerOff {
  enabled: false;
}

export interface QuizTimerPaper {
  enabled: true;
  kind: 'paper';
  paperMinutes: number;
}

export interface QuizTimerPerQuestion {
  enabled: true;
  kind: 'per_question';
  perQuestionSeconds: number;
}

export type QuizTimer = QuizTimerOff | QuizTimerPaper | QuizTimerPerQuestion;

export interface QuizSettings {
  count: QuizCount;
  difficulty: QuizDifficulty;
  types: QuizTypeCode[];
  timer: QuizTimer;
  mode: QuizMode;
}

export interface CreateQuizSessionRequest extends QuizSettings {
  packId: string;
}

export interface QuizProgress {
  generated: number;
  total: number;
}

export interface QuizSessionError {
  code: string;
  message: string;
}

export interface QuizSessionContext {
  packName: string;
  domainName: string;
  certName: string;
  totalScore: number;
}

/** 交卷后才附在题目上。未交卷时为 null，响应里没有标准答案和解析。 */
export interface QuizQuestionReview {
  answer: string[];
  analysis: string;
  earnedScore: number;
  outcome: QuizOutcome;
}

/** 下发给答题页的题目。未交卷时 review 为 null。 */
export interface QuizQuestionView {
  id: string;
  ordinal: number;
  type: QuizTypeCode;
  stem: string;
  options: QuizOption[];
  score: number;
  source: QuestionSource;
  selected: string[];
  review: QuizQuestionReview | null;
}

export interface QuizResultView {
  earnedScore: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  partialCount: number;
  questionCount: number;
  accuracy: number;
  scoreRate: number;
  passed: boolean | null;
  passScore: number | null;
  reason: QuizSubmitReason;
  submittedAt: string;
}

export interface QuizScoreSummary {
  id: string;
  mode: QuizMode;
  certName: string;
  packName: string;
  earnedScore: number;
  totalScore: number;
  accuracy: number;
  scoreRate: number;
  correctCount: number;
  questionCount: number;
  passed: boolean | null;
  passScore: number | null;
  reason: QuizSubmitReason;
  submittedAt: string;
}

export interface QuizScoreList {
  items: QuizScoreSummary[];
}

export interface QuizPaperView {
  totalScore: number;
  questions: QuizQuestionView[];
}

export interface QuizSessionView {
  id: string;
  packId: string | null;
  mode: QuizMode;
  status: QuizSessionStatus;
  progress: QuizProgress;
  settings: QuizSettings;
  error: QuizSessionError | null;
  context: QuizSessionContext;
  paper: QuizPaperView | null;
  result: QuizResultView | null;
  /** 进入答题的时间。倒计时从这一刻起算。 */
  startedAt: string | null;
  /** 考试模式的收卷截止时间。练习模式为 null。 */
  deadlineAt: string | null;
}

export interface QuizAnswerResult {
  questionId: string;
  selected: string[];
}

export interface SaveQuizAnswerRequest {
  questionId: string;
  selected: string[];
}

export interface SubmitQuizRequest {
  reason?: QuizSubmitReason;
}

/** Worker 只需要会话 id。题量、题型和计时都在 quiz_sessions 里。 */
export interface GenerateQuizJobPayload {
  userId: string;
  sessionId: string;
}
