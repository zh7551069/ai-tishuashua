/**
 * 每日分享 / 邀请有礼的对稿文案。奖额、封顶、邀请码只来自 GET /api/me/growth。
 */
import type { GrowthView } from '@tishuashua/shared';

export const DAILY_SHARE_TITLE = '每日分享领场';
export const INVITE_TITLE = '邀请有礼';
export const SHARE_FRIEND_CTA = '分享给微信好友';
export const SHARE_MOMENT_CTA = '分享到朋友圈';
export const INVITE_SHARE_CTA = '分享邀请海报 / 链接';
export const SHARE_RULE_MEMBER = '会员不限场时，默认改发「提炼次 +1」';
export const INVITE_CODE_LABEL = '我的邀请码';

export interface DailySharePresent {
  heroTitle: string;
  heroNote: string;
  rules: readonly string[];
  statusLabel: string;
  statusText: string;
  friendCta: string;
  momentCta: string;
  canShare: boolean;
}

export interface InviteRewardRow {
  node: string;
  inviter: number;
  invitee: number;
}

export interface InvitePresent {
  headline: string;
  subline: string;
  codeLine: string;
  code: string;
  rows: readonly InviteRewardRow[];
  capTitle: string;
  capLine: string;
  progressLine: string;
  footnotes: readonly string[];
  capNote: string;
  cta: string;
}

export interface TasksHubPresent {
  shareTitle: string;
  shareMeta: string;
  inviteTitle: string;
  inviteMeta: string;
}

export function presentDailyShare(view: GrowthView): DailySharePresent {
  const sessions = view.share.rewardSessions;
  const heroTail = view.share.memberSkip || view.share.claimed ? view.share.statusText : '今日未领';
  return {
    heroTitle: `分享给好友，打开后领 +${sessions} 场`,
    heroNote: `与朋友圈共用每日额度 · ${heroTail}`,
    rules: [
      `每日可领 ${sessions} 场（后台可配）`,
      '需好友打开你的分享链接才发奖',
      '仅分享未打开不计奖',
      SHARE_RULE_MEMBER,
      '未使用的当日奖励随 00:00 清零',
    ],
    statusLabel: '今日状态',
    statusText: view.share.statusText,
    friendCta: SHARE_FRIEND_CTA,
    momentCta: SHARE_MOMENT_CTA,
    canShare: view.share.enabled,
  };
}

export function presentInvite(view: GrowthView): InvitePresent {
  const invite = view.invite;
  const atDaily = invite.dailyCap > 0 && invite.dailyUsed >= invite.dailyCap;
  const atWeekly = invite.weeklyCap > 0 && invite.weeklyUsed >= invite.weeklyCap;
  return {
    headline: '邀请好友一起刷题',
    subline: '双方都有场次奖励',
    codeLine: `我的邀请码 ${invite.code}`,
    code: invite.code,
    rows: [
      {
        node: '完成注册',
        inviter: invite.rewards.inviterRegister,
        invitee: invite.rewards.inviteeWelcome,
      },
      {
        node: '首刷交卷',
        inviter: invite.rewards.inviterFirstSubmit,
        invitee: invite.rewards.inviteeFirstSubmit,
      },
    ],
    capTitle: '邀请人封顶',
    capLine: `日封顶 ${invite.dailyCap} 场 · 周封顶 ${invite.weeklyCap} 场`,
    progressLine: `今日已获 ${invite.dailyUsed} / ${invite.dailyCap} · 本周 ${invite.weeklyUsed} / ${invite.weeklyCap}`,
    footnotes: [
      '一人仅可绑定一位邀请人，禁止自邀',
      '异常邀请进入风控「待发放」',
      '拉新库存跨日不清零',
    ],
    capNote: atDaily || atWeekly ? '已达封顶，超出部分进入待发放，需人工处理' : '',
    cta: INVITE_SHARE_CTA,
  };
}

export function presentTasksHub(view: GrowthView | null): TasksHubPresent {
  if (!view) {
    return {
      shareTitle: '每日分享',
      shareMeta: '打开后领取',
      inviteTitle: '邀请有礼',
      inviteMeta: '邀请双方都有奖励',
    };
  }
  return {
    shareTitle: '每日分享',
    shareMeta: view.share.statusText,
    inviteTitle: '邀请有礼',
    inviteMeta: `注册 +${view.invite.rewards.inviterRegister} / 首刷 +${view.invite.rewards.inviterFirstSubmit}`,
  };
}

export function shareLaunchPath(shareToken: string): string {
  return shareToken ? `/pages/home/index?shareToken=${shareToken}` : '/pages/home/index';
}

export function inviteLaunchPath(inviteCode: string): string {
  return inviteCode ? `/pages/home/index?inviteCode=${inviteCode}` : '/pages/home/index';
}
