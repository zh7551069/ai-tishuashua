/** 导出时间窗。日历日按 Asia/Shanghai，不按 UTC 日期切。 */
export const EXPORT_MAX_SPAN_DAYS = 31;
export const EXPORT_MAX_ROWS = 10_000;
export const EXPORT_TOO_MANY_ROWS_MESSAGE = '导出超过 10000 行，请缩小时间窗';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 解析导出或列表时间。
 * `YYYY-MM-DD` 是上海日历日：from 取当天 00:00，to 取当天 23:59:59.999。
 * 其它能被 Date 解析的 ISO-8601 按瞬时使用。
 */
export function parseExportBound(value: string, role: 'from' | 'to'): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const start = new Date(Date.UTC(year, month - 1, day) - SHANGHAI_OFFSET_MS);
    if (!sameShanghaiDate(start, year, month, day)) {
      return null;
    }
    if (role === 'to') {
      return new Date(start.getTime() + DAY_MS - 1);
    }
    return start;
  }
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/** 含首尾两个上海日历日。同一天是 1。 */
export function exportSpanDays(from: Date, to: Date): number {
  return shanghaiDayIndex(to) - shanghaiDayIndex(from) + 1;
}

/**
 * 导出窗校验。通过返回 null。
 * 跨度按上海自然日，含首尾。32 日拒绝，31 日可以通过。
 */
export function validateExportWindow(from: Date, to: Date): string | null {
  if (to.getTime() < from.getTime()) {
    return '结束时间不能早于开始时间';
  }
  const span = exportSpanDays(from, to);
  if (span > EXPORT_MAX_SPAN_DAYS) {
    return '导出时间跨度不能超过 31 个自然日';
  }
  if (span < 1) {
    return '导出时间窗不正确';
  }
  return null;
}

/**
 * 近 N 日统计窗的起点：含今天在内的 N 个上海自然日的 00:00。
 * days=7 且「今天」是 2026-11-11 时，起点是 2026-11-05 00:00 +08，即 2026-11-04T16:00:00.000Z。
 */
export function generationStatsSince(now: Date, days: number): Date {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const startToday = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(startToday - SHANGHAI_OFFSET_MS - (days - 1) * DAY_MS);
}

/** 无尝试时失败率是 null，不是 0。有尝试且没有失败时是 0。 */
export function quizGenerationFailureRate(attemptCount: number, failureCount: number): number | null {
  if (attemptCount <= 0) {
    return null;
  }
  return failureCount / attemptCount;
}

export interface QuizGenerationAttemptMark {
  success: boolean;
  usedBuiltin: boolean;
}

/**
 * 与统计 SQL 同一口径：分母是尝试行，分子只数 success=false。
 * usedBuiltin 且 success 的行计入 builtinFallbackCount，不计入 failureCount。
 */
export function summarizeQuizGenerationAttempts(
  rows: readonly QuizGenerationAttemptMark[],
  days: number,
  since: Date,
): {
  days: number;
  since: string;
  attemptCount: number;
  failureCount: number;
  failureRate: number | null;
  builtinFallbackCount: number;
} {
  let failureCount = 0;
  let builtinFallbackCount = 0;
  for (const row of rows) {
    if (!row.success) {
      failureCount += 1;
    }
    if (row.usedBuiltin) {
      builtinFallbackCount += 1;
    }
  }
  const attemptCount = rows.length;
  return {
    days,
    since: since.toISOString(),
    attemptCount,
    failureCount,
    failureRate: quizGenerationFailureRate(attemptCount, failureCount),
    builtinFallbackCount,
  };
}

function shanghaiDayIndex(date: Date): number {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return Math.floor(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) / DAY_MS,
  );
}

function sameShanghaiDate(date: Date, year: number, month: number, day: number): boolean {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return (
    shifted.getUTCFullYear() === year &&
    shifted.getUTCMonth() + 1 === month &&
    shifted.getUTCDate() === day
  );
}
