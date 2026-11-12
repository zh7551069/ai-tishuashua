import {
  EXPORT_MAX_ROWS,
  QUIZ_MODES,
  parseExportBound,
  validateExportWindow,
  type QuizMode,
} from '@tishuashua/shared';

export const PRACTICE_RECORD_DEFAULT_PAGE = 1;
export const PRACTICE_RECORD_DEFAULT_PAGE_SIZE = 20;
export const PRACTICE_RECORD_MAX_PAGE_SIZE = 100;
export const PRACTICE_RECORD_MAX_PAGE = 10_000;
export const PRACTICE_RECORD_EXPORT_ROW_LIMIT = EXPORT_MAX_ROWS;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PracticeRecordQuery {
  userId: string | null;
  mode: QuizMode | 'all';
  from: Date | null;
  to: Date | null;
  includeWrongSet: boolean;
  page: number;
  pageSize: number;
}

export type ParsedPracticeRecordQuery =
  | { ok: true; query: PracticeRecordQuery }
  | { ok: false; message: string };

/** 已交卷，并且默认排除 wrongSet。详情和列表用同一句。 */
export function practiceRecordStatusSql(includeWrongSet: boolean): string {
  if (includeWrongSet) {
    return `s.status = 'submitted'`;
  }
  return `s.status = 'submitted' AND s.source <> 'wrongSet'`;
}

export function practiceDetailVisible(source: string, includeWrongSet: boolean): boolean {
  return includeWrongSet || source !== 'wrongSet';
}

export function parsePracticeRecordQuery(
  input: unknown,
  kind: 'list' | 'export',
): ParsedPracticeRecordQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;
  const userId = readUuid(source.userId, '用户 ID');
  if (!userId.ok) {
    return userId;
  }
  const mode = readMode(source.mode);
  if (!mode.ok) {
    return mode;
  }
  const includeWrongSet = readFlag(source.includeWrongSet, 'includeWrongSet');
  if (!includeWrongSet.ok) {
    return includeWrongSet;
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

  const page = readInt(source.page, '页码', PRACTICE_RECORD_DEFAULT_PAGE, 1, PRACTICE_RECORD_MAX_PAGE);
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    PRACTICE_RECORD_DEFAULT_PAGE_SIZE,
    1,
    PRACTICE_RECORD_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }

  return {
    ok: true,
    query: {
      userId: userId.value,
      mode: mode.value,
      from: from.value,
      to: to.value,
      includeWrongSet: includeWrongSet.value,
      page: kind === 'export' ? 1 : page.value,
      pageSize: kind === 'export' ? PRACTICE_RECORD_DEFAULT_PAGE_SIZE : pageSize.value,
    },
  };
}

export function parsePracticeDetailQuery(
  input: unknown,
): { ok: true; includeWrongSet: boolean } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;
  const includeWrongSet = readFlag(source.includeWrongSet, 'includeWrongSet');
  if (!includeWrongSet.ok) {
    return includeWrongSet;
  }
  return { ok: true, includeWrongSet: includeWrongSet.value };
}

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

function readFlag(
  value: unknown,
  label: string,
): { ok: true; value: boolean } | { ok: false; message: string } {
  const text = readText(value, label);
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: false };
  }
  if (text.value === 'true') {
    return { ok: true, value: true };
  }
  if (text.value === 'false') {
    return { ok: true, value: false };
  }
  return { ok: false, message: `${label} 只能是 true 或 false` };
}

function readMode(
  value: unknown,
): { ok: true; value: QuizMode | 'all' } | { ok: false; message: string } {
  const text = readText(value, '模式');
  if (!text.ok) {
    return text;
  }
  const mode = text.value ?? 'all';
  if (mode === 'all' || (QUIZ_MODES as readonly string[]).includes(mode)) {
    return { ok: true, value: mode as QuizMode | 'all' };
  }
  return { ok: false, message: '模式只能是 practice、exam 或 all' };
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
