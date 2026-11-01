import type { QuizMode, QuizOutcome, QuizTimer, QuizTypeCode } from './quiz';

const MINUTE_MS = 60_000;
const SECOND_MS = 1000;

export interface GradedSelection {
  earnedScore: number;
  outcome: QuizOutcome;
}

export interface QuizGradeSummary {
  earnedScore: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  partialCount: number;
  questionCount: number;
  /** 完全答对的题数 / 题量。少选不算正确。 */
  accuracy: number;
  /** 得分 / 总分。总分为 0 时是 0。 */
  scoreRate: number;
  passed: boolean | null;
  passScore: number | null;
}

/**
 * 考试截止时间。练习模式不强制收卷，返回 null。
 * 每题限时没有逐题开始时间，用「每题秒数 × 题量」作为整卷截止。
 */
export function examDeadlineAt(input: {
  mode: QuizMode;
  timer: QuizTimer;
  startedAt: Date;
  questionCount: number;
}): Date | null {
  if (input.mode !== 'exam' || !input.timer.enabled) {
    return null;
  }
  const start = input.startedAt.getTime();
  if (!Number.isFinite(start)) {
    return null;
  }
  if (input.timer.kind === 'paper') {
    return new Date(start + input.timer.paperMinutes * MINUTE_MS);
  }
  if (!Number.isInteger(input.questionCount) || input.questionCount <= 0) {
    return null;
  }
  return new Date(start + input.timer.perQuestionSeconds * input.questionCount * SECOND_MS);
}

/**
 * 单选、判断：与标准答案完全一致得满分，否则 0。
 * 多选：完全一致得满分；少选（所选是正确答案的非空真子集）得 floor(满分 / 2)；多选或错选得 0。
 * 未作答得 0，记为 unanswered，不记为 partial。
 */
export function gradeSelection(input: {
  type: QuizTypeCode;
  answer: readonly string[];
  selected: readonly string[];
  score: number;
}): GradedSelection {
  const score = integerScore(input.score);
  if (input.selected.length === 0) {
    return { earnedScore: 0, outcome: 'unanswered' };
  }
  if (sameSet(input.answer, input.selected)) {
    return { earnedScore: score, outcome: 'correct' };
  }
  if (input.type === 'multi' && isProperSubset(input.selected, input.answer)) {
    return { earnedScore: Math.floor(score / 2), outcome: 'partial' };
  }
  return { earnedScore: 0, outcome: 'wrong' };
}

export function summarizeGrades(
  items: readonly { score: number; earnedScore: number; outcome: QuizOutcome }[],
  passScore: number | null,
): QuizGradeSummary {
  let earnedScore = 0;
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let partialCount = 0;
  for (const item of items) {
    earnedScore += item.earnedScore;
    totalScore += integerScore(item.score);
    if (item.outcome === 'correct') {
      correctCount += 1;
    } else if (item.outcome === 'wrong') {
      wrongCount += 1;
    } else if (item.outcome === 'unanswered') {
      unansweredCount += 1;
    } else {
      partialCount += 1;
    }
  }
  const questionCount = items.length;
  const normalizedPass = normalizePassScore(passScore, totalScore);
  return {
    earnedScore,
    totalScore,
    correctCount,
    wrongCount,
    unansweredCount,
    partialCount,
    questionCount,
    accuracy: ratio(correctCount, questionCount),
    scoreRate: ratio(earnedScore, totalScore),
    passed: normalizedPass === null ? null : earnedScore >= normalizedPass,
    passScore: normalizedPass,
  };
}

function integerScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) {
    return 0;
  }
  return Math.round(score);
}

function normalizePassScore(passScore: number | null, totalScore: number): number | null {
  if (passScore === null || !Number.isFinite(passScore) || passScore < 0) {
    return null;
  }
  const score = Math.round(passScore);
  if (totalScore > 0 && score > totalScore) {
    return null;
  }
  return score;
}

function ratio(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 10000) / 10000;
}

function sameSet(answer: readonly string[], selected: readonly string[]): boolean {
  if (answer.length !== selected.length) {
    return false;
  }
  const wanted = [...answer].sort();
  const got = [...selected].sort();
  return wanted.every((id, index) => id === got[index]);
}

function isProperSubset(selected: readonly string[], answer: readonly string[]): boolean {
  if (selected.length === 0 || selected.length >= answer.length) {
    return false;
  }
  const wanted = new Set(answer);
  const seen = new Set<string>();
  for (const id of selected) {
    if (!wanted.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
  }
  return true;
}
