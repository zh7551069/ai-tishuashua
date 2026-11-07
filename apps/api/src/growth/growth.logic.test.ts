import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ApiErrorCode,
  GROWTH_MEMBER_SKIP_TEXT,
  growthRef,
  growthSharePath,
  growthShareStatus,
  growthWeekStart,
  isInviterRewardRef,
  parseInviteBindBody,
  parseShareOpenBody,
} from '@tishuashua/shared';

const repoRoot = join(__dirname, '../../../..');

test('幂等键和业务周按契约钉死', () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const invitee = '22222222-2222-4222-8222-222222222222';
  assert.equal(growthRef.checkin(user, '2026-11-07'), `checkin:${user}:2026-11-07`);
  assert.equal(growthRef.share(user, '2026-11-07'), `share:${user}:2026-11-07`);
  assert.equal(growthRef.inviterRegister(invitee), `invite_reg_inviter:${invitee}`);
  assert.equal(growthRef.inviteeWelcome(invitee), `invite_reg_invitee:${invitee}`);
  assert.equal(growthRef.inviterFirstSubmit(invitee), `invite_fs_inviter:${invitee}`);
  assert.equal(growthRef.inviteeFirstSubmit(invitee), `invite_fs_invitee:${invitee}`);
  assert.equal(isInviterRewardRef(growthRef.inviterRegister(invitee)), true);
  assert.equal(isInviterRewardRef(growthRef.inviteeWelcome(invitee)), false);
  assert.equal(growthWeekStart('2026-11-07'), '2026-11-02');
  assert.equal(growthWeekStart('2026-11-02'), '2026-11-02');
  assert.equal(growthWeekStart('2026-11-01'), '2026-10-26');
});

test('会员分享跳过文案，邀请绑定优先认邀请码', () => {
  assert.deepEqual(growthShareStatus({ enabled: true, claimed: false, membershipActive: true }), {
    memberSkip: true,
    awaitingOpen: false,
    statusText: GROWTH_MEMBER_SKIP_TEXT,
  });
  assert.equal(
    growthShareStatus({ enabled: true, claimed: true, membershipActive: true }).statusText,
    '今日已领',
  );
  assert.equal(
    growthShareStatus({
      enabled: true,
      claimed: false,
      membershipActive: false,
      awaitingOpen: true,
    }).statusText,
    '未领取 · 等待好友打开',
  );
  assert.equal(
    growthShareStatus({ enabled: true, claimed: false, membershipActive: false }).awaitingOpen,
    false,
  );
  assert.equal(growthSharePath('abc'), '/pages/home/index?shareToken=abc');
  const parsed = parseInviteBindBody({
    inviteCode: 'ts-ab23cd',
    inviterId: '11111111-1111-4111-8111-111111111111',
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.inviteCode, 'TS-AB23CD');
    assert.equal(parsed.value.inviterId, null);
  }
  const open = parseShareOpenBody({ shareToken: 'a'.repeat(20), extra: 1 });
  assert.equal(open.ok, false);
  assert.equal(ApiErrorCode.GROWTH_DISABLED, 'GROWTH_DISABLED');
  assert.equal(ApiErrorCode.GROWTH_SELF_INVITE, 'GROWTH_SELF_INVITE');
  assert.equal(ApiErrorCode.GROWTH_CAP_REACHED, 'GROWTH_CAP_REACHED');
});

test('发奖只走 grantEntitlement，pending 不会在增长模块里自动变成 granted', () => {
  const migration = readFileSync(join(repoRoot, 'apps/api/migrations/013_growth.sql'), 'utf8');
  const service = readFileSync(join(repoRoot, 'apps/api/src/growth/growth.service.ts'), 'utf8');
  const repository = readFileSync(
    join(repoRoot, 'apps/api/src/growth/growth.repository.ts'),
    'utf8',
  );
  const barrel = readFileSync(join(repoRoot, 'packages/shared/src/index.ts'), 'utf8');
  assert.match(migration, /invite_relations/);
  assert.match(migration, /growth_task_states/);
  assert.match(migration, /growth_share_tokens/);
  assert.match(migration, /user_invite_codes/);
  assert.equal(migration.includes('UPDATE entitlement_pending_grants'), false);
  assert.match(service, /grantEntitlement/);
  assert.match(service, /config\.checkin\.rewardSessions/);
  assert.match(service, /config\.share\.rewardSessions/);
  assert.match(service, /dailyCapSessions/);
  assert.match(service, /weeklyCapSessions/);
  assert.equal(service.includes('daily_task_remain'), false);
  assert.equal(service.includes('rewardSessions: 1'), false);
  assert.equal(service.includes('dailyCapSessions: 6'), false);
  assert.equal(service.includes("status = 'granted'"), false);
  assert.equal(service.includes('requestPayment'), false);
  assert.equal(repository.includes('daily_task_remain'), false);
  assert.equal(repository.includes("status = 'granted'"), false);
  assert.equal(barrel.includes('node:'), false);
  assert.equal(barrel.includes('growth.repository'), false);
});
