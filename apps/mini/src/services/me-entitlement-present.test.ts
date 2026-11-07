import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { EntitlementBalances, EntitlementMembership, EntitlementView } from '@tishuashua/shared';
import {
  ME_CHECKIN_FREE_DONE,
  ME_CHECKIN_FREE_DONE_NOTE,
  ME_CHECKIN_FREE_OPEN,
  ME_CHECKIN_FREE_OPEN_NOTE,
  ME_CHECKIN_MEMBER_DONE,
  ME_CHECKIN_MEMBER_DONE_NOTE,
  ME_CHECKIN_MEMBER_OPEN,
  ME_CHECKIN_MEMBER_OPEN_NOTE,
  ME_INVITE_META,
  ME_LEDGER_MEMBER_META,
  ME_MEMBER_CARD_NOTE,
  ME_MEMBER_CARD_TITLE,
  ME_MEMBER_ROUTE,
  ME_SESSION_LEDGER_ROUTE,
  ME_SESSION_PACK_ROUTE,
  ME_SHARE_META_FREE,
  ME_SHARE_META_MEMBER,
  ME_TASKS_ROUTE,
  formatEntitlementDate,
  memberTierName,
  presentMeCheckin,
  presentMeEntitlement,
  presentMeGrowth,
} from './me-entitlement-present';

const miniRoot = join(__dirname, '../..');

