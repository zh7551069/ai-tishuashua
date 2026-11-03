import { ADMIN_USER_STATUSES, type AdminUserStatus } from '@tishuashua/shared';

export const ADMIN_USER_DEFAULT_STATUS = 'all' as const;
export const ADMIN_USER_DEFAULT_PAGE = 1;
export const ADMIN_USER_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_USER_MAX_PAGE_SIZE = 100;
/** 避免过大的 OFFSET。这是请求校验，不是运营上限。 */
export const ADMIN_USER_MAX_PAGE = 10_000;

export type AdminUserStatusFilter = AdminUserStatus | 'all';

export interface AdminUserQuery {
  status: AdminUserStatusFilter;
  page: number;
  pageSize: number;
}

export type ParsedAdminUserQuery =
  { ok: true; query: AdminUserQuery } | { ok: false; message: string };

export function parseAdminUserQuery(input: unknown): ParsedAdminUserQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;

  const status = readStatus(source.status);
  if (!status.ok) {
    return status;
  }
  const page = readInt(source.page, '页码', ADMIN_USER_DEFAULT_PAGE, 1, ADMIN_USER_MAX_PAGE);
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    ADMIN_USER_DEFAULT_PAGE_SIZE,
    1,
    ADMIN_USER_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }

  return {
    ok: true,
    query: {
      status: status.value,
      page: page.value,
      pageSize: pageSize.value,
    },
  };
}

function readStatus(
  value: unknown,
): { ok: true; value: AdminUserStatusFilter } | { ok: false; message: string } {
  const text = readText(value, '状态');
  if (!text.ok) {
    return text;
  }
  const status = text.value ?? ADMIN_USER_DEFAULT_STATUS;
  if (status === 'all' || (ADMIN_USER_STATUSES as readonly string[]).includes(status)) {
    return { ok: true, value: status as AdminUserStatusFilter };
  }
  return { ok: false, message: '状态只能是 active、banned 或 all' };
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
