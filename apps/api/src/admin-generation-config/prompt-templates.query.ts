export const PROMPT_DEFAULT_PAGE = 1;
export const PROMPT_DEFAULT_PAGE_SIZE = 20;
export const PROMPT_MAX_PAGE_SIZE = 100;
export const PROMPT_MAX_PAGE = 10_000;

export interface PromptListQuery {
  scope: 'global' | 'domain' | 'certificate' | null;
  status: 'draft' | 'published' | null;
  q: string | null;
  page: number;
  pageSize: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export function parsePromptListQuery(input: unknown): Parsed<PromptListQuery> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;
  const scope = readEnum(source.scope, ['global', 'domain', 'certificate'] as const, 'scope');
  if (!scope.ok) {
    return scope;
  }
  const status = readEnum(source.status, ['draft', 'published', 'all'] as const, '状态');
  if (!status.ok) {
    return status;
  }
  const q = readQuery(source.q);
  if (!q.ok) {
    return q;
  }
  const page = readInt(source.page, '页码', PROMPT_DEFAULT_PAGE, 1, PROMPT_MAX_PAGE);
  if (!page.ok) {
    return page;
  }
  const pageSize = readInt(
    source.pageSize,
    '每页条数',
    PROMPT_DEFAULT_PAGE_SIZE,
    1,
    PROMPT_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return pageSize;
  }
  return {
    ok: true,
    value: {
      scope: scope.value,
      status: !status.value || status.value === 'all' ? null : status.value,
      q: q.value,
      page: page.value,
      pageSize: pageSize.value,
    },
  };
}

export function parseIncludeBody(input: unknown): Parsed<boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const value = (input as Record<string, unknown>).includeBody;
  if (value === undefined || value === null || value === '' || value === 'false') {
    return { ok: true, value: false };
  }
  if (value === 'true' || value === true) {
    return { ok: true, value: true };
  }
  return { ok: false, message: 'includeBody 不正确' };
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): Parsed<T | null> {
  const text = readOptionalText(value, label);
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: null };
  }
  if (!allowed.includes(text.value as T)) {
    return { ok: false, message: `${label}不正确` };
  }
  return { ok: true, value: text.value as T };
}

function readQuery(value: unknown): Parsed<string | null> {
  const text = readOptionalText(value, '关键字');
  if (!text.ok) {
    return text;
  }
  if (!text.value) {
    return { ok: true, value: null };
  }
  if (text.value.length > 80) {
    return { ok: false, message: '关键字不正确' };
  }
  return { ok: true, value: text.value };
}

function readOptionalText(value: unknown, label: string): Parsed<string | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (Array.isArray(value)) {
    return { ok: false, message: `${label}不正确` };
  }
  const text = String(value).trim();
  return { ok: true, value: text || null };
}

function readInt(
  value: unknown,
  label: string,
  fallback: number,
  min: number,
  max: number,
): Parsed<number> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: fallback };
  }
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, message: `${label}不正确` };
  }
  return { ok: true, value: parsed };
}
