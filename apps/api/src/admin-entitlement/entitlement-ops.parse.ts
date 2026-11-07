const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GRANT_KEYS = new Set(['qty', 'bucket', 'reason', 'pendingId', 'expiresAt', 'idempotencyKey']);
const REVOKE_KEYS = new Set(['targets', 'reason']);

export interface AdminGrantInput {
  qty: number;
  bucket: 'inventory';
  reason: string;
  pendingId: string | null;
  expiresAt: string | null;
  idempotencyKey: string | null;
}

export interface AdminRevokeTarget {
  kind: 'lot' | 'pending';
  id: string;
}

export interface AdminRevokeInput {
  targets: AdminRevokeTarget[];
  reason: string;
}

export interface LookupQuery {
  q: string;
  limit: number;
  userId: string | null;
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  actor: string | null;
  actionPrefix: string;
  userId: string | null;
  from: string | null;
  to: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  admin_grant: '后管补发',
  invite_first_submit: '邀请·首刷',
  invite_register: '拉新·注册',
  share_open: '分享领场',
  checkin: '签到领场',
};

export function entitlementSourceLabel(source: string, skuName: string | null): string {
  const named = skuName?.trim();
  if (named) {
    return named;
  }
  return SOURCE_LABELS[source] ?? source;
}

export function maskOpenId(openId: string): string {
  const value = openId.trim();
  if (value.length <= 4) {
    return '…';
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}…${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function parseAdminGrant(
  input: unknown,
): { ok: true; value: AdminGrantInput } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '补发参数不正确' };
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (GRANT_KEYS.has(key)) {
      continue;
    }
    if (key === 'endsAt' || key === 'startsAt' || key === 'skuCode') {
      return { ok: false, message: '本接口不能修改会员到期时间' };
    }
    return { ok: false, message: '请求包含不允许的字段' };
  }
  if (body.bucket !== 'inventory') {
    return { ok: false, message: '补发只能进入跨日库存' };
  }
  if (typeof body.qty !== 'number' || !Number.isInteger(body.qty) || body.qty < 1 || body.qty > 999) {
    return { ok: false, message: '补发数量必须是 1 到 999 的整数' };
  }
  const reason = readReason(body.reason);
  if (!reason) {
    return { ok: false, message: '原因必填，最多 500 字' };
  }
  const pendingId = readOptionalUuid(body.pendingId, '待发放编号不正确');
  if (pendingId === 'invalid') {
    return { ok: false, message: '待发放编号不正确' };
  }
  const expiresAt = readOptionalTime(body.expiresAt);
  if (expiresAt === 'invalid') {
    return { ok: false, message: '库存过期时间不正确' };
  }
  const idempotencyKey = readOptionalKey(body.idempotencyKey);
  if (idempotencyKey === 'invalid') {
    return { ok: false, message: '幂等键不正确' };
  }
  return {
    ok: true,
    value: {
      qty: body.qty,
      bucket: 'inventory',
      reason,
      pendingId,
      expiresAt,
      idempotencyKey,
    },
  };
}

export function parseAdminRevoke(
  input: unknown,
): { ok: true; value: AdminRevokeInput } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '作废参数不正确' };
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (REVOKE_KEYS.has(key)) {
      continue;
    }
    if (key === 'endsAt' || key === 'startsAt' || key === 'skuCode') {
      return { ok: false, message: '本接口不能修改会员到期时间' };
    }
    return { ok: false, message: '请求包含不允许的字段' };
  }
  const reason = readReason(body.reason);
  if (!reason) {
    return { ok: false, message: '原因必填，最多 500 字' };
  }
  if (!Array.isArray(body.targets) || body.targets.length < 1 || body.targets.length > 50) {
    return { ok: false, message: '作废对象需要 1 到 50 条' };
  }
  const targets: AdminRevokeTarget[] = [];
  const seen = new Set<string>();
  for (const item of body.targets) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, message: '作废对象不正确' };
    }
    const target = item as Record<string, unknown>;
    if (target.kind === 'daily_task' || target.kind === 'daily_free') {
      return { ok: false, message: '日免和当日任务奖不能作废' };
    }
    if (target.kind !== 'lot' && target.kind !== 'pending') {
      return { ok: false, message: '作废对象类型不正确' };
    }
    if (typeof target.id !== 'string' || !UUID.test(target.id)) {
      return { ok: false, message: '作废对象编号不正确' };
    }
    const key = `${target.kind}:${target.id}`;
    if (seen.has(key)) {
      return { ok: false, message: '作废对象重复' };
    }
    seen.add(key);
    targets.push({ kind: target.kind, id: target.id });
  }
  return { ok: true, value: { targets, reason } };
}

