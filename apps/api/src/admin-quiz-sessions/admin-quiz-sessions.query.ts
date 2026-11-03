import {
  ADMIN_QUIZ_SESSION_STATUSES,
  QUIZ_MODES,
  type AdminQuizSessionStatus,
  type QuizMode,
} from '@tishuashua/shared';

/** 默认看全部未交卷状态。已交卷不在这一页。 */
export const ADMIN_QUIZ_SESSION_DEFAULT_STATUS = 'all' as const;
export const ADMIN_QUIZ_SESSION_DEFAULT_MODE = 'all' as const;
export const ADMIN_QUIZ_SESSION_DEFAULT_PAGE = 1;
export const ADMIN_QUIZ_SESSION_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_QUIZ_SESSION_MAX_PAGE_SIZE = 100;
/** 避免过大的 OFFSET。这是请求校验，不是运营上限。 */
export const ADMIN_QUIZ_SESSION_MAX_PAGE = 10_000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminQuizSessionStatusFilter = AdminQuizSessionStatus | 'all';
export type AdminQuizSessionModeFilter = QuizMode | 'all';

export interface AdminQuizSessionQuery {
  status: AdminQuizSessionStatusFilter;
  mode: AdminQuizSessionModeFilter;
  userId: string | null;
  page: number;
  pageSize: number;
}

export type ParsedAdminQuizSessionQuery =
  { ok: true; query: AdminQuizSessionQuery } | { ok: false; message: string };

export function parseAdminQuizSessionQuery(input: unknown): ParsedAdminQuizSessionQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;

  const status = readStatus(source.status);
  if (!status.ok) {
    return status;
  }
  const mode = readMode(source.mode);
  if (!mode.ok) {
    return mode;
  }
  const userId = readUuid(source.userId, '用户 ID');
  if (!userId.ok) {
    return userId;
  }
  const page = readInt(
    source.page,
    '页码',
    ADMIN_QUIZ_SESSION_DEFAULT_PAGE,
    1,
    ADMIN_QUIZ_SESSION_MAX_PAGE,
  );
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    ADMIN_QUIZ_SESSION_DEFAULT_PAGE_SIZE,
    1,
    ADMIN_QUIZ_SESSION_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }

  return {
    ok: true,
    query: {
      status: status.value,
      mode: mode.value,
      userId: userId.value,
      page: page.value,
      pageSize: pageSize.value,
    },
  };
}

function readStatus(
  value: unknown,
): { ok: true; value: AdminQuizSessionStatusFilter } | { ok: false; message: string } {
  const text = readText(value, '状态');
  if (!text.ok) {
    return text;
  }
  const status = text.value ?? ADMIN_QUIZ_SESSION_DEFAULT_STATUS;
  if (status === 'submitted') {
    return { ok: false, message: '已交卷不在出题会话里，请查看证书与成绩' };
  }
  if (status === 'all' || (ADMIN_QUIZ_SESSION_STATUSES as readonly string[]).includes(status)) {
    return { ok: true, value: status as AdminQuizSessionStatusFilter };
  }
  return {
    ok: false,
    message: '状态只能是 pending、generating、ready、in_progress、cancelled、failed 或 all',
  };
}

function readMode(
  value: unknown,
): { ok: true; value: AdminQuizSessionModeFilter } | { ok: false; message: string } {
  const text = readText(value, '模式');
  if (!text.ok) {
    return text;
  }
  const mode = text.value ?? ADMIN_QUIZ_SESSION_DEFAULT_MODE;
  if (mode === 'all' || (QUIZ_MODES as readonly string[]).includes(mode)) {
    return { ok: true, value: mode as AdminQuizSessionModeFilter };
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
