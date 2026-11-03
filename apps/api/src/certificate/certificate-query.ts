import type { CertificateLatestScore } from '@tishuashua/shared';

/** 从已落库的 pass_snapshot 读出分数。读不出就返回 null，不重新判分。 */
export function readCertificateLatestScore(input: {
  sessionId: string | null;
  submittedAt: Date | string | null;
  snapshot: unknown;
}): CertificateLatestScore | null {
  if (!input.sessionId) {
    return null;
  }
  const submittedAt = toIso(input.submittedAt);
  if (!submittedAt || !input.snapshot || typeof input.snapshot !== 'object') {
    return null;
  }
  const body = input.snapshot as Record<string, unknown>;
  const earnedScore = finiteNumber(body.earnedScore);
  const totalScore = finiteNumber(body.totalScore);
  if (earnedScore === null || totalScore === null) {
    return null;
  }
  return {
    sessionId: input.sessionId,
    earnedScore,
    totalScore,
    passed: typeof body.passed === 'boolean' ? body.passed : null,
    submittedAt,
  };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
