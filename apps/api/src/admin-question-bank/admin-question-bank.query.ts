import {
  ADMIN_QUESTION_BANK_DEFAULT_RANGE,
  ADMIN_QUESTION_BANK_RANGES,
  type AdminQuestionBankRange,
} from '@tishuashua/shared';

export const ADMIN_QUESTION_BANK_DEFAULT_PAGE = 1;
export const ADMIN_QUESTION_BANK_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_QUESTION_BANK_MAX_PAGE_SIZE = 100;
/** 避免过大的 OFFSET。这是请求校验，不是运营上限。 */
export const ADMIN_QUESTION_BANK_MAX_PAGE = 10_000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdminQuestionBankQuery {
  domainId: string | null;
  certificateId: string | null;
  knowledgePointId: string | null;
  range: AdminQuestionBankRange;
  page: number;
  pageSize: number;
}

export type ParsedAdminQuestionBankQuery =
  { ok: true; query: AdminQuestionBankQuery } | { ok: false; message: string };

export function parseAdminQuestionBankQuery(input: unknown): ParsedAdminQuestionBankQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;

  const domainId = readUuid(source.domainId, '领域 ID');
  if (!domainId.ok) {
    return domainId;
  }
  const certificateId = readUuid(source.certificateId, '证书 ID');
  if (!certificateId.ok) {
    return certificateId;
  }
  const knowledgePointId = readKnowledgePointId(source);
  if (!knowledgePointId.ok) {
    return knowledgePointId;
  }
  const range = readRange(source.range);
  if (!range.ok) {
    return range;
  }
  const page = readInt(
    source.page,
    '页码',
    ADMIN_QUESTION_BANK_DEFAULT_PAGE,
    1,
    ADMIN_QUESTION_BANK_MAX_PAGE,
  );
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    ADMIN_QUESTION_BANK_DEFAULT_PAGE_SIZE,
    1,
    ADMIN_QUESTION_BANK_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }

  return {
    ok: true,
    query: {
      domainId: domainId.value,
      certificateId: certificateId.value,
      knowledgePointId: knowledgePointId.value,
      range: range.value,
      page: page.value,
      pageSize: pageSize.value,
    },
  };
}

function readKnowledgePointId(
  source: Record<string, unknown>,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const primary = readUuid(source.knowledgePointId, '知识点 ID');
  if (!primary.ok) {
    return primary;
  }
  const alias = readUuid(source.kpId, '知识点 ID');
  if (!alias.ok) {
    return alias;
  }
  if (primary.value && alias.value && primary.value !== alias.value) {
    return { ok: false, message: '知识点 ID 只能填写一个' };
  }
  return { ok: true, value: primary.value ?? alias.value };
}

function readRange(
  value: unknown,
): { ok: true; value: AdminQuestionBankRange } | { ok: false; message: string } {
  const text = readText(value, '时间范围');
  if (!text.ok) {
    return text;
  }
  const range = text.value ?? ADMIN_QUESTION_BANK_DEFAULT_RANGE;
  if ((ADMIN_QUESTION_BANK_RANGES as readonly string[]).includes(range)) {
    return { ok: true, value: range as AdminQuestionBankRange };
  }
  return { ok: false, message: '时间范围只能是 7d、30d、90d 或 all' };
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
