/**
 * 「我」页会员态展示。数字、档名、到期只来自 entitlement（档名可被在售 SKU 名称覆盖）。
 * 不写死配额、库存、到期日或价格，也不在这里下单。
 */
import { BUSINESS_TZ, type EntitlementBalances, type EntitlementView } from '@tishuashua/shared';

export const ME_USAGE_TITLE = '今日剩余场次';
export const ME_USAGE_UNIT = '场';
export const ME_OPEN_MEMBER_LABEL = '开通会员';
export const ME_MEMBER_CARD_TITLE = '题刷刷会员 · 生效中';
export const ME_MEMBER_CARD_NOTE = '提炼不限 · 可升级补差价续费';
export const ME_LEDGER_TITLE = '场次明细';
export const ME_LEDGER_MEMBER_META = '会员不限场 · 明细可查';
export const ME_SHARE_TITLE = '每日分享';
export const ME_INVITE_TITLE = '邀请有礼';
/** 帧上的入口摘要，不是用户余额。发奖归 C13。 */
export const ME_INVITE_META = '注册+1 / 首刷+3';
export const ME_SHARE_META_FREE = '打开领 +1 场';
export const ME_SHARE_META_MEMBER = '打开领 提炼次 +1';

export const ME_CHECKIN_FREE_OPEN = '今日签到 · 领 +1 场';
export const ME_CHECKIN_FREE_DONE = '今日已签到 · 已领 +1 场';
export const ME_CHECKIN_FREE_OPEN_NOTE = '签到送 +1 场，打卡保持连胜，别断签';
export const ME_CHECKIN_FREE_DONE_NOTE = '今日已领 +1 场，坚持打卡，保持连胜';
export const ME_CHECKIN_MEMBER_OPEN = '今日签到 · 领提炼次 +1';
export const ME_CHECKIN_MEMBER_DONE = '今日已签到 · 已领 提炼次 +1';
export const ME_CHECKIN_MEMBER_OPEN_NOTE = '签到领提炼次，打卡保持连胜，别断签';
export const ME_CHECKIN_MEMBER_DONE_NOTE = '今日已领 提炼次 +1，继续打卡，保持连胜';

export const ME_MEMBER_ROUTE = '/pages/commerce/member/index';
export const ME_SESSION_PACK_ROUTE = '/pages/commerce/session-pack/index';
export const ME_SESSION_LEDGER_ROUTE = '/pages/commerce/session-ledger/index';
export const ME_TASKS_ROUTE = '/pages/commerce/tasks/index';

const MEMBER_TIER_BY_CODE: Readonly<Record<string, string>> = {
  member_week: '周卡',
  member_month: '月卡',
  member_quarter: '季卡',
  member_year: '年卡',
};

export interface MeMemberSkuName {
  code: string;
  name: string;
}

export interface MeEntitlementPresent {
  active: boolean;
  /** 非会员今日剩余。会员态为 null，避免扣场大数字。 */
  todayRemain: number | null;
  usageSubtitle: string | null;
  tierName: string | null;
  endsOn: string | null;
  memberTitle: string | null;
  memberSubtitle: string | null;
  memberNote: string | null;
  ledgerMeta: string;
}

export interface MeCheckinCopy {
  button: string;
  note: string;
}

export interface MeGrowthCopy {
  shareTitle: string;
  shareMeta: string;
  inviteTitle: string;
  inviteMeta: string;
}

export function formatEntitlementDate(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') {
    return null;
  }
  const trimmed = iso.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : null;
}

export function memberTierName(
  skuCode: string | null | undefined,
  memberSkus?: readonly MeMemberSkuName[] | null,
): string | null {
  const code = typeof skuCode === 'string' ? skuCode.trim() : '';
  if (memberSkus && code) {
    const named = memberSkus.find((sku) => sku.code === code);
    const name = named?.name.trim();
    if (name) {
      return name;
    }
  }
  if (code && Object.prototype.hasOwnProperty.call(MEMBER_TIER_BY_CODE, code)) {
    return MEMBER_TIER_BY_CODE[code] ?? null;
  }
  return null;
}

