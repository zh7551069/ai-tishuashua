import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  BUSINESS_TZ,
  DEFAULT_DAILY_FREE_SESSIONS,
  ENTITLEMENT_EXHAUSTED_CTA,
  ENTITLEMENT_DAY_RECONCILE_CRON,
  ENTITLEMENT_DAY_RECONCILE_JOB,
  businessDate,
  holdSessionEntitlement,
  isEntitlementDevGrantEnabled,
  parseDailyFreeQuota,
  parseGrantCommand,
  parseLedgerQuery,
  refineAccess,
  reserveIdempotencyKey,
  runEntitlementDayReconcile,
  sessionConsumesEntitlement,
} from '@tishuashua/shared';

const repoRoot = join(__dirname, '../../../..');

describe('entitlement rules', () => {
  test('业务日按 Asia/Shanghai 切日', () => {
    assert.equal(BUSINESS_TZ, 'Asia/Shanghai');
    assert.equal(businessDate(new Date('2026-11-07T15:59:00Z')), '2026-11-07');
    assert.equal(businessDate(new Date('2026-11-07T16:00:00Z')), '2026-11-08');
  });

  test('wrongSet 不占场，其余来源占场', async () => {
    assert.equal(sessionConsumesEntitlement('wrongSet'), false);
    assert.equal(sessionConsumesEntitlement('normal'), true);
    assert.equal(sessionConsumesEntitlement('retrain_similar'), true);
    assert.equal(sessionConsumesEntitlement('variant'), true);
    let queries = 0;
    const skipped = await holdSessionEntitlement(
      {
        query: async () => {
          queries += 1;
          return { rows: [] };
        },
      },
      'user',
      'wrongSet',
      '00000000-0000-4000-8000-000000000009',
    );
    assert.equal(skipped, 'skipped');
    assert.equal(queries, 0);
  });

  test('日免缺省 2，正整数配置可读', () => {
    assert.equal(DEFAULT_DAILY_FREE_SESSIONS, 2);
    assert.equal(parseDailyFreeQuota(undefined), null);
    assert.equal(parseDailyFreeQuota(0), null);
    assert.equal(parseDailyFreeQuota(2.5), null);
    assert.equal(parseDailyFreeQuota(3), 3);
    assert.equal(parseDailyFreeQuota('4'), 4);
    assert.equal(parseDailyFreeQuota({ value: 5 }), 5);
    assert.equal(parseDailyFreeQuota({ enabled: true }), null);
  });

  test('生产关闭灌数入口', () => {
    assert.equal(
      isEntitlementDevGrantEnabled({
        NODE_ENV: 'production',
        ENTITLEMENT_SEED: '1',
        WECHAT_LOGIN_MOCK: 'true',
      }),
      false,
    );
    assert.equal(isEntitlementDevGrantEnabled({ NODE_ENV: 'development' }), false);
    assert.equal(
      isEntitlementDevGrantEnabled({ NODE_ENV: 'development', ENTITLEMENT_SEED: '1' }),
      true,
    );
    assert.equal(
      isEntitlementDevGrantEnabled({ NODE_ENV: 'test', WECHAT_LOGIN_MOCK: 'true' }),
      true,
    );
  });

  test('提炼钩子：免费用户终身 1 次，会员不限', () => {
    assert.equal(refineAccess({ membershipActive: false, lifetimeUsed: 0 }).allowed, true);
    assert.equal(refineAccess({ membershipActive: false, lifetimeUsed: 1 }).allowed, false);
    assert.equal(refineAccess({ membershipActive: true, lifetimeUsed: 9 }).allowed, true);
    assert.equal(refineAccess({ membershipActive: true, lifetimeUsed: 9 }).unlimited, true);
  });

  test('发放参数和流水游标', () => {
    const grant = parseGrantCommand({ type: 'inventory', qty: 2, source: 'seed', refId: 'a' });
    assert.equal(grant.ok, true);
    assert.equal(parseGrantCommand({ type: 'pay', qty: 1, refId: 'a' }).ok, false);
    assert.equal(parseLedgerQuery(undefined, undefined).ok, true);
    if (parseLedgerQuery('20', '').ok) {
      assert.equal(parseLedgerQuery('20', '').ok, true);
    }
    const limited = parseLedgerQuery('20', '');
    assert.equal(limited.ok && limited.limit, 20);
    assert.equal(parseLedgerQuery('51', '').ok, false);
    assert.equal(parseLedgerQuery('0', '').ok, false);
    assert.equal(parseLedgerQuery('1', 'not-a-cursor').ok, false);
  });

  test('预扣幂等键', () => {
    assert.equal(
      reserveIdempotencyKey('11111111-1111-4111-8111-111111111111'),
      'reserve:session:11111111-1111-4111-8111-111111111111',
    );
  });

  test('日切对账只上报空跑', () => {
    const result = runEntitlementDayReconcile(new Date('2026-11-07T16:30:00Z'));
    assert.equal(result.job, ENTITLEMENT_DAY_RECONCILE_JOB);
    assert.equal(result.job, 'entitlement.day-reconcile');
    assert.equal(result.scanned, 0);
    assert.equal(result.ok, true);
    assert.equal(result.businessDate, '2026-11-08');
    assert.equal(ENTITLEMENT_DAY_RECONCILE_CRON, '5 0 * * *');
    const source = readFileSync(join(repoRoot, 'apps/worker/src/commerce-jobs.ts'), 'utf8');
    assert.match(source, /entitlement\.day-reconcile/);
    assert.match(source, /Asia\/Shanghai/);
    assert.equal(/unifiedorder|pay\/wx|mch_id/i.test(source), false);
  });

  test('本刀没有支付或微信回调代码', () => {
    const migration = readFileSync(
      join(repoRoot, 'apps/api/migrations/009_entitlement.sql'),
      'utf8',
    );
    assert.match(migration, /entitlement_accounts/);
    assert.match(migration, /entitlement_lots/);
    assert.match(migration, /entitlement_ledger/);
    assert.match(migration, /memberships/);
    assert.match(migration, /entitlement_reservations/);
    assert.equal(/payment|wx_notify|unifiedorder|pay\/wx|mch_id|orders/i.test(migration), false);
    const banned = /pay\/wx|unifiedorder|wxpay|WECHAT_MCH|mch_id|payment_notify/i;
    for (const file of walk(join(repoRoot, 'apps/api/src')).concat(
      walk(join(repoRoot, 'apps/worker/src')),
      walk(join(repoRoot, 'packages/shared/src')),
    )) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      assert.equal(banned.test(text), false, file);
    }
    assert.deepEqual(
      ENTITLEMENT_EXHAUSTED_CTA.map((item) => item.type),
      ['member', 'pack', 'task'],
    );
  });
});

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else {
      found.push(path);
    }
  }
  return found;
}
