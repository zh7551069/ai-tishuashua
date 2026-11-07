/**
 * 增长发奖的类型、幂等键和纯校验。
 * admin / mini 会经 barrel 加载本文件。不要在这里 import node: 或写 SQL。
 */
import type { EntitlementBalances } from './entitlement-types';

/** 拉新库存默认有效期。没有单独配置时用 365 天。 */
export const GROWTH_INVITE_INVENTORY_EXPIRE_DAYS = 365;

export const GROWTH_MEMBER_SKIP_REASON = 'member_unlimited';
export const GROWTH_MEMBER_SKIP_TEXT = '今日已享会员不限场';

export const GROWTH_LOT_SOURCE = {
  inviteRegister: 'invite_register',
  inviteFirstSubmit: 'invite_first_submit',
} as const;

export type GrowthLotSource = (typeof GROWTH_LOT_SOURCE)[keyof typeof GROWTH_LOT_SOURCE];

export const GROWTH_PENDING_SOURCE = {
  inviteRegister: 'invite_register',
  inviteFirstSubmit: 'invite_first_submit',
} as const;

/** 邀请码字符，避开 0/O/1/I。对外只认 inviteCode，不把 userId 当分享口令。 */
export const GROWTH_INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const INVITE_CODE_RE = new RegExp(`^TS-[${GROWTH_INVITE_CODE_ALPHABET}]{6}$`);
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GrowthParse<T> = { ok: true; value: T } | { ok: false; message: string };

/** grantEntitlement.refId。重复请求靠这组键不双加。 */
export const growthRef = {
  checkin(userId: string, bizDate: string): string {
    return `checkin:${userId}:${bizDate}`;
  },
  share(sharerId: string, bizDate: string): string {
    return `share:${sharerId}:${bizDate}`;
  },
  inviterRegister(inviteeId: string): string {
    return `invite_reg_inviter:${inviteeId}`;
  },
  inviteeWelcome(inviteeId: string): string {
    return `invite_reg_invitee:${inviteeId}`;
  },
  inviterFirstSubmit(inviteeId: string): string {
    return `invite_fs_inviter:${inviteeId}`;
  },
  inviteeFirstSubmit(inviteeId: string): string {
    return `invite_fs_invitee:${inviteeId}`;
  },
} as const;

export function isInviterRewardRef(refId: string): boolean {
  return refId.startsWith('invite_reg_inviter:') || refId.startsWith('invite_fs_inviter:');
}

/** 冷启动 path。朋友圈和好友共用这一条 token，也共用当日额度。 */
export function growthSharePath(shareToken: string): string {
  return `/pages/home/index?shareToken=${shareToken}`;
}

export function isGrowthShareToken(value: string): boolean {
  return SHARE_TOKEN_RE.test(value);
}

export function isInviteCode(value: string): boolean {
  return INVITE_CODE_RE.test(value);
}

/**
 * Asia/Shanghai 业务日所在周的周一。
 * 入参已经是日历日，按公历周一到周日，不再做时区换算。
 */
export function growthWeekStart(bizDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bizDate);
  if (!match) {
    throw new Error('业务日不正确');
  }
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = utc.getUTCDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  utc.setUTCDate(utc.getUTCDate() - delta);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function growthShareStatus(input: {
  enabled: boolean;
  claimed: boolean;
  membershipActive: boolean;
  /** 今日已发出 shareToken，但还没有被打开领奖。 */
  awaitingOpen?: boolean;
}): { memberSkip: boolean; awaitingOpen: boolean; statusText: string } {
  if (!input.enabled) {
    return { memberSkip: false, awaitingOpen: false, statusText: '未开启' };
  }
  if (input.claimed) {
    return { memberSkip: false, awaitingOpen: false, statusText: '今日已领' };
  }
  if (input.membershipActive) {
    return { memberSkip: true, awaitingOpen: false, statusText: GROWTH_MEMBER_SKIP_TEXT };
  }
  if (input.awaitingOpen) {
    return { memberSkip: false, awaitingOpen: true, statusText: '未领取 · 等待好友打开' };
  }
  return { memberSkip: false, awaitingOpen: false, statusText: '今日未领' };
}

