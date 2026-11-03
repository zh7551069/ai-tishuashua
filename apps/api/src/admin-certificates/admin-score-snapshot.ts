import { QUIZ_SUBMIT_REASONS, type QuizSubmitReason } from '@tishuashua/shared';

/**
 * 从 pass_snapshot 还原交卷摘要。
 * 规则对齐小程序成绩列表：原因必须是 manual 或 timeout，分数字段必须是有限数字。
 * 读不出就返回 null。这里不重新判分。
 */
export interface AdminStoredScore {
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
}

const SCORE_NUMBERS = [
  'earnedScore',
  'totalScore',
  'correctCount',
  'wrongCount',
  'unansweredCount',
  'partialCount',
  'questionCount',
  'accuracy',
  'scoreRate',
] as const;

export function readAdminStoredScore(value: unknown): AdminStoredScore | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (!isSubmitReason(body.reason)) {
    return null;
  }
  const parsed = {
    earnedScore: 0,
    totalScore: 0,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    partialCount: 0,
    questionCount: 0,
    accuracy: 0,
    scoreRate: 0,
  };
  for (const key of SCORE_NUMBERS) {
    const number = Number(body[key]);
    if (!Number.isFinite(number)) {
      return null;
    }
    parsed[key] = number;
  }
  const passScore =
    body.passScore === null || body.passScore === undefined ? null : Number(body.passScore);
  if (passScore !== null && !Number.isFinite(passScore)) {
    return null;
  }
  return {
    ...parsed,
    passed: typeof body.passed === 'boolean' ? body.passed : null,
    passScore,
    reason: body.reason,
  };
}

/** 证书名和刷题包名只读交卷快照，和成绩列表一样，不回写成现在的名称。 */
export function readPackSnapshot(value: unknown): { certName: string; packName: string } {
  if (!value || typeof value !== 'object') {
    return { certName: '', packName: '' };
  }
  const body = value as { certName?: unknown; name?: unknown };
  return {
    certName: typeof body.certName === 'string' ? body.certName : '',
    packName: typeof body.name === 'string' ? body.name : '',
  };
}

export function isSubmitReason(value: unknown): value is QuizSubmitReason {
  return typeof value === 'string' && (QUIZ_SUBMIT_REASONS as readonly string[]).includes(value);
}
