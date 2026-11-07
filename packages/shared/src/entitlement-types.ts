/**
 * 浏览器安全的权益常量、类型和纯函数。
 * admin / mini 会经 packages/shared 的 barrel 间接加载本文件。
 * 不要在这里 import node:，也不要写数据库 SQL。
 */

/** 业务日时区。懒日切和 Worker 日切对账都用这一个。 */
export const BUSINESS_TZ = 'Asia/Shanghai';

/** 没有 system_settings.dailyFreeSessions 正整数时的日免场次。 */
export const DEFAULT_DAILY_FREE_SESSIONS = 2;

/** 免费用户终身提炼次数。会员不限。本刀只预留判断，不接上传提炼。 */
export const REFINE_LIFETIME_LIMIT_FREE = 1;

export const ENTITLEMENT_BUCKETS = ['membership', 'daily_free', 'daily_task', 'inventory'] as const;
export type EntitlementBucket = (typeof ENTITLEMENT_BUCKETS)[number];

export const ENTITLEMENT_LEDGER_REASONS = [
  'daily_grant',
  'daily_expire',
  'task_grant',
  'inventory_grant',
  'membership_grant',
  'reserve_hold',
  'deduct',
  'release_restore',
] as const;
export type EntitlementLedgerReason = (typeof ENTITLEMENT_LEDGER_REASONS)[number];

export const ENTITLEMENT_CTA_TYPES = ['member', 'pack', 'task'] as const;
export type EntitlementCtaType = (typeof ENTITLEMENT_CTA_TYPES)[number];

/** 用尽半屏的固定三件套。深链和价格留给后续切片。 */
export const ENTITLEMENT_EXHAUSTED_CTA: readonly {
  type: EntitlementCtaType;
  label: string;
}[] = [
  { type: 'member', label: '开通会员' },
  { type: 'pack', label: '购买加油包' },
  { type: 'task', label: '做任务领场次' },
];

export interface EntitlementDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export class EntitlementFlowError extends Error {
  readonly code: 'ENTITLEMENT_EXHAUSTED' | 'ENTITLEMENT_CONFLICT';
  readonly details?: EntitlementExhaustedDetails;

  constructor(
    code: 'ENTITLEMENT_EXHAUSTED' | 'ENTITLEMENT_CONFLICT',
    message: string,
    details?: EntitlementExhaustedDetails,
  ) {
    super(message);
    this.name = 'EntitlementFlowError';
    this.code = code;
    this.details = details;
  }
}

export interface EntitlementExhaustedDetails {
  reason: 'exhausted';
  businessDate: string;
  membershipActive: false;
  balances: EntitlementBalances;
  cta: { type: EntitlementCtaType; label: string }[];
}

export interface EntitlementBalances {
  dailyFreeRemain: number;
  dailyTaskRemain: number;
  inventoryRemain: number;
}

export interface EntitlementMembership {
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  skuCode: string | null;
}

export interface EntitlementView {
  businessDate: string;
  timezone: typeof BUSINESS_TZ;
  membership: EntitlementMembership;
  balances: EntitlementBalances;
  refine: {
    lifetimeUsed: number;
    lifetimeLimitFree: number;
    unlimited: boolean;
  };
}

export interface EntitlementReservation {
  id: string;
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  status: 'held' | 'committed' | 'released';
  bucketSpent: 'daily_free' | 'daily_task' | 'inventory' | null;
  lotId: string | null;
  qty: 1;
  bizDate: string;
}

export type GrantCommand =
  | { type: 'daily_task'; qty: number; refId: string }
  | { type: 'inventory'; qty: number; expiresAt?: string; source: string; refId: string }
  | { type: 'membership'; endsAt: string; skuCode?: string; refId: string };

export interface GrantResult {
  applied: boolean;
  lotId: string | null;
}

export interface EntitlementLedgerItem {
  id: string;
  delta: number;
  bucket: EntitlementBucket;
  reason: EntitlementLedgerReason;
  refType: string;
  refId: string;
  bizDate: string;
  createdAt: string;
}

export interface EntitlementLedgerPage {
  items: EntitlementLedgerItem[];
  nextCursor: string | null;
}

/** Worker 日切对账任务名。懒日切负责正确性，这个钩子只上报。 */
export const ENTITLEMENT_DAY_RECONCILE_JOB = 'entitlement.day-reconcile';

/** 每天 00:05。时区用 BUSINESS_TZ。 */
export const ENTITLEMENT_DAY_RECONCILE_CRON = '5 0 * * *';

export interface DayReconcileResult {
  job: typeof ENTITLEMENT_DAY_RECONCILE_JOB;
  scanned: number;
  ok: true;
  businessDate: string;
}

/** metrics-only。不扫表，不做支付对账。 */
export function runEntitlementDayReconcile(now = new Date()): DayReconcileResult {
  return {
    job: ENTITLEMENT_DAY_RECONCILE_JOB,
    scanned: 0,
    ok: true,
    businessDate: businessDate(now),
  };
}