export interface GrowthRewardOutcome {
  applied: boolean;
  pending: boolean;
  rewardSessions: number;
  reason?: string;
}

export interface GrowthCheckinResult {
  applied: boolean;
  rewardSessions: number;
  balances: EntitlementBalances;
}

export interface GrowthShareTokenResult {
  shareToken: string;
  businessDate: string;
  pathHint: string;
}

export interface GrowthShareOpenResult {
  applied: boolean;
  sharerRewarded: boolean;
  reason?: string;
}

export interface GrowthInviteBindResult {
  bound: true;
  inviterId: string;
  inviteCode: string;
  invitee: GrowthRewardOutcome;
  inviter: GrowthRewardOutcome;
}

export interface GrowthView {
  businessDate: string;
  checkin: { enabled: boolean; done: boolean; rewardSessions: number };
  share: {
    enabled: boolean;
    claimed: boolean;
    rewardSessions: number;
    memberSkip: boolean;
    awaitingOpen: boolean;
    statusText: string;
  };
  invite: {
    code: string;
    boundInviterId: string | null;
    dailyUsed: number;
    dailyCap: number;
    weeklyUsed: number;
    weeklyCap: number;
    registerEnabled: boolean;
    rewards: {
      inviterRegister: number;
      inviteeWelcome: number;
      inviterFirstSubmit: number;
      inviteeFirstSubmit: number;
    };
  };
  membershipActive: boolean;
}

export function parseShareOpenBody(input: unknown): GrowthParse<{ shareToken: string }> {
  if (!isPlain(input)) {
    return { ok: false, message: '分享参数不正确' };
  }
  const shape = exactKeys(input, ['shareToken']);
  if (shape) {
    return { ok: false, message: shape };
  }
  if (typeof input.shareToken !== 'string' || !isGrowthShareToken(input.shareToken.trim())) {
    return { ok: false, message: 'shareToken 不正确' };
  }
  return { ok: true, value: { shareToken: input.shareToken.trim() } };
}

/** 对外用 inviteCode。inviterId 仅作内部兼容，两者都有时以邀请码为准。 */
export function parseInviteBindBody(
  input: unknown,
): GrowthParse<{ inviteCode: string | null; inviterId: string | null }> {
  if (!isPlain(input)) {
    return { ok: false, message: '邀请参数不正确' };
  }
  const shape = exactKeys(input, ['inviteCode', 'inviterId']);
  if (shape) {
    return { ok: false, message: shape };
  }
  const hasCode =
    'inviteCode' in input && input.inviteCode !== undefined && input.inviteCode !== null;
  const hasId = 'inviterId' in input && input.inviterId !== undefined && input.inviterId !== null;
  if (!hasCode && !hasId) {
    return { ok: false, message: '需要 inviteCode' };
  }
  let inviteCode: string | null = null;
  if (hasCode) {
    if (typeof input.inviteCode !== 'string') {
      return { ok: false, message: 'inviteCode 不正确' };
    }
    inviteCode = input.inviteCode.trim().toUpperCase();
    if (!isInviteCode(inviteCode)) {
      return { ok: false, message: 'inviteCode 不正确' };
    }
  }
  let inviterId: string | null = null;
  if (hasId && !inviteCode) {
    if (typeof input.inviterId !== 'string' || !UUID_RE.test(input.inviterId.trim())) {
      return { ok: false, message: 'inviterId 不正确' };
    }
    inviterId = input.inviterId.trim();
  }
  return { ok: true, value: { inviteCode, inviterId } };
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(input: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      return '参数里有不能识别的字段';
    }
  }
  return null;
}