test('非会员今日剩余是三桶之和，副文跟余额走', () => {
  const shown = presentMeEntitlement(
    view({
      balances: { dailyFreeRemain: 1, dailyFreeQuota: 5, dailyTaskRemain: 2, inventoryRemain: 4 },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.active, false);
  assert.equal(shown.todayRemain, 7);
  assert.equal(shown.usageSubtitle, '日免 1/5 · 奖励 2 · 库存 4');
  assert.equal(shown.ledgerMeta, '库存 4');
  assert.equal(shown.memberTitle, null);
  assert.equal(shown.memberSubtitle, null);
  assert.equal(shown.endsOn, null);
  assert.equal(shown.usageSubtitle.includes('日免 0/2'), false);
  assert.equal(shown.ledgerMeta.includes('今日消耗'), false);
});

test('服务端余额为 0 时显示 0，不另造配额', () => {
  const shown = presentMeEntitlement(
    view({
      balances: { dailyFreeRemain: 0, dailyFreeQuota: 9, dailyTaskRemain: 0, inventoryRemain: 0 },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.todayRemain, 0);
  assert.equal(shown.usageSubtitle, '日免 0/9 · 奖励 0 · 库存 0');
});

test('会员态不给出扣场大数字，到期按上海日历日', () => {
  const shown = presentMeEntitlement(
    view({
      membership: {
        active: true,
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-11-30T16:00:00.000Z',
        skuCode: 'member_month',
      },
      balances: { dailyFreeRemain: 5, dailyFreeQuota: 5, dailyTaskRemain: 5, inventoryRemain: 5 },
      refine: { lifetimeUsed: 0, lifetimeLimitFree: 1, unlimited: true },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.active, true);
  assert.equal(shown.todayRemain, null);
  assert.equal(shown.usageSubtitle, null);
  assert.equal(shown.tierName, '月卡');
  assert.equal(shown.endsOn, '2026-12-01');
  assert.equal(shown.memberTitle, ME_MEMBER_CARD_TITLE);
  assert.equal(shown.memberSubtitle, '月卡 · 到期 2026-12-01 · 不限场');
  assert.equal(shown.memberNote, ME_MEMBER_CARD_NOTE);
  assert.equal(shown.ledgerMeta, ME_LEDGER_MEMBER_META);
  assert.equal(JSON.stringify(shown).includes('15'), false);
});

test('上海日界：同一 UTC 日跨过零点才换日历日', () => {
  assert.equal(formatEntitlementDate('2026-11-30T15:59:59.000Z'), '2026-11-30');
  assert.equal(formatEntitlementDate('2026-11-30T16:00:00.000Z'), '2026-12-01');
  assert.equal(formatEntitlementDate('2026-12-01T00:00:00+08:00'), '2026-12-01');
  assert.equal(formatEntitlementDate('not-a-date'), null);
  assert.equal(formatEntitlementDate(null), null);
});

test('档名优先用在售名称，未知编码不猜月卡', () => {
  assert.equal(
    memberTierName('member_month', [{ code: 'member_month', name: '连续包月' }]),
    '连续包月',
  );
  assert.equal(memberTierName('member_year', []), '年卡');
  assert.equal(memberTierName('member_custom', []), null);
  const shown = presentMeEntitlement(
    view({
      membership: {
        active: true,
        startsAt: null,
        endsAt: '2026-06-01T00:00:00+08:00',
        skuCode: 'member_custom',
      },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.tierName, null);
  assert.equal(shown.memberSubtitle, '到期 2026-06-01 · 不限场');
  assert.equal(shown.memberSubtitle.includes('月卡'), false);
});

test('余额或会员态残缺时不编造用量', () => {
  const missingQuota = view();
  delete (missingQuota.balances as { dailyFreeQuota?: number }).dailyFreeQuota;
  assert.equal(presentMeEntitlement(missingQuota), null);
  const negative = view({
    balances: { dailyFreeRemain: 1, dailyFreeQuota: 2, dailyTaskRemain: 0, inventoryRemain: -1 },
  });
  assert.equal(presentMeEntitlement(negative), null);
  const inactive = view();
  (inactive.membership as { active: unknown }).active = 'yes';
  assert.equal(presentMeEntitlement(inactive), null);
  assert.equal(presentMeEntitlement(null), null);
});

test('签到和分享文案按会员态分支，不改余额', () => {
  assert.deepEqual(presentMeCheckin(false, false), {
    button: ME_CHECKIN_FREE_OPEN,
    note: ME_CHECKIN_FREE_OPEN_NOTE,
  });
  assert.deepEqual(presentMeCheckin(false, true), {
    button: ME_CHECKIN_FREE_DONE,
    note: ME_CHECKIN_FREE_DONE_NOTE,
  });
  assert.deepEqual(presentMeCheckin(true, false), {
    button: ME_CHECKIN_MEMBER_OPEN,
    note: ME_CHECKIN_MEMBER_OPEN_NOTE,
  });
  assert.deepEqual(presentMeCheckin(true, true), {
    button: ME_CHECKIN_MEMBER_DONE,
    note: ME_CHECKIN_MEMBER_DONE_NOTE,
  });
  assert.equal(presentMeGrowth(false).shareMeta, ME_SHARE_META_FREE);
  assert.equal(presentMeGrowth(true).shareMeta, ME_SHARE_META_MEMBER);
  assert.equal(presentMeGrowth(true).inviteMeta, ME_INVITE_META);
});

test('导航只指向会员页、加油包页、明细占位和任务页', () => {
  assert.equal(ME_MEMBER_ROUTE, '/pages/commerce/member/index');
  assert.equal(ME_SESSION_PACK_ROUTE, '/pages/commerce/session-pack/index');
  assert.equal(ME_SESSION_LEDGER_ROUTE, '/pages/commerce/session-ledger/index');
  assert.equal(ME_TASKS_ROUTE, '/pages/commerce/tasks/index');
});

test('「我」页源码无支付下单，也不写死示意用量', () => {
  const files = [
    'src/pages/me/index.tsx',
    'src/pages/me/commerce-blocks.tsx',
    'src/services/me-entitlement-present.ts',
    'src/pages/commerce/session-ledger/index.tsx',
  ];
  const production = files.map((file) => readFileSync(join(miniRoot, file), 'utf8')).join('\n');
  const page = readFileSync(join(miniRoot, 'src/pages/me/index.tsx'), 'utf8');
  const blocks = readFileSync(join(miniRoot, 'src/pages/me/commerce-blocks.tsx'), 'utf8');
  const present = readFileSync(join(miniRoot, 'src/services/me-entitlement-present.ts'), 'utf8');
  const ledger = readFileSync(join(miniRoot, 'src/pages/commerce/session-ledger/index.tsx'), 'utf8');
  const config = readFileSync(join(miniRoot, 'src/app.config.ts'), 'utf8');
  assert.equal(/requestPayment|mock-notify|upgrade-quote|\/api\/orders/.test(production), false);
  assert.equal(production.includes('membership-pay'), false);
  assert.equal(production.includes('session-pack-pay'), false);
  assert.equal(production.includes('v2.0.0'), false);
  assert.equal(production.includes('日免 0/2'), false);
  assert.equal(production.includes('今日消耗'), false);
  assert.equal(production.includes('2026-12-01'), false);
  assert.equal(/¥\s*28/.test(production), false);
  assert.equal(present.includes('DEFAULT_DAILY_FREE_SESSIONS'), false);
  assert.match(page, /useDidShow/);
  assert.match(page, /fetchEntitlement/);
  assert.match(page, /presentMeEntitlement/);
  assert.match(page, /navigateTo/);
  assert.match(page, /ME_MEMBER_ROUTE/);
  assert.match(page, /ME_SESSION_LEDGER_ROUTE/);
  assert.match(page, /ME_TASKS_ROUTE/);
  assert.match(blocks, /commerce\.active/);
  assert.match(blocks, /ME_USAGE_TITLE/);
  assert.match(blocks, /todayRemain/);
  assert.match(ledger, /CommerceStub/);
  assert.equal(/fetchEntitlement|\/ledger|requestPayment/.test(ledger), false);
  assert.equal((config.match(/pages\/me\//g) ?? []).length, 1);
  assert.match(config, /pages\/commerce\/session-ledger\/index/);
  const barrel = readFileSync(join(miniRoot, '../../packages/shared/src/index.ts'), 'utf8');
  assert.equal(barrel.includes('node:'), false);
  assert.equal(barrel.includes('entitlement-server'), false);
});

function view(patch?: {
  membership?: Partial<EntitlementMembership>;
  balances?: Partial<EntitlementBalances>;
  refine?: Partial<EntitlementView['refine']>;
}): EntitlementView {
  return {
    businessDate: '2026-11-07',
    timezone: 'Asia/Shanghai',
    membership: {
      active: false,
      startsAt: null,
      endsAt: null,
      skuCode: null,
      ...patch?.membership,
    },
    balances: {
      dailyFreeRemain: 1,
      dailyFreeQuota: 5,
      dailyTaskRemain: 0,
      inventoryRemain: 3,
      ...patch?.balances,
    },
    refine: {
      lifetimeUsed: 0,
      lifetimeLimitFree: 1,
      unlimited: false,
      ...patch?.refine,
    },
  };
}
