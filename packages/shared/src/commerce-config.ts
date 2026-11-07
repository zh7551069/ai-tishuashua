/**
 * 后管商业化配置的类型、默认值和纯校验。
 * admin / mini 会经 barrel 加载本文件。这里只有类型和纯函数。
 */
import { BUSINESS_TZ } from './entitlement-types';

export const DAILY_FREE_SESSIONS_KEY = 'dailyFreeSessions';
export const REFINE_LIFETIME_LIMIT_FREE_KEY = 'refineLifetimeLimitFree';
export const GROWTH_CONFIG_KEY = 'growthConfig';

export const DAILY_FREE_SESSIONS_CACHE_KEY = 'sysset:dailyFreeSessions';
export const REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY = 'sysset:refineLifetimeLimitFree';
export const GROWTH_CONFIG_CACHE_KEY = 'sysset:growthConfig';
export const COMMERCE_SKUS_CACHE_KEY = 'commerce:skus:v1';
export const COMMERCE_SETTING_CACHE_TTL_SECONDS = 60;

export const DEFAULT_REFINE_LIFETIME_LIMIT_FREE = 1;

export const COMMERCE_CLEARING_RULE_TEXT =
  '未使用日免 → 次日 00:00 Asia/Shanghai 清零并重发。当日签到/分享未用场次一并清零。拉新/加油包跨日库存不清零。';

export const COMMERCE_DEDUCT_ORDER_TEXT =
  '1) 会员不限场生效 → 不扣其余桶\n2) 当日日免剩余\n3) 当日签到/分享奖励\n4) 拉新/加油包跨日库存（近过期优先）\n「再练这 N 道」不扣场；取消/失败不扣。';

export const COMMERCE_AI_REVIEW_SUMMARY = 'unlimited' as const;

/** 会员日上限没有写入口。UI 只展示这一份锁定态。 */
export const MEMBER_DAILY_CAP_LOCKED = {
  enabled: false,
  sessions: null,
  uiLocked: true,
} as const;

export const SKU_CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export const SKU_TYPES = ['member', 'session_pack'] as const;
export type SkuType = (typeof SKU_TYPES)[number];

export const SKU_TYPE_LABELS: Record<SkuType, string> = {
  member: '会员',
  session_pack: '加油包',
};

export const COMMERCE_AUDIT_ACTIONS = {
  quotaUpdate: 'commerce.quota.update',
  quotaReset: 'commerce.quota.reset',
  growthUpdate: 'commerce.growth.update',
  growthReset: 'commerce.growth.reset',
  skuCreate: 'commerce.sku.create',
  skuUpdate: 'commerce.sku.update',
  skuDisable: 'commerce.sku.disable',
  skuEnable: 'commerce.sku.enable',
  entitlementGrant: 'commerce.entitlement.grant',
  entitlementRevokeLot: 'commerce.entitlement.revoke_lot',
  entitlementVoidPending: 'commerce.entitlement.void_pending',
} as const;

