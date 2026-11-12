import {
  EXPORT_MAX_ROWS,
  EXPORT_TOO_MANY_ROWS_MESSAGE,
  generationStatsSince,
  parseExportBound,
  quizGenerationFailureRate,
  validateExportWindow,
  type AdminQuizGenerationLogStats,
} from '@tishuashua/shared';

export const QUIZ_LOG_DEFAULT_PAGE = 1;
export const QUIZ_LOG_DEFAULT_PAGE_SIZE = 20;
export const QUIZ_LOG_MAX_PAGE_SIZE = 100;
export const QUIZ_LOG_MAX_PAGE = 10_000;
export const QUIZ_LOG_DEFAULT_DAYS = 7;
export const QUIZ_LOG_MIN_DAYS = 1;
export const QUIZ_LOG_MAX_DAYS = 31;
export const QUIZ_LOG_LIST_MESSAGE_MAX = 120;
export const QUIZ_LOG_DETAIL_MESSAGE_MAX = 500;

/**
 * 与 summarizeQuizGenerationAttempts 同一口径：
 * 分子只数 success=false。used_builtin 且出题成功不进分子。
 */
export const QUIZ_GENERATION_STATS_SELECT = `
  SELECT
    COUNT(*)::int AS attempt_count,
    COUNT(*) FILTER (WHERE success = false)::int AS failure_count,
    COUNT(*) FILTER (WHERE used_builtin)::int AS builtin_fallback_count
  FROM quiz_generation_logs
  WHERE created_at >= $1
`;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,80}$/;

export type QuizLogTri = 'all' | 'true' | 'false';

export interface QuizLogQuery {
  userId: string | null;
  success: QuizLogTri;
  usedBuiltin: QuizLogTri;
  from: Date | null;
  to: Date | null;
  errorCode: string | null;
  page: number;
  pageSize: number;
}

export type ParsedQuizLogQuery = { ok: true; query: QuizLogQuery } | { ok: false; message: string };

export function parseQuizGenerationLogQuery(
  input: unknown,
  kind: 'list' | 'export',
): ParsedQuizLogQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;
  const userId = readUuid(source.userId, '用户 ID');
  if (!userId.ok) {
    return userId;
  }
  const success = readTri(source.success, 'success', 'all');
  if (!success.ok) {
    return success;
  }
  const usedBuiltin = readTri(source.usedBuiltin, 'usedBuiltin', 'all');
  if (!usedBuiltin.ok) {
    return usedBuiltin;
  }
  const errorCode = readErrorCode(source.errorCode);
  if (!errorCode.ok) {
    return errorCode;
  }
  const from = readBound(source.from, 'from');
  if (!from.ok) {
    return from;
  }
  const to = readBound(source.to, 'to');
  if (!to.ok) {
    return to;
  }
  if (kind === 'export') {
    if (!from.value || !to.value) {
      return { ok: false, message: '导出必须同时填写 from 和 to' };
    }
    const windowError = validateExportWindow(from.value, to.value);
    if (windowError) {
      return { ok: false, message: windowError };
    }
  } else if (from.value && to.value && to.value.getTime() < from.value.getTime()) {
    return { ok: false, message: '结束时间不能早于开始时间' };
  }
  const page = readInt(source.page, '页码', QUIZ_LOG_DEFAULT_PAGE, 1, QUIZ_LOG_MAX_PAGE);
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    QUIZ_LOG_DEFAULT_PAGE_SIZE,
    1,
    QUIZ_LOG_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }
  return {
    ok: true,
    query: {
      userId: userId.value,
      success: success.value,
      usedBuiltin: usedBuiltin.value,
      from: from.value,
      to: to.value,
      errorCode: errorCode.value,
      page: kind === 'export' ? 1 : page.value,
      pageSize: kind === 'export' ? QUIZ_LOG_DEFAULT_PAGE_SIZE : pageSize.value,
    },
  };
}

export function parseQuizGenerationStatsQuery(
  input: unknown,
  now = new Date(),
): { ok: true; stats: Pick<AdminQuizGenerationLogStats, 'days' | 'since'> } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;
  const days = readInt(source.days, '天数', QUIZ_LOG_DEFAULT_DAYS, QUIZ_LOG_MIN_DAYS, QUIZ_LOG_MAX_DAYS);
  if (!days.ok) {
    return days;
  }
  return {
    ok: true,
    stats: {
      days: days.value,
      since: generationStatsSince(now, days.value).toISOString(),
    },
  };
}

export function quizLogFailureRate(attemptCount: number, failureCount: number): number | null {
  return quizGenerationFailureRate(attemptCount, failureCount);
}

export { EXPORT_MAX_ROWS, EXPORT_TOO_MANY_ROWS_MESSAGE };

function readBound(
  value: unknown,
  label: 'from' | 'to',
): { ok: true; value: Date | null } | { ok: false; message: string } {
  const text = readText(value, label);
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: null };
  }
  const parsed = parseExportBound(text.value, label);
  if (!parsed) {
    return { ok: false, message: `${label} 不是合法时间` };
  }
  return { ok: true, value: parsed };
}

function readTri(
  value: unknown,
  label: string,
  fallback: QuizLogTri,
): { ok: true; value: QuizLogTri } | { ok: false; message: string } {
  const text = readText(value, label);
  if (!text.ok) {
    return text;
  }
  const picked = text.value ?? fallback;
  if (picked === 'all' || picked === 'true' || picked === 'false') {
    return { ok: true, value: picked };
  }
  return { ok: false, message: `${label} 只能是 true、false 或 all` };
}

function readErrorCode(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = readText(value, 'errorCode');
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: null };
  }
  if (!ERROR_CODE.test(text.value)) {
    return { ok: false, message: 'errorCode 格式不正确' };
  }
  return { ok: true, value: text.value };
}

function readUuid(
  value: unknown,
  label: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = readText(value, label);
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: null };
  }
  if (!UUID_V4.test(text.value)) {
    return { ok: false, message: `${label}不是合法的 UUID` };
  }
  return { ok: true, value: text.value.toLowerCase() };
}

function readInt(
  value: unknown,
  label: string,
  fallback: number,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; message: string } {
  const text = readText(value, label);
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: fallback };
  }
  if (!/^\d+$/.test(text.value)) {
    return { ok: false, message: `${label}必须是 ${min} 到 ${max} 的整数` };
  }
  const parsed = Number(text.value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, message: `${label}必须是 ${min} 到 ${max} 的整数` };
  }
  return { ok: true, value: parsed };
}

function readText(
  value: unknown,
  label: string,
): { ok: true; value: string | undefined } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (Array.isArray(value)) {
    return { ok: false, message: `${label}只能填写一个` };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: `${label}格式不正确` };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed || undefined };
}
