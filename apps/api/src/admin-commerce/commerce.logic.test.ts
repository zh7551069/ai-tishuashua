import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  COMMERCE_SKUS_CACHE_KEY,
  DAILY_FREE_SESSIONS_CACHE_KEY,
  DEFAULT_DAILY_FREE_SESSIONS,
  MEMBER_DAILY_CAP_LOCKED,
  REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY,
  SKU_CODE_PATTERN,
  defaultGrowthConfig,
  parseGrowthConfig,
  parseQuotaWrite,
  parseSkuCreate,
  parseSkuUpdate,
  priceFenFromYuanInput,
} from '@tishuashua/shared';
import {
  SettingsCacheError,
  deleteCommerceCaches,
  readDailyFreeSessions,
  upsertSetting,
  type SettingsCache,
  type SettingsDb,
} from '@tishuashua/shared/commerce';
import { ensureEntitlementDay } from '@tishuashua/shared/entitlement';

const repoRoot = join(__dirname, '../../../..');

describe('commerce config rules', () => {
  test('配额只接受两个整数字段，会员日上限没有写入口', () => {
    const ok = parseQuotaWrite({ dailyFreeSessions: 3, refineLifetimeLimitFree: 1 });
    assert.equal(ok.ok, true);
    assert.equal(parseQuotaWrite({ dailyFreeSessions: 0, refineLifetimeLimitFree: 1 }).ok, false);
    assert.equal(parseQuotaWrite({ dailyFreeSessions: 3 }).ok, false);
    assert.equal(
      parseQuotaWrite({
        dailyFreeSessions: 3,
        refineLifetimeLimitFree: 1,
        memberDailyCap: { enabled: true },
      }).ok,
      false,
    );
    assert.equal(MEMBER_DAILY_CAP_LOCKED.uiLocked, true);
    assert.equal(MEMBER_DAILY_CAP_LOCKED.enabled, false);
    assert.equal(DEFAULT_DAILY_FREE_SESSIONS, 2);
  });

  test('增长配置全量校验，未知字段拒绝', () => {
    const defaults = defaultGrowthConfig();
    assert.equal(parseGrowthConfig(defaults).ok, true);
    const changed = defaultGrowthConfig();
    changed.checkin.rewardSessions = 2;
    const parsed = parseGrowthConfig(changed);
    assert.equal(parsed.ok && parsed.value.checkin.rewardSessions, 2);
    assert.equal(parseGrowthConfig({ ...defaults, extra: true }).ok, false);
    const missing = { ...defaults } as { checkin?: unknown };
    delete missing.checkin;
    assert.equal(parseGrowthConfig(missing).ok, false);
    const bad = defaultGrowthConfig();
    bad.share.rewardSessions = 1.5;
    assert.equal(parseGrowthConfig(bad).ok, false);
  });

  test('SKU code 创建后不可改，加油包默认库存 365 天', () => {
    assert.equal(SKU_CODE_PATTERN.test('member_month'), true);
    assert.equal(SKU_CODE_PATTERN.test('Member'), false);
    const created = parseSkuCreate({
      code: 'session_pack_9',
      type: 'session_pack',
      name: '加油',
      priceFen: 600,
      sessions: 9,
      summary: '九场',
    });
    assert.equal(created.ok && created.value.inventoryExpireDays, 365);
    assert.equal(created.ok && created.value.durationDays, null);
    assert.equal(parseSkuUpdate({ code: 'other', name: '改名' }, 'member').ok, false);
    assert.equal(parseSkuUpdate({ type: 'session_pack', name: '改名' }, 'member').ok, false);
    const price = parseSkuUpdate({ priceFen: 2900 }, 'member');
    assert.equal(price.ok && price.value.priceFen, 2900);
    assert.equal(priceFenFromYuanInput('29'), 2900);
    assert.equal(priceFenFromYuanInput('29.5'), 2950);
    assert.equal(priceFenFromYuanInput('29.555'), null);
  });

  test('改日免不回溯当日余额，跨日才用新值', async () => {
    const quota = { sessions: 3 };
    const fresh = accountDb(quota);
    const created = await ensureEntitlementDay(fresh.db, 'user-new', new Date('2026-11-07T03:00:00Z'));
    assert.equal(created.dailyFreeRemain, 3);

    const held = accountDb({ sessions: 2 });
    const first = await ensureEntitlementDay(held.db, 'user-old', new Date('2026-11-07T03:00:00Z'));
    assert.equal(first.dailyFreeRemain, 2);
    held.quota.sessions = 5;
    const sameDay = await ensureEntitlementDay(held.db, 'user-old', new Date('2026-11-07T10:00:00Z'));
    assert.equal(sameDay.dailyFreeRemain, 2);
    assert.equal(sameDay.businessDate, '2026-11-07');
    held.account!.business_date = '2026-11-06';
    const rolled = await ensureEntitlementDay(held.db, 'user-old', new Date('2026-11-07T10:00:00Z'));
    assert.equal(rolled.dailyFreeRemain, 5);
    assert.equal(rolled.businessDate, '2026-11-07');
  });

  test('写入后必须删除日免和提炼缓存', async () => {
    const cache = memoryCache({
      [DAILY_FREE_SESSIONS_CACHE_KEY]: '2',
      [REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY]: '1',
    });
    const db = settingsDb();
    await upsertSetting(db, 'dailyFreeSessions', { sessions: 3 }, 'ops');
    await deleteCommerceCaches(cache, [
      DAILY_FREE_SESSIONS_CACHE_KEY,
      REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY,
    ]);
    assert.equal(cache.store[DAILY_FREE_SESSIONS_CACHE_KEY], undefined);
    assert.equal(await readDailyFreeSessions(db, cache), 3);
    assert.equal(cache.store[DAILY_FREE_SESSIONS_CACHE_KEY], '3');
    const broken: SettingsCache = {
      async get() {
        return null;
      },
      async set() {
        return 'OK';
      },
      async del() {
        throw new Error('redis down');
      },
    };
    await assert.rejects(
      () => deleteCommerceCaches(broken, [DAILY_FREE_SESSIONS_CACHE_KEY]),
      (error: unknown) => error instanceof SettingsCacheError,
    );
    assert.equal(COMMERCE_SKUS_CACHE_KEY, 'commerce:skus:v1');
  });

  test('barrel 不导出 SQL 模块，迁移不建收款表', () => {
    const barrel = readFileSync(join(repoRoot, 'packages/shared/src/index.ts'), 'utf8');
    const config = readFileSync(join(repoRoot, 'packages/shared/src/commerce-config.ts'), 'utf8');
    const migration = readFileSync(
      join(repoRoot, 'apps/api/migrations/010_commerce_admin_config.sql'),
      'utf8',
    );
    assert.equal(barrel.includes('commerce-settings'), false);
    assert.equal(barrel.includes('node:crypto'), false);
    assert.equal(config.includes('node:'), false);
    assert.equal(/\bSELECT\b/i.test(config), false);
    assert.match(migration, /dailyFreeSessions/);
    assert.match(migration, /refineLifetimeLimitFree/);
    assert.match(migration, /growthConfig/);
    assert.match(migration, /commerce_skus/);
    assert.match(migration, /admin_audit_logs/);
    assert.match(migration, /member_week/);
    assert.match(migration, /session_pack_5/);
    assert.match(migration, /ON CONFLICT \(key\) DO NOTHING/);
    assert.match(migration, /ON CONFLICT \(code\) DO NOTHING/);
    assert.equal(/payment|orders|wx_notify|unifiedorder|pay\/wx|mch_id/i.test(migration), false);
    const nav = readFileSync(join(repoRoot, 'apps/admin/src/layout/nav.ts'), 'utf8');
    const app = readFileSync(join(repoRoot, 'apps/admin/src/App.tsx'), 'utf8');
    assert.match(nav, /\/commerce\/skus/);
    assert.match(nav, /\/commerce\/quota/);
    assert.match(nav, /\/commerce\/growth/);
    assert.match(nav, /免费用户题库优先/);
    assert.match(app, /QuotaPage/);
    assert.match(app, /SkusPage/);
    assert.match(app, /GrowthPage/);
    assert.equal(app.includes('确认补发'), false);
  });
});