export function presentMeEntitlement(
  entitlement: EntitlementView | null | undefined,
  memberSkus?: readonly MeMemberSkuName[] | null,
): MeEntitlementPresent | null {
  if (!entitlement || typeof entitlement.membership?.active !== 'boolean') {
    return null;
  }
  const balances = readBalances(entitlement.balances);
  if (!balances) {
    return null;
  }
  const skuCode = readSkuCode(entitlement.membership.skuCode);
  if (skuCode === 'invalid') {
    return null;
  }
  const endsAt = readEndsAt(entitlement.membership.endsAt);
  if (endsAt === 'invalid') {
    return null;
  }
  const active = entitlement.membership.active;
  const tierName = memberTierName(skuCode, memberSkus);
  const endsOn = formatEntitlementDate(endsAt);
  if (active) {
    return {
      active: true,
      todayRemain: null,
      usageSubtitle: null,
      tierName,
      endsOn,
      memberTitle: ME_MEMBER_CARD_TITLE,
      memberSubtitle: memberSubtitle(tierName, endsOn),
      memberNote: ME_MEMBER_CARD_NOTE,
      ledgerMeta: ME_LEDGER_MEMBER_META,
    };
  }
  return {
    active: false,
    todayRemain: balances.dailyFreeRemain + balances.dailyTaskRemain + balances.inventoryRemain,
    usageSubtitle: usageSubtitle(balances),
    tierName: null,
    endsOn: null,
    memberTitle: null,
    memberSubtitle: null,
    memberNote: null,
    ledgerMeta: `库存 ${balances.inventoryRemain}`,
  };
}

export function presentMeCheckin(active: boolean, checked: boolean): MeCheckinCopy {
  if (active) {
    return checked
      ? { button: ME_CHECKIN_MEMBER_DONE, note: ME_CHECKIN_MEMBER_DONE_NOTE }
      : { button: ME_CHECKIN_MEMBER_OPEN, note: ME_CHECKIN_MEMBER_OPEN_NOTE };
  }
  return checked
    ? { button: ME_CHECKIN_FREE_DONE, note: ME_CHECKIN_FREE_DONE_NOTE }
    : { button: ME_CHECKIN_FREE_OPEN, note: ME_CHECKIN_FREE_OPEN_NOTE };
}

export function presentMeGrowth(active: boolean): MeGrowthCopy {
  return {
    shareTitle: ME_SHARE_TITLE,
    shareMeta: active ? ME_SHARE_META_MEMBER : ME_SHARE_META_FREE,
    inviteTitle: ME_INVITE_TITLE,
    inviteMeta: ME_INVITE_META,
  };
}

function usageSubtitle(balances: EntitlementBalances): string {
  return `日免 ${balances.dailyFreeRemain}/${balances.dailyFreeQuota} · 奖励 ${balances.dailyTaskRemain} · 库存 ${balances.inventoryRemain}`;
}

function memberSubtitle(tierName: string | null, endsOn: string | null): string {
  const parts: string[] = [];
  if (tierName) {
    parts.push(tierName);
  }
  if (endsOn) {
    parts.push(`到期 ${endsOn}`);
  }
  parts.push('不限场');
  return parts.join(' · ');
}

function readBalances(value: EntitlementBalances | undefined): EntitlementBalances | null {
  if (!value) {
    return null;
  }
  const dailyFreeRemain = readCount(value.dailyFreeRemain);
  const dailyFreeQuota = readCount(value.dailyFreeQuota);
  const dailyTaskRemain = readCount(value.dailyTaskRemain);
  const inventoryRemain = readCount(value.inventoryRemain);
  if (
    dailyFreeRemain === null ||
    dailyFreeQuota === null ||
    dailyTaskRemain === null ||
    inventoryRemain === null
  ) {
    return null;
  }
  return { dailyFreeRemain, dailyFreeQuota, dailyTaskRemain, inventoryRemain };
}

function readCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function readSkuCode(value: unknown): string | null | 'invalid' {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  return value;
}

function readEndsAt(value: unknown): string | null | 'invalid' {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  return value;
}
