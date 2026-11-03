import type { QuizMode } from '@tishuashua/shared';

/** 后管证书关联和成绩共用分页。这是请求校验，不是运营上限。 */
export const ADMIN_CERTIFICATES_DEFAULT_PAGE = 1;
export const ADMIN_CERTIFICATES_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_CERTIFICATES_MAX_PAGE_SIZE = 100;
export const ADMIN_CERTIFICATES_MAX_PAGE = 10_000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminScoreModeFilter = QuizMode | 'all';

export interface AdminCertificateLinkQuery {
  userId: string | null;
  certId: string | null;
  domainId: string | null;
  touchedFrom: string | null;
  touchedTo: string | null;
  page: number;
  pageSize: number;
}

export interface AdminScoreQuery {
  userId: string | null;
  certId: string | null;
  domainId: string | null;
  mode: AdminScoreModeFilter;
  submittedFrom: string | null;
  submittedTo: string | null;
  page: number;
  pageSize: number;
}

export type ParsedAdminCertificateLinkQuery =
  { ok: true; query: AdminCertificateLinkQuery } | { ok: false; message: string };

export type ParsedAdminScoreQuery =
  { ok: true; query: AdminScoreQuery } | { ok: false; message: string };

export function parseAdminCertificateLinkQuery(input: unknown): ParsedAdminCertificateLinkQuery {
  const source = readSource(input);
  if (!source.ok) {
    return source;
  }
  const userId = readUuid(source.value.userId, '用户 ID');
  if (!userId.ok) {
    return userId;
  }
  const certId = readUuid(source.value.certId, '证书 ID');
  if (!certId.ok) {
    return certId;
  }
  const domainId = readUuid(source.value.domainId, '领域 ID');
  if (!domainId.ok) {
    return domainId;
  }
  const touchedFrom = readTimestamp(source.value.touchedFrom, '关联开始时间');
  if (!touchedFrom.ok) {
    return touchedFrom;
  }
  const touchedTo = readTimestamp(source.value.touchedTo, '关联结束时间');
  if (!touchedTo.ok) {
    return touchedTo;
  }
  const order = assertOrder(touchedFrom.value, touchedTo.value);
  if (!order.ok) {
    return order;
  }
  const page = readPage(source.value);
  if (!page.ok) {
    return page;
  }
  return {
    ok: true,
    query: {
      userId: userId.value,
      certId: certId.value,
      domainId: domainId.value,
      touchedFrom: touchedFrom.value,
      touchedTo: touchedTo.value,
      page: page.value.page,
      pageSize: page.value.pageSize,
    },
  };
}

export function parseAdminScoreQuery(input: unknown): ParsedAdminScoreQuery {
  const source = readSource(input);
  if (!source.ok) {
    return source;
  }
  const userId = readUuid(source.value.userId, '用户 ID');
  if (!userId.ok) {
    return userId;
  }
  const certId = readUuid(source.value.certId, '证书 ID');
  if (!certId.ok) {
    return certId;
  }
  const domainId = readUuid(source.value.domainId, '领域 ID');
  if (!domainId.ok) {
    return domainId;
  }
  const mode = readMode(source.value.mode);
  if (!mode.ok) {
    return mode;
  }
  const submittedFrom = readTimestamp(source.value.submittedFrom, '交卷开始时间');
  if (!submittedFrom.ok) {
    return submittedFrom;
  }
  const submittedTo = readTimestamp(source.value.submittedTo, '交卷结束时间');
  if (!submittedTo.ok) {
    return submittedTo;
  }
  const order = assertOrder(submittedFrom.value, submittedTo.value);
  if (!order.ok) {
    return order;
  }
  const page = readPage(source.value);
  if (!page.ok) {
    return page;
  }
  return {
    ok: true,
    query: {
      userId: userId.value,
      certId: certId.value,
      domainId: domainId.value,
      mode: mode.value,
      submittedFrom: submittedFrom.value,
      submittedTo: submittedTo.value,
      page: page.value.page,
      pageSize: page.value.pageSize,
    },
  };
}

function readSource(
  input: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  return { ok: true, value: input as Record<string, unknown> };
}

function readPage(
  source: Record<string, unknown>,
): { ok: true; value: { page: number; pageSize: number } } | { ok: false; message: string } {
  const page = readInt(
    source.page,
    '页码',
    ADMIN_CERTIFICATES_DEFAULT_PAGE,
    1,
    ADMIN_CERTIFICATES_MAX_PAGE,
  );
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    ADMIN_CERTIFICATES_DEFAULT_PAGE_SIZE,
    1,
    ADMIN_CERTIFICATES_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }
  return { ok: true, value: { page: page.value, pageSize: pageSize.value } };
}

function readMode(
  value: unknown,
): { ok: true; value: AdminScoreModeFilter } | { ok: false; message: string } {
  const text = readText(value, '模式');
  if (!text.ok) {
    return text;
  }
  const mode = text.value ?? 'all';
  if (mode === 'practice' || mode === 'exam' || mode === 'all') {
    return { ok: true, value: mode };
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

function readTimestamp(
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
  const time = Date.parse(text.value);
  if (!Number.isFinite(time)) {
    return { ok: false, message: `${label}不是合法的时间` };
  }
  return { ok: true, value: new Date(time).toISOString() };
}

function assertOrder(
  from: string | null,
  to: string | null,
): { ok: true } | { ok: false; message: string } {
  if (from && to && Date.parse(from) > Date.parse(to)) {
    return { ok: false, message: '开始时间不能晚于结束时间' };
  }
  return { ok: true };
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
