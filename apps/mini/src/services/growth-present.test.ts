import assert from 'node:assert/strict';
import test from 'node:test';
import type { GrowthView } from '@tishuashua/shared';
import { presentDailyShare, presentInvite, presentTasksHub } from './growth-present';

test('分享和邀请文案跟 growth 数字走', () => {
  const share = presentDailyShare(view({ rewardSessions: 2, statusText: '今日未领' }));
  assert.equal(share.heroTitle, '分享给好友，打开后领 +2 场');
  assert.equal(share.rules[0], '每日可领 2 场（后台可配）');
  assert.equal(share.rules[3], '会员不限场时，默认改发「提炼次 +1」');

  const invite = presentInvite(view({ dailyCap: 4, weeklyCap: 9, dailyUsed: 4, weeklyUsed: 1 }));
  assert.equal(invite.capLine, '日封顶 4 场 · 周封顶 9 场');
  assert.equal(invite.progressLine, '今日已获 4 / 4 · 本周 1 / 9');
  assert.equal(invite.rows[1]?.inviter, 3);
  assert.match(invite.capNote, /待发放/);
  assert.equal(invite.codeLine, '我的邀请码 TS-AB23CD');

  const open = presentInvite(view({ dailyUsed: 0, dailyCap: 4, weeklyUsed: 0, weeklyCap: 9 }));
  assert.equal(open.capNote, '');
  assert.equal(presentTasksHub(null).shareMeta, '打开后领取');
  assert.equal(presentTasksHub(view()).inviteMeta, '注册 +1 / 首刷 +3');
});

function view(patch?: {
  rewardSessions?: number;
  statusText?: string;
  dailyCap?: number;
  weeklyCap?: number;
  dailyUsed?: number;
  weeklyUsed?: number;
}): GrowthView {
  return {
    businessDate: '2026-11-07',
    checkin: { enabled: true, done: false, rewardSessions: 1 },
    share: {
      enabled: true,
      claimed: false,
      rewardSessions: patch?.rewardSessions ?? 1,
      memberSkip: false,
      awaitingOpen: false,
      statusText: patch?.statusText ?? '今日未领',
    },
    invite: {
      code: 'TS-AB23CD',
      boundInviterId: null,
      dailyUsed: patch?.dailyUsed ?? 0,
      dailyCap: patch?.dailyCap ?? 6,
      weeklyUsed: patch?.weeklyUsed ?? 0,
      weeklyCap: patch?.weeklyCap ?? 15,
      registerEnabled: true,
      rewards: {
        inviterRegister: 1,
        inviteeWelcome: 1,
        inviterFirstSubmit: 3,
        inviteeFirstSubmit: 2,
      },
    },
    membershipActive: false,
  };
}
