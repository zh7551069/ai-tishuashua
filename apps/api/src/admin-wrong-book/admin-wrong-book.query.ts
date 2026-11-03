import type { WrongItemStatus } from '@tishuashua/shared';

/** 后管默认看全部状态。小程序列表默认只看未消灭，两边不是同一条规则。 */
export const ADMIN_WRONG_BOOK_DEFAULT_STATUS = 'all' as const;
export const ADMIN_WRONG_BOOK_DEFAULT_PAGE = 1;
export const ADMIN_WRONG_BOOK_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_WRONG_BOOK_MAX_PAGE_SIZE = 100;
/** 避免过大的 OFFSET。这是请求校验，不是运营上限。 */
export const ADMIN_WRONG_BOOK_MAX_PAGE = 10_000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminWrongBookStatusFilter = WrongItemStatus | 'all';

export interface AdminWrongBookQuery {
  status: AdminWrongBookStatusFilter;
  userId: string | null;
  certId: string | null;
  page: number;
  pageSize: number;
}

export type ParsedAdminWrongBookQuery =
  { ok: true; query: AdminWrongBookQuery } | { ok: false; message: string };

export function parseAdminWrongBookQuery(input: unknown): ParsedAdminWrongBookQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;

  const status = readStatus(source.status);
  if (!status.ok) {
    return status;
  }
  const userId = readUuid(source.userId, '用户 ID');
  if (!userId.ok) {
    return userId;
  }
  const certId = readUuid(source.certId, '证书 ID');
  if (!certId.ok) {
    return certId;
  }
  const page = readInt(
    source.page,
    '页码',
    ADMIN_WRONG_BOOK_DEFAULT_PAGE,
    1,
    ADMIN_WRONG_BOOK_MAX_PAGE,
  );
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    ADMIN_WRONG_BOOK_DEFAULT_PAGE_SIZE,
    1,
    ADMIN_WRONG_BOOK_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }

  return {
    ok: true,
    query: {
      status: status.value,
      userId: userId.value,
      certId: certId.value,
      page: page.value,
      pageSize: pageSize.value,
    },
  };
}

function readStatus(
  value: unknown,
): { ok: true; value: AdminWrongBookStatusFilter } | { ok: false; message: string } {
  const text = readText(value, '状态');
  if (!text.ok) {
    return text;
  }
  const status = text.value ?? ADMIN_WRONG_BOOK_DEFAULT_STATUS;
  if (status === 'pending' || status === 'cleared' || status === 'all') {
    return { ok: true, value: status };
  }
  return { ok: false, message: '状态只能是 pending、cleared 或 all' };
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