/** Asia/Shanghai 日历日，YYYY-MM-DD。 */
export function businessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function reserveIdempotencyKey(sessionId: string): string {
  return `reserve:session:${sessionId}`;
}

/** wrongSet 不占场。其余来源，包括 1 题的 variant，都占 1 场。 */
export function sessionConsumesEntitlement(source: string): boolean {
  return source !== 'wrongSet';
}

/**
 * 本地灌数入口。生产一律关闭。
 * 非生产还需 ENTITLEMENT_SEED=1，或微信登录 mock。
 */
export function isEntitlementDevGrantEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production') {
    return false;
  }
  if (env.ENTITLEMENT_SEED === '1') {
    return true;
  }
  const mock = (env.WECHAT_LOGIN_MOCK ?? '').trim().toLowerCase();
  return mock === 'true' || mock === '1';
}

/** 上传提炼门禁可挂钩。本刀不改课件上传。 */
export function refineAccess(input: { membershipActive: boolean; lifetimeUsed: number }): {
  unlimited: boolean;
  lifetimeLimitFree: number;
  allowed: boolean;
} {
  const unlimited = input.membershipActive;
  return {
    unlimited,
    lifetimeLimitFree: REFINE_LIFETIME_LIMIT_FREE,
    allowed: unlimited || input.lifetimeUsed < REFINE_LIFETIME_LIMIT_FREE,
  };
}

export function parseDailyFreeQuota(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    return Number(value);
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return parseDailyFreeQuota((value as { value: unknown }).value);
  }
  return null;
}

export function parseGrantCommand(
  input: unknown,
): { ok: true; command: GrantCommand } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: '发放参数不正确' };
  }
  const body = input as Record<string, unknown>;
  const refId = readRefId(body.refId);
  if (!refId) {
    return { ok: false, message: 'refId 不能为空' };
  }
  if (body.type === 'daily_task') {
    const qty = readQty(body.qty);
    if (qty === null) {
      return { ok: false, message: '发放数量必须是正整数' };
    }
    return { ok: true, command: { type: 'daily_task', qty, refId } };
  }
  if (body.type === 'inventory') {
    const qty = readQty(body.qty);
    if (qty === null) {
      return { ok: false, message: '发放数量必须是正整数' };
    }
    if (typeof body.source !== 'string' || !body.source.trim() || body.source.trim().length > 64) {
      return { ok: false, message: '库存来源不正确' };
    }
    const expiresAt = readOptionalTime(body.expiresAt);
    if (expiresAt === 'invalid') {
      return { ok: false, message: '库存过期时间不正确' };
    }
    return {
      ok: true,
      command: {
        type: 'inventory',
        qty,
        source: body.source.trim(),
        refId,
        ...(expiresAt ? { expiresAt } : {}),
      },
    };
  }
  if (body.type === 'membership') {
    const endsAt = readOptionalTime(body.endsAt);
    if (!endsAt || endsAt === 'invalid') {
      return { ok: false, message: '会员结束时间不正确' };
    }
    const skuCode = readOptionalSku(body.skuCode);
    if (skuCode === 'invalid') {
      return { ok: false, message: '会员 SKU 不正确' };
    }
    return {
      ok: true,
      command: {
        type: 'membership',
        endsAt,
        refId,
        ...(skuCode ? { skuCode } : {}),
      },
    };
  }
  return { ok: false, message: '发放类型不正确' };
}

export function parseLedgerQuery(
  limitRaw: unknown,
  cursorRaw: unknown,
):
  | { ok: true; limit: number; cursor: { createdAt: string; id: string } | null }
  | { ok: false; message: string } {
  let limit = 20;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== '') {
    const parsed = typeof limitRaw === 'number' ? limitRaw : Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return { ok: false, message: 'limit 必须是 1 到 50 的整数' };
    }
    limit = parsed;
  }
  if (cursorRaw === undefined || cursorRaw === null || cursorRaw === '') {
    return { ok: true, limit, cursor: null };
  }
  if (typeof cursorRaw !== 'string') {
    return { ok: false, message: '游标不正确' };
  }
  const cursor = decodeLedgerCursor(cursorRaw);
  if (!cursor) {
    return { ok: false, message: '游标不正确' };
  }
  return { ok: true, limit, cursor };
}

function decodeLedgerCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = decodeBase64Url(cursor);
    const split = raw.lastIndexOf('|');
    if (split <= 0) {
      return null;
    }
    const createdAt = raw.slice(0, split);
    const id = raw.slice(split + 1);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    if (Number.isNaN(new Date(createdAt).getTime())) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

function readRefId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const refId = value.trim();
  if (!refId || refId.length > 200) {
    return null;
  }
  return refId;
}

function readQty(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
    return null;
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

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readOptionalSku(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 64) {
    return 'invalid';
  }
  return value.trim();
}