export function parseLookupQuery(
  qRaw: unknown,
  limitRaw: unknown,
): { ok: true; value: LookupQuery } | { ok: false; message: string } {
  if (typeof qRaw !== 'string') {
    return { ok: false, message: '请输入查询内容' };
  }
  const q = qRaw.trim();
  if (q.length < 1 || q.length > 128) {
    return { ok: false, message: '查询内容需要 1 到 128 字' };
  }
  let limit = 10;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== '') {
    const parsed = typeof limitRaw === 'number' ? limitRaw : Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      return { ok: false, message: 'limit 必须是 1 到 20 的整数' };
    }
    limit = parsed;
  }
  return { ok: true, value: { q, limit, userId: UUID.test(q) ? q : null } };
}

export function parseAuditQuery(input: {
  page?: unknown;
  pageSize?: unknown;
  actor?: unknown;
  actionPrefix?: unknown;
  userId?: unknown;
  from?: unknown;
  to?: unknown;
}): { ok: true; value: AuditQuery } | { ok: false; message: string } {
  const page = readPage(input.page, 1, 'page 必须是正整数');
  if (page === 'invalid') {
    return { ok: false, message: 'page 必须是正整数' };
  }
  const pageSize = readBounded(input.pageSize, 20, 50, 'pageSize 必须是 1 到 50 的整数');
  if (pageSize === 'invalid') {
    return { ok: false, message: 'pageSize 必须是 1 到 50 的整数' };
  }
  const actor = readOptionalText(input.actor, 64);
  if (actor === 'invalid') {
    return { ok: false, message: '操作人筛选不正确' };
  }
  const actionPrefix = readPrefix(input.actionPrefix);
  if (actionPrefix === 'invalid') {
    return { ok: false, message: '动作前缀不正确' };
  }
  const userId = readOptionalUuid(input.userId, '用户筛选不正确');
  if (userId === 'invalid') {
    return { ok: false, message: '用户筛选不正确' };
  }
  const from = readOptionalTime(input.from);
  if (from === 'invalid') {
    return { ok: false, message: '开始时间不正确' };
  }
  const to = readOptionalTime(input.to);
  if (to === 'invalid') {
    return { ok: false, message: '结束时间不正确' };
  }
  return {
    ok: true,
    value: { page, pageSize, actor, actionPrefix, userId, from, to },
  };
}

export function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function readReason(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const reason = value.trim();
  if (!reason || reason.length > 500) {
    return null;
  }
  return reason;
}

function readOptionalUuid(value: unknown, _message: string): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !UUID.test(value)) {
    return 'invalid';
  }
  return value;
}

function readOptionalTime(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return 'invalid';
  }
  return time.toISOString();
}

function readOptionalKey(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const key = value.trim();
  if (!key || key.length > 200) {
    return 'invalid';
  }
  return key;
}

function readOptionalText(value: unknown, max: number): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const text = value.trim();
  if (!text || text.length > max) {
    return 'invalid';
  }
  return text;
}

function readPrefix(value: unknown): string | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return 'commerce.';
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const prefix = value.trim();
  if (!prefix || prefix.length > 80) {
    return 'invalid';
  }
  return prefix;
}

function readPage(value: unknown, fallback: number, _message: string): number | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 'invalid';
  }
  return parsed;
}

function readBounded(
  value: unknown,
  fallback: number,
  max: number,
  _message: string,
): number | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return 'invalid';
  }
  return parsed;
}