export interface CommerceQuotaView {
  dailyFreeSessions: number;
  timezone: typeof BUSINESS_TZ;
  timezoneReadonly: true;
  refineLifetimeLimitFree: number;
  aiReviewSummary: typeof COMMERCE_AI_REVIEW_SUMMARY;
  memberDailyCap: typeof MEMBER_DAILY_CAP_LOCKED;
  clearingRuleText: string;
  deductOrderText: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface GrowthCheckin {
  enabled: boolean;
  rewardSessions: number;
}

export interface GrowthShare {
  enabled: boolean;
  rewardSessions: number;
  memberRefineBonus: number;
}

export interface GrowthInvite {
  registerEnabled: boolean;
  inviterRegisterSessions: number;
  inviteeWelcomeSessions: number;
  firstSubmitEnabled: boolean;
  inviterFirstSubmitSessions: number;
  inviteeFirstSubmitSessions: number;
  dailyCapEnabled: boolean;
  dailyCapSessions: number;
  weeklyCapEnabled: boolean;
  weeklyCapSessions: number;
}

export interface GrowthConfig {
  checkin: GrowthCheckin;
  share: GrowthShare;
  invite: GrowthInvite;
}

export interface GrowthConfigView extends GrowthConfig {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CommerceSku {
  code: string;
  type: SkuType;
  name: string;
  priceFen: number;
  priceYuan: number;
  durationDays: number | null;
  sessions: number | null;
  inventoryExpireDays: number | null;
  summary: string;
  enabled: boolean;
  recommended: boolean;
  sortOrder: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SkuDraft {
  code: string;
  type: SkuType;
  name: string;
  priceFen: number;
  durationDays: number | null;
  sessions: number | null;
  inventoryExpireDays: number | null;
  summary: string;
  enabled: boolean;
  recommended: boolean;
  sortOrder: number;
}

export interface SkuPatch {
  name?: string;
  priceFen?: number;
  durationDays?: number;
  sessions?: number;
  inventoryExpireDays?: number;
  summary?: string;
  enabled?: boolean;
  recommended?: boolean;
  sortOrder?: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function defaultGrowthConfig(): GrowthConfig {
  return {
    checkin: { enabled: true, rewardSessions: 1 },
    share: { enabled: true, rewardSessions: 1, memberRefineBonus: 1 },
    invite: {
      registerEnabled: true,
      inviterRegisterSessions: 1,
      inviteeWelcomeSessions: 1,
      firstSubmitEnabled: true,
      inviterFirstSubmitSessions: 3,
      inviteeFirstSubmitSessions: 2,
      dailyCapEnabled: true,
      dailyCapSessions: 6,
      weeklyCapEnabled: true,
      weeklyCapSessions: 15,
    },
  };
}

export function commerceQuotaFixed(): Pick<
  CommerceQuotaView,
  | 'timezone'
  | 'timezoneReadonly'
  | 'aiReviewSummary'
  | 'memberDailyCap'
  | 'clearingRuleText'
  | 'deductOrderText'
> {
  return {
    timezone: BUSINESS_TZ,
    timezoneReadonly: true,
    aiReviewSummary: COMMERCE_AI_REVIEW_SUMMARY,
    memberDailyCap: MEMBER_DAILY_CAP_LOCKED,
    clearingRuleText: COMMERCE_CLEARING_RULE_TEXT,
    deductOrderText: COMMERCE_DEDUCT_ORDER_TEXT,
  };
}

/** `{ limit: 1..99 }`。其它形状视为没有配置。 */
export function parseRefineLifetimeLimit(value: unknown): number | null {
  if (!isPlain(value) || !('limit' in value)) {
    return null;
  }
  return readCount(value.limit, 1, 99);
}

export function parseQuotaWrite(
  input: unknown,
): ParseResult<{ dailyFreeSessions: number; refineLifetimeLimitFree: number }> {
  if (!isPlain(input)) {
    return { ok: false, message: '配额参数不正确' };
  }
  const shape = exactKeys(input, ['dailyFreeSessions', 'refineLifetimeLimitFree'], '配额');
  if (shape) {
    return { ok: false, message: shape };
  }
  const dailyFreeSessions = readCount(input.dailyFreeSessions, 1, 99);
  if (dailyFreeSessions === null) {
    return { ok: false, message: 'dailyFreeSessions 必须是 1 到 99 的整数' };
  }
  const refineLifetimeLimitFree = readCount(input.refineLifetimeLimitFree, 1, 99);
  if (refineLifetimeLimitFree === null) {
    return { ok: false, message: 'refineLifetimeLimitFree 必须是 1 到 99 的整数' };
  }
  return { ok: true, value: { dailyFreeSessions, refineLifetimeLimitFree } };
}

export function parseGrowthConfig(input: unknown): ParseResult<GrowthConfig> {
  if (!isPlain(input)) {
    return { ok: false, message: '增长配置必须是对象' };
  }
  const shape = exactKeys(input, ['checkin', 'share', 'invite'], '增长配置');
  if (shape) {
    return { ok: false, message: shape };
  }
  const checkin = parseCheckin(input.checkin);
  if (!checkin.ok) {
    return checkin;
  }
  const share = parseShare(input.share);
  if (!share.ok) {
    return share;
  }
  const invite = parseInvite(input.invite);
  if (!invite.ok) {
    return invite;
  }
  return { ok: true, value: { checkin: checkin.value, share: share.value, invite: invite.value } };
}

export function parseSkuListQuery(
  typeRaw: unknown,
  statusRaw: unknown,
): ParseResult<{ type: SkuType | null; status: 'all' | 'enabled' | 'disabled' }> {
  let type: SkuType | null = null;
  if (typeRaw !== undefined && typeRaw !== null && typeRaw !== '') {
    if (typeRaw !== 'member' && typeRaw !== 'session_pack') {
      return { ok: false, message: 'type 只能是 member 或 session_pack' };
    }
    type = typeRaw;
  }
  let status: 'all' | 'enabled' | 'disabled' = 'all';
  if (statusRaw !== undefined && statusRaw !== null && statusRaw !== '' && statusRaw !== 'all') {
    if (statusRaw !== 'enabled' && statusRaw !== 'disabled') {
      return { ok: false, message: 'status 只能是 enabled、disabled 或 all' };
    }
    status = statusRaw;
  }
  return { ok: true, value: { type, status } };
}

export function parseSkuCreate(input: unknown): ParseResult<SkuDraft> {
  if (!isPlain(input)) {
    return { ok: false, message: 'SKU 参数不正确' };
  }
  const shape = rejectUnknown(
    input,
    [
      'code',
      'type',
      'name',
      'priceFen',
      'durationDays',
      'sessions',
      'inventoryExpireDays',
      'summary',
      'enabled',
      'recommended',
      'sortOrder',
    ],
    'SKU',
  );
  if (shape) {
    return { ok: false, message: shape };
  }
  if (!('code' in input) || !('type' in input) || !('name' in input) || !('priceFen' in input) || !('summary' in input)) {
    return { ok: false, message: '新建 SKU 需要 code、type、name、priceFen、summary' };
  }
  if (typeof input.code !== 'string' || !SKU_CODE_PATTERN.test(input.code)) {
    return { ok: false, message: 'code 必须是小写字母开头的 2 到 64 位字母、数字或下划线' };
  }
  if (input.type !== 'member' && input.type !== 'session_pack') {
    return { ok: false, message: 'type 只能是 member 或 session_pack' };
  }
  const name = readText(input.name, 'name', 80);
  if (typeof name !== 'string') {
    return { ok: false, message: name.message };
  }
  const summary = readText(input.summary, 'summary', 200);
  if (typeof summary !== 'string') {
    return { ok: false, message: summary.message };
  }
  const priceFen = readCount(input.priceFen, 0, 1_000_000);
  if (priceFen === null) {
    return { ok: false, message: 'priceFen 必须是 0 到 1000000 的整数' };
  }
  const enabled = input.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== 'boolean') {
    return { ok: false, message: 'enabled 必须是布尔值' };
  }
  const recommended = input.recommended === undefined ? false : input.recommended;
  if (typeof recommended !== 'boolean') {
    return { ok: false, message: 'recommended 必须是布尔值' };
  }
  const sortOrder = input.sortOrder === undefined ? 0 : readCount(input.sortOrder, -10_000, 10_000);
  if (sortOrder === null) {
    return { ok: false, message: 'sortOrder 必须是 -10000 到 10000 的整数' };
  }
  if (input.type === 'member') {
    if ('sessions' in input && input.sessions !== null) {
      return { ok: false, message: '会员 SKU 不能设置场次数' };
    }
    if ('inventoryExpireDays' in input && input.inventoryExpireDays !== null) {
      return { ok: false, message: '会员 SKU 不能设置库存有效天数' };
    }
    const durationDays = readCount(input.durationDays, 1, 3650);
    if (durationDays === null) {
      return { ok: false, message: '会员 SKU 的 durationDays 必须是 1 到 3650 的整数' };
    }
    return {
      ok: true,
      value: {
        code: input.code,
        type: 'member',
        name,
        priceFen,
        durationDays,
        sessions: null,
        inventoryExpireDays: null,
        summary,
        enabled,
        recommended,
        sortOrder,
      },
    };
  }
  if ('durationDays' in input && input.durationDays !== null) {
    return { ok: false, message: '加油包不能设置有效天数' };
  }
  const sessions = readCount(input.sessions, 1, 9999);
  if (sessions === null) {
    return { ok: false, message: '加油包的 sessions 必须是 1 到 9999 的整数' };
  }
  const inventoryExpireDays =
    input.inventoryExpireDays === undefined || input.inventoryExpireDays === null
      ? 365
      : readCount(input.inventoryExpireDays, 1, 3650);
  if (inventoryExpireDays === null) {
    return { ok: false, message: 'inventoryExpireDays 必须是 1 到 3650 的整数' };
  }
  return {
    ok: true,
    value: {
      code: input.code,
      type: 'session_pack',
      name,
      priceFen,
      durationDays: null,
      sessions,
      inventoryExpireDays,
      summary,
      enabled,
      recommended,
      sortOrder,
    },
  };
}

export function parseSkuUpdate(input: unknown, currentType: SkuType): ParseResult<SkuPatch> {
  if (!isPlain(input)) {
    return { ok: false, message: 'SKU 参数不正确' };
  }
  if ('code' in input) {
    return { ok: false, message: 'code 创建后不可改' };
  }
  if ('type' in input) {
    return { ok: false, message: 'type 创建后不可改' };
  }
  const shape = rejectUnknown(
    input,
    [
      'name',
      'priceFen',
      'durationDays',
      'sessions',
      'inventoryExpireDays',
      'summary',
      'enabled',
      'recommended',
      'sortOrder',
    ],
    'SKU',
  );
  if (shape) {
    return { ok: false, message: shape };
  }
  if (Object.keys(input).length === 0) {
    return { ok: false, message: '没有要更新的字段' };
  }
  const patch: SkuPatch = {};
  if ('name' in input) {
    const name = readText(input.name, 'name', 80);
    if (typeof name !== 'string') {
      return { ok: false, message: name.message };
    }
    patch.name = name;
  }
  if ('summary' in input) {
    const summary = readText(input.summary, 'summary', 200);
    if (typeof summary !== 'string') {
      return { ok: false, message: summary.message };
    }
    patch.summary = summary;
  }
  if ('priceFen' in input) {
    const priceFen = readCount(input.priceFen, 0, 1_000_000);
    if (priceFen === null) {
      return { ok: false, message: 'priceFen 必须是 0 到 1000000 的整数' };
    }
    patch.priceFen = priceFen;
  }
  if ('enabled' in input) {
    if (typeof input.enabled !== 'boolean') {
      return { ok: false, message: 'enabled 必须是布尔值' };
    }
    patch.enabled = input.enabled;
  }
  if ('recommended' in input) {
    if (typeof input.recommended !== 'boolean') {
      return { ok: false, message: 'recommended 必须是布尔值' };
    }
    patch.recommended = input.recommended;
  }
  if ('sortOrder' in input) {
    const sortOrder = readCount(input.sortOrder, -10_000, 10_000);
    if (sortOrder === null) {
      return { ok: false, message: 'sortOrder 必须是 -10000 到 10000 的整数' };
    }
    patch.sortOrder = sortOrder;
  }
  if (currentType === 'member') {
    if ('sessions' in input && input.sessions !== null && input.sessions !== undefined) {
      return { ok: false, message: '会员 SKU 不能设置场次数' };
    }
    if (
      'inventoryExpireDays' in input &&
      input.inventoryExpireDays !== null &&
      input.inventoryExpireDays !== undefined
    ) {
      return { ok: false, message: '会员 SKU 不能设置库存有效天数' };
    }
    if ('durationDays' in input) {
      const durationDays = readCount(input.durationDays, 1, 3650);
      if (durationDays === null) {
        return { ok: false, message: '会员 SKU 的 durationDays 必须是 1 到 3650 的整数' };
      }
      patch.durationDays = durationDays;
    }
  } else {
    if ('durationDays' in input && input.durationDays !== null && input.durationDays !== undefined) {
      return { ok: false, message: '加油包不能设置有效天数' };
    }
    if ('sessions' in input) {
      const sessions = readCount(input.sessions, 1, 9999);
      if (sessions === null) {
        return { ok: false, message: '加油包的 sessions 必须是 1 到 9999 的整数' };
      }
      patch.sessions = sessions;
    }
    if ('inventoryExpireDays' in input) {
      const days = readCount(input.inventoryExpireDays, 1, 3650);
      if (days === null) {
        return { ok: false, message: 'inventoryExpireDays 必须是 1 到 3650 的整数' };
      }
      patch.inventoryExpireDays = days;
    }
  }
  return { ok: true, value: patch };
}

/** 元字符串到分。只接受到分的小数，避免二进制浮点。 */
export function priceFenFromYuanInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [yuan, frac = ''] = trimmed.split('.');
  if (yuan.length > 7) {
    return null;
  }
  return Number(yuan) * 100 + Number((frac + '00').slice(0, 2));
}

export function formatPriceYuan(priceFen: number): string {
  const sign = priceFen < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(priceFen));
  const yuan = Math.trunc(abs / 100);
  const frac = abs % 100;
  if (frac === 0) {
    return `${sign}${yuan}`;
  }
  const text = `${yuan}.${String(frac).padStart(2, '0')}`.replace(/0$/, '');
  return `${sign}${text}`;
}

export function priceYuanFromFen(priceFen: number): number {
  return Math.trunc(priceFen) / 100;
}

function parseCheckin(input: unknown): ParseResult<GrowthCheckin> {
  if (!isPlain(input)) {
    return { ok: false, message: 'checkin 必须是对象' };
  }
  const shape = exactKeys(input, ['enabled', 'rewardSessions'], 'checkin');
  if (shape) {
    return { ok: false, message: shape };
  }
  if (typeof input.enabled !== 'boolean') {
    return { ok: false, message: 'checkin.enabled 必须是布尔值' };
  }
  const rewardSessions = readCount(input.rewardSessions, 0, 99);
  if (rewardSessions === null) {
    return { ok: false, message: 'checkin.rewardSessions 必须是 0 到 99 的整数' };
  }
  return { ok: true, value: { enabled: input.enabled, rewardSessions } };
}

function parseShare(input: unknown): ParseResult<GrowthShare> {
  if (!isPlain(input)) {
    return { ok: false, message: 'share 必须是对象' };
  }
  const shape = exactKeys(input, ['enabled', 'rewardSessions', 'memberRefineBonus'], 'share');
  if (shape) {
    return { ok: false, message: shape };
  }
  if (typeof input.enabled !== 'boolean') {
    return { ok: false, message: 'share.enabled 必须是布尔值' };
  }
  const rewardSessions = readCount(input.rewardSessions, 0, 99);
  if (rewardSessions === null) {
    return { ok: false, message: 'share.rewardSessions 必须是 0 到 99 的整数' };
  }
  const memberRefineBonus = readCount(input.memberRefineBonus, 0, 99);
  if (memberRefineBonus === null) {
    return { ok: false, message: 'share.memberRefineBonus 必须是 0 到 99 的整数' };
  }
  return { ok: true, value: { enabled: input.enabled, rewardSessions, memberRefineBonus } };
}

function parseInvite(input: unknown): ParseResult<GrowthInvite> {
  if (!isPlain(input)) {
    return { ok: false, message: 'invite 必须是对象' };
  }
  const shape = exactKeys(
    input,
    [
      'registerEnabled',
      'inviterRegisterSessions',
      'inviteeWelcomeSessions',
      'firstSubmitEnabled',
      'inviterFirstSubmitSessions',
      'inviteeFirstSubmitSessions',
      'dailyCapEnabled',
      'dailyCapSessions',
      'weeklyCapEnabled',
      'weeklyCapSessions',
    ],
    'invite',
  );
  if (shape) {
    return { ok: false, message: shape };
  }
  const flags: Array<[string, unknown]> = [
    ['registerEnabled', input.registerEnabled],
    ['firstSubmitEnabled', input.firstSubmitEnabled],
    ['dailyCapEnabled', input.dailyCapEnabled],
    ['weeklyCapEnabled', input.weeklyCapEnabled],
  ];
  for (const [name, value] of flags) {
    if (typeof value !== 'boolean') {
      return { ok: false, message: `invite.${name} 必须是布尔值` };
    }
  }
  const counts: Array<[keyof GrowthInvite, unknown]> = [
    ['inviterRegisterSessions', input.inviterRegisterSessions],
    ['inviteeWelcomeSessions', input.inviteeWelcomeSessions],
    ['inviterFirstSubmitSessions', input.inviterFirstSubmitSessions],
    ['inviteeFirstSubmitSessions', input.inviteeFirstSubmitSessions],
    ['dailyCapSessions', input.dailyCapSessions],
    ['weeklyCapSessions', input.weeklyCapSessions],
  ];
  const parsed: Partial<GrowthInvite> = {
    registerEnabled: input.registerEnabled as boolean,
    firstSubmitEnabled: input.firstSubmitEnabled as boolean,
    dailyCapEnabled: input.dailyCapEnabled as boolean,
    weeklyCapEnabled: input.weeklyCapEnabled as boolean,
  };
  for (const [name, value] of counts) {
    const count = readCount(value, 0, 99);
    if (count === null) {
      return { ok: false, message: `invite.${name} 必须是 0 到 99 的整数` };
    }
    parsed[name] = count as never;
  }
  return { ok: true, value: parsed as GrowthInvite };
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): string | null {
  const unknown = rejectUnknown(record, keys, label);
  if (unknown) {
    return unknown;
  }
  for (const key of keys) {
    if (!(key in record)) {
      return `${label}缺少字段 ${key}`;
    }
  }
  return null;
}

function rejectUnknown(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): string | null {
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) {
      return `${label}不能包含字段 ${key}`;
    }
  }
  return null;
}

function readCount(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function readText(
  value: unknown,
  name: string,
  max: number,
): string | { message: string } {
  if (typeof value !== 'string') {
    return { message: `${name} 必须是字符串` };
  }
  const text = value.trim();
  if (!text || text.length > max) {
    return { message: `${name} 长度必须是 1 到 ${max}` };
  }
  return text;
}
