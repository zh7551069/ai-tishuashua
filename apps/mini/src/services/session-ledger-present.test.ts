import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type {
  EntitlementBalances,
  EntitlementLedgerItem,
  EntitlementLedgerReason,
  EntitlementMembership,
  EntitlementView,
} from '@tishuashua/shared';
import { ENTITLEMENT_LEDGER_REASONS } from '@tishuashua/shared';
import {
  SESSION_LEDGER_PAGE_LIMIT,
  SESSION_LEDGER_RESET_NOTE,
  SESSION_LEDGER_UNLIMITED_HEADLINE,
  SESSION_LEDGER_UNKNOWN,
  appendLedgerItems,
  entitlementLedgerPath,
  filterSessionLedgerRows,
  formatLedgerDelta,
  formatLedgerTime,
  presentSessionLedgerAvailability,
  presentSessionLedgerRow,
  presentSessionLedgerRows,
  readEntitlementLedgerPage,
  sumTodayDebitSessions,
} from './session-ledger-present';

const miniRoot = join(__dirname, '../..');

test('非会员当前可用是三桶之和，日免用尽时副文带库存', () => {
  const shown = presentSessionLedgerAvailability(
    view({
      balances: { dailyFreeRemain: 0, dailyFreeQuota: 2, dailyTaskRemain: 0, inventoryRemain: 4 },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.mode, 'counted');
  assert.equal(shown.sessions, 4);
  assert.equal(shown.headline, '4');
  assert.equal(shown.showUnit, true);
  assert.equal(shown.subtitle, '日免已用完 · 含场次加油库存 4');
  assert.equal(shown.headline.includes('3'), false);
  assert.equal(shown.subtitle.includes('库存 3'), false);
});

test('日免还有剩余时副文跟三桶走，不写成已用完', () => {
  const shown = presentSessionLedgerAvailability(
    view({
      balances: { dailyFreeRemain: 1, dailyFreeQuota: 5, dailyTaskRemain: 2, inventoryRemain: 4 },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.sessions, 7);
  assert.equal(shown.subtitle, '日免 1/5 · 奖励 2 · 库存 4');
  assert.equal(shown.subtitle.includes('已用完'), false);
});

test('余额改了数字就变，缺字段不编造 0 或 3', () => {
  const first = presentSessionLedgerAvailability(
    view({
      balances: { dailyFreeRemain: 1, dailyFreeQuota: 2, dailyTaskRemain: 0, inventoryRemain: 0 },
    }),
  );
  const second = presentSessionLedgerAvailability(
    view({
      balances: { dailyFreeRemain: 0, dailyFreeQuota: 2, dailyTaskRemain: 0, inventoryRemain: 0 },
    }),
  );
  assert.equal(first?.sessions, 1);
  assert.equal(second?.sessions, 0);
  assert.equal(second?.subtitle, '日免已用完 · 含场次加油库存 0');
  const missing = view();
  delete (missing.balances as { inventoryRemain?: number }).inventoryRemain;
  assert.equal(presentSessionLedgerAvailability(missing), null);
  assert.equal(presentSessionLedgerAvailability(null), null);
});

test('会员顶卡是不限场，不露出三桶之和', () => {
  const shown = presentSessionLedgerAvailability(
    view({
      membership: {
        active: true,
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-12-01T00:00:00.000Z',
        skuCode: 'member_month',
      },
      balances: {
        dailyFreeRemain: 11,
        dailyFreeQuota: 13,
        dailyTaskRemain: 17,
        inventoryRemain: 19,
      },
    }),
  );
  assert.ok(shown);
  assert.equal(shown.mode, 'unlimited');
  assert.equal(shown.sessions, null);
  assert.equal(shown.headline, SESSION_LEDGER_UNLIMITED_HEADLINE);
  assert.equal(shown.showUnit, false);
  assert.equal(shown.subtitle, '会员不限场');
  const packed = JSON.stringify(shown);
  assert.equal(packed.includes('41'), false);
  assert.equal(packed.includes('11'), false);
  assert.equal(packed.includes('19'), false);
});

test('今日消耗只加总当日负 delta', () => {
  const items = [
    item({ id: 'a', delta: -1, bizDate: '2026-11-07', reason: 'deduct' }),
    item({ id: 'b', delta: -2, bizDate: '2026-11-07', reason: 'deduct' }),
    item({ id: 'c', delta: 5, bizDate: '2026-11-07', reason: 'inventory_grant' }),
    item({ id: 'd', delta: -4, bizDate: '2026-11-06', reason: 'deduct' }),
    item({ id: 'e', delta: 0, bizDate: '2026-11-07', reason: 'deduct', bucket: 'membership' }),
  ];
  assert.equal(sumTodayDebitSessions(items, '2026-11-07'), 3);
  assert.equal(sumTodayDebitSessions([], '2026-11-07'), 0);
  assert.equal(sumTodayDebitSessions(items, ''), null);
  assert.equal(sumTodayDebitSessions(items, '2026-11-08'), 0);
});

test('Tab：获得只要正 delta，消耗只要负 delta，0 只在全部', () => {
  const rows = [
    { id: 'plus', delta: 2 },
    { id: 'minus', delta: -1 },
    { id: 'zero', delta: 0 },
  ];
  assert.deepEqual(
    filterSessionLedgerRows(rows, 'all').map((row) => row.id),
    ['plus', 'minus', 'zero'],
  );
  assert.deepEqual(
    filterSessionLedgerRows(rows, 'credit').map((row) => row.id),
    ['plus'],
  );
  assert.deepEqual(
    filterSessionLedgerRows(rows, 'debit').map((row) => row.id),
    ['minus'],
  );
});

test('流水保持新到旧，reason 映射和正负号跟条目走', () => {
  const rows = presentSessionLedgerRows(
    [
      item({
        id: 'new',
        delta: 2,
        reason: 'daily_grant',
        createdAt: '2026-11-07T02:42:00.000Z',
      }),
      item({
        id: 'old',
        delta: -1,
        reason: 'deduct',
        createdAt: '2026-10-27T11:33:00.000Z',
        bizDate: '2026-10-27',
      }),
    ],
    '2026-11-07',
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['new', 'old'],
  );
  assert.equal(rows[0]?.title, '日免额度发放');
  assert.equal(rows[0]?.mark, 'credit');
  assert.equal(rows[0]?.markLabel, '获得');
  assert.equal(rows[0]?.deltaLabel, '+2 场');
  assert.equal(rows[0]?.timeLabel, '今天 10:42');
  assert.equal(rows[1]?.title, 'AI 出题');
  assert.equal(rows[1]?.mark, 'debit');
  assert.equal(rows[1]?.deltaLabel, '−1 场');
  assert.equal(rows[1]?.timeLabel, '10-27 19:33');
  assert.equal(rows[1]?.title.includes('FDE'), false);
});

test('reason 标题覆盖契约表，task 无细分时是任务奖励', () => {
  assert.equal(title('daily_grant'), '日免额度发放');
  assert.equal(title('daily_expire'), SESSION_LEDGER_RESET_NOTE);
  assert.equal(title('task_grant'), '任务奖励');
  assert.equal(title('task_grant', { refId: 'checkin:1' }), '每日签到奖励');
  assert.equal(title('task_grant', { refId: 'share_open' }), '每日分享 · 好友打开');
  assert.equal(title('task_grant', { refId: 'invite_register' }), '邀请注册奖励');
  assert.equal(title('membership_grant', { delta: 0, bucket: 'membership' }), '会员生效/续费');
  assert.equal(title('deduct', { delta: -1 }), 'AI 出题');
  assert.equal(title('release_restore'), '出题取消退回');
  assert.equal(title('reserve_hold', { delta: -1 }), '预扣');
  assert.equal(title('admin_revoke', { delta: -5, bucket: 'inventory' }), '权益调整（作废）');
  assert.equal(
    title('inventory_grant', { delta: 5, refId: 'order:abc', bucket: 'inventory' }),
    '场次加油包 · 5 场',
  );
  assert.equal(
    title('inventory_grant', { delta: 9, refId: 'session_pack:1', bucket: 'inventory' }),
    '场次加油包 · 9 场',
  );
  assert.equal(
    title('inventory_grant', { delta: 3, refId: 'admin:ops:1', bucket: 'inventory' }),
    '场次加油入账 · 3 场',
  );
  const zero = presentSessionLedgerRow(
    item({ id: 'member-use', delta: 0, reason: 'deduct', bucket: 'membership' }),
    '2026-11-07',
  );
  assert.equal(zero?.mark, 'neutral');
  assert.equal(zero?.deltaLabel, '0 场');
  assert.equal(formatLedgerDelta(4), '+4 场');
  assert.equal(formatLedgerDelta(-4).startsWith('−'), true);
});

test('上海日界：过了零点就不再写今天', () => {
  assert.equal(formatLedgerTime('2026-11-07T15:59:00.000Z', '2026-11-07'), '今天 23:59');
  assert.equal(formatLedgerTime('2026-11-07T16:00:00.000Z', '2026-11-07'), '11-08 00:00');
  assert.equal(formatLedgerTime('not-a-date', '2026-11-07'), '');
});

test('流水页识别失败时不留下半截条目，续拉按 id 追加', () => {
  const page = readEntitlementLedgerPage({
    items: [item({ id: 'a' })],
    nextCursor: 'cursor+/=',
  });
  assert.ok(page);
  assert.equal(page.nextCursor, 'cursor+/=');
  assert.equal(readEntitlementLedgerPage({ items: [{ id: 'x' }], nextCursor: null }), null);
  assert.equal(readEntitlementLedgerPage({ items: 'nope', nextCursor: null }), null);
  assert.equal(readEntitlementLedgerPage({ items: [], nextCursor: '' }), null);
  const more = appendLedgerItems(
    [item({ id: 'a' }), item({ id: 'b' })],
    [item({ id: 'b' }), item({ id: 'c' })],
  );
  assert.deepEqual(
    more.map((row) => row.id),
    ['a', 'b', 'c'],
  );
});

test('ledger 查询只拼既有 path', () => {
  assert.equal(entitlementLedgerPath(), '/me/entitlement/ledger');
  assert.equal(
    entitlementLedgerPath({ limit: SESSION_LEDGER_PAGE_LIMIT }),
    '/me/entitlement/ledger?limit=20',
  );
  assert.equal(
    entitlementLedgerPath({ limit: 20, cursor: 'a b/+' }),
    '/me/entitlement/ledger?limit=20&cursor=a%20b%2F%2B',
  );
  assert.equal(ENTITLEMENT_LEDGER_REASONS.includes('daily_grant'), true);
});

test('明细页源码不写死示意数字，也不支付', () => {
  const files = [
    'src/services/session-ledger-present.ts',
    'src/services/commerce-api.ts',
    'src/pages/commerce/session-ledger/index.tsx',
    'src/pages/commerce/session-ledger/index.css',
  ];
  const source = files.map((file) => readFileSync(join(miniRoot, file), 'utf8')).join('\n');
  const page = readFileSync(join(miniRoot, 'src/pages/commerce/session-ledger/index.tsx'), 'utf8');
  const config = readFileSync(join(miniRoot, 'src/app.config.ts'), 'utf8');
  assert.equal(
    /requestPayment|mock-notify|upgrade-quote|\/api\/orders|grantEntitlement/.test(source),
    false,
  );
  assert.equal(source.includes('membership-pay'), false);
  assert.equal(source.includes('session-pack-pay'), false);
  assert.equal(source.includes('v2.0.0'), false);
  assert.equal(source.includes('当前可用 3'), false);
  assert.equal(source.includes('今日消耗 2'), false);
  assert.equal(source.includes('库存 3'), false);
  assert.equal(source.includes('+2 场'), false);
  assert.equal(source.includes('+5 场'), false);
  assert.equal(source.includes('FDE'), false);
  assert.equal(source.includes('DEFAULT_DAILY_FREE_SESSIONS'), false);
  assert.match(page, /useDidShow/);
  assert.match(page, /fetchEntitlement\(/);
  assert.match(page, /fetchEntitlementLedger/);
  assert.match(page, /presentSessionLedgerAvailability/);
  assert.match(page, /filterSessionLedgerRows/);
  assert.match(page, /readEntitlementLedgerPage/);
  assert.equal(page.includes('CommerceStub'), false);
  assert.match(page, /SESSION_LEDGER_UNKNOWN/);
  assert.equal(SESSION_LEDGER_UNKNOWN, '—');
  assert.equal((config.match(/pages\/commerce\/session-ledger\/index/g) ?? []).length, 1);
  const barrel = readFileSync(join(miniRoot, '../../packages/shared/src/index.ts'), 'utf8');
  assert.equal(barrel.includes('node:'), false);
});

function title(reason: EntitlementLedgerReason, patch?: Partial<EntitlementLedgerItem>): string {
  const row = presentSessionLedgerRow(item({ reason, ...patch }), '2026-11-07');
  assert.ok(row);
  return row.title;
}

function item(patch?: Partial<EntitlementLedgerItem>): EntitlementLedgerItem {
  return {
    id: 'row-1',
    delta: 1,
    bucket: 'daily_free',
    reason: 'daily_grant',
    refType: 'grant',
    refId: 'ref',
    bizDate: '2026-11-07',
    createdAt: '2026-11-07T01:00:00.000Z',
    ...patch,
  };
}

function view(patch?: {
  membership?: Partial<EntitlementMembership>;
  balances?: Partial<EntitlementBalances>;
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
      dailyFreeQuota: 2,
      dailyTaskRemain: 0,
      inventoryRemain: 0,
      ...patch?.balances,
    },
    refine: { lifetimeUsed: 0, lifetimeLimitFree: 1, unlimited: false },
  };
}