function accountDb(quota: { sessions: number }): {
  db: SettingsDb;
  quota: { sessions: number };
  account: { business_date: string; daily_free_remain: number } | null;
} {
  const state: {
    quota: { sessions: number };
    account: { business_date: string; daily_free_remain: number } | null;
  } = { quota, account: null };
  const db: SettingsDb = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('system_settings')) {
        return { rows: [{ value: { sessions: state.quota.sessions }, updated_at: null, updated_by: 't' }] };
      }
      if (sql.includes('FROM entitlement_accounts')) {
        if (!state.account) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              user_id: params?.[0],
              business_date: state.account.business_date,
              daily_free_remain: state.account.daily_free_remain,
              daily_task_remain: 0,
              refine_lifetime_used: 0,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO entitlement_accounts')) {
        state.account = {
          business_date: String(params?.[1]),
          daily_free_remain: Number(params?.[2]),
        };
        return { rows: [] };
      }
      if (sql.includes('UPDATE entitlement_accounts')) {
        state.account = {
          business_date: String(params?.[2]),
          daily_free_remain: Number(params?.[1]),
        };
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    },
  };
  return { db, get quota() { return state.quota; }, get account() { return state.account; } };
}

function settingsDb(): SettingsDb & { value: unknown } {
  const state: { value: unknown } = { value: { sessions: 2 } };
  return {
    get value() {
      return state.value;
    },
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('INSERT INTO system_settings')) {
        state.value = JSON.parse(String(params?.[1]));
        return {
          rows: [{ value: state.value, updated_at: new Date('2026-11-07T08:00:00.000Z'), updated_by: params?.[2] }],
        };
      }
      return {
        rows: [{ value: state.value, updated_at: new Date('2026-11-07T08:00:00.000Z'), updated_by: 'admin' }],
      };
    },
  };
}

function memoryCache(initial: Record<string, string>): SettingsCache & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
    async get(key: string) {
      return store[key] ?? null;
    },
    async set(key: string, value: string) {
      store[key] = value;
      return 'OK';
    },
    async del(key: string) {
      delete store[key];
      return 1;
    },
  };
}
