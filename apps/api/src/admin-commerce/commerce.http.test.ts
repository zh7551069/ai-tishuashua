import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  DAILY_FREE_SESSIONS_CACHE_KEY,
  FREE_USER_BANK_FIRST_SETTING_KEY,
  defaultGrowthConfig,
  type CommerceQuotaView,
  type CommerceSku,
  type GrowthConfigView,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  token: string;
  userIds: string[];
  createdSku: string;
} = {
  ready: false,
  base: '',
  token: '',
  userIds: [],
  createdSku: '',
};

describe('admin commerce config', { concurrency: 1 }, () => {
  before(async () => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }
    process.env.ADMIN_USERNAME = 'ops';
    process.env.ADMIN_PASSWORD = 'correct-horse';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    ctx.pool = new Pool({ connectionString: databaseUrl, max: 4 });
    ctx.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    ctx.redis.on('error', () => undefined);
    await ctx.redis.connect();
    const app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number } | string | null;
    if (!address || typeof address === 'string') {
      await app.close();
      throw new Error('测试服务没有端口');
    }
    ctx.app = app;
    ctx.base = `http://127.0.0.1:${address.port}/api`;
    const login = await request('/admin/login', {
      method: 'POST',
      body: { username: 'ops', password: 'correct-horse' },
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    ctx.token = String(login.body.token);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.token) {
      await request('/admin/commerce/quota/reset', { method: 'POST', token: ctx.token }).catch(
        () => undefined,
      );
      await request('/admin/commerce/growth/reset', { method: 'POST', token: ctx.token }).catch(
        () => undefined,
      );
      await pool
        .query(
          `
            UPDATE commerce_skus
            SET price_fen = 2800, enabled = true, updated_by = 'admin'
            WHERE code = 'member_month'
          `,
        )
        .catch(() => undefined);
      await pool
        .query(`UPDATE commerce_skus SET enabled = true, updated_by = 'admin' WHERE code = 'session_pack_5'`)
        .catch(() => undefined);
      if (ctx.createdSku) {
        await pool.query('DELETE FROM commerce_skus WHERE code = $1', [ctx.createdSku]).catch(() => undefined);
      }
    }
    if (pool && ctx.userIds.length > 0) {
      await pool
        .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ctx.userIds])
        .catch(() => undefined);
    }
    await ctx.redis?.del(DAILY_FREE_SESSIONS_CACHE_KEY).catch(() => undefined);
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('配额、日免不回溯、SKU、增长、旧开关和鉴权', async (t) => {
    if (!ctx.ready || !ctx.pool || !ctx.redis) {
      t.skip('PostgreSQL 或 Redis 不可用');
      return;
    }

    const anon = await request('/admin/commerce/quota');
    assert.equal(anon.status, 401);
    assert.equal(anon.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await request('/auth/wechat/login', {
      method: 'POST',
      body: { code: `commerce-${randomUUID()}`, nick: 'commerce' },
    });
    assert.equal(wechat.status, 200);
    const wechatToken = String(wechat.body.token);
    const wechatUser = (wechat.body.user as { id?: string } | undefined)?.id;
    if (wechatUser) {
      ctx.userIds.push(wechatUser);
    }
    const denied = await request('/admin/commerce/growth', { token: wechatToken });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.code, ApiErrorCode.UNAUTHORIZED);

    await ctx.redis.set(DAILY_FREE_SESSIONS_CACHE_KEY, '9', 'EX', 60);
    const saved = await request('/admin/commerce/quota', {
      method: 'PUT',
      token: ctx.token,
      body: { dailyFreeSessions: 3, refineLifetimeLimitFree: 1 },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const quota = saved.body as unknown as CommerceQuotaView;
    assert.equal(quota.dailyFreeSessions, 3);
    assert.equal(quota.memberDailyCap.uiLocked, true);
    assert.equal(quota.memberDailyCap.enabled, false);
    assert.equal(quota.timezone, 'Asia/Shanghai');
    assert.equal(await ctx.redis.get(DAILY_FREE_SESSIONS_CACHE_KEY), null);
    const again = await request('/admin/commerce/quota', { token: ctx.token });
    assert.equal((again.body as unknown as CommerceQuotaView).dailyFreeSessions, 3);
    const audit = await ctx.pool.query(
      `
        SELECT action, target
        FROM admin_audit_logs
        WHERE actor = 'ops' AND action = 'commerce.quota.update'
        ORDER BY id DESC
        LIMIT 1
      `,
    );
    assert.equal(audit.rows[0]?.action, 'commerce.quota.update');
    assert.equal(audit.rows[0]?.target, 'quota');

    const newbie = await loginUser('quota3');
    assert.equal((await entitlement(newbie.token)).balances.dailyFreeRemain, 3);

    await request('/admin/commerce/quota/reset', { method: 'POST', token: ctx.token });
    const held = await loginUser('held');
    assert.equal((await entitlement(held.token)).balances.dailyFreeRemain, 2);
    const raised = await request('/admin/commerce/quota', {
      method: 'PUT',
      token: ctx.token,
      body: { dailyFreeSessions: 5, refineLifetimeLimitFree: 1 },
    });
    assert.equal(raised.status, 200);
    assert.equal((await entitlement(held.token)).balances.dailyFreeRemain, 2);
    const rolled = await loginUser('rolled');
    await ctx.pool.query(
      `
        INSERT INTO entitlement_accounts (
          user_id, business_date, daily_free_remain, daily_task_remain, refine_lifetime_used
        )
        VALUES ($1, (timezone('Asia/Shanghai', now()))::date - 1, 2, 0, 0)
      `,
      [rolled.userId],
    );
    assert.equal((await entitlement(rolled.token)).balances.dailyFreeRemain, 5);

    const extra = await request('/admin/commerce/quota', {
      method: 'PUT',
      token: ctx.token,
      body: { dailyFreeSessions: 5, refineLifetimeLimitFree: 1, memberDailyCap: { enabled: true } },
    });
    assert.equal(extra.status, 400);
    assert.equal(extra.body.code, ApiErrorCode.VALIDATION_ERROR);
    const forbiddenKeys = await ctx.pool.query(
      `
        SELECT key FROM system_settings
        WHERE key IN ('memberDailyCap', 'memberDailyCapEnabled', 'member_quota', 'freeUserBankFirst2')
      `,
    );
    assert.equal(forbiddenKeys.rowCount, 0);

    const list = await request('/admin/commerce/skus', { token: ctx.token });
    assert.equal(list.status, 200);
    const items = (list.body as { items?: CommerceSku[] }).items ?? [];
    const codes = items.map((item) => item.code);
    for (const code of ['member_week', 'member_month', 'member_quarter', 'member_year', 'session_pack_5']) {
      assert.equal(codes.includes(code), true, code);
    }
    const priced = await request('/admin/commerce/skus/member_month', {
      method: 'PUT',
      token: ctx.token,
      body: { priceFen: 2900 },
    });
    assert.equal(priced.status, 200, JSON.stringify(priced.body));
    const month = priced.body as unknown as CommerceSku;
    assert.equal(month.code, 'member_month');
    assert.equal(month.priceFen, 2900);
    assert.equal(month.priceYuan, 29);
    const frozen = await request('/admin/commerce/skus/member_month', {
      method: 'PUT',
      token: ctx.token,
      body: { code: 'member_year', priceFen: 2800 },
    });
    assert.equal(frozen.status, 400);
    assert.equal(frozen.body.code, ApiErrorCode.VALIDATION_ERROR);
    const still = await request('/admin/commerce/skus/member_month', { token: ctx.token });
    assert.equal((still.body as unknown as CommerceSku).code, 'member_month');
    assert.equal((still.body as unknown as CommerceSku).priceFen, 2900);

    const disabled = await request('/admin/commerce/skus/session_pack_5/disable', {
      method: 'POST',
      token: ctx.token,
    });
    assert.equal(disabled.status, 200);
    assert.equal((disabled.body as unknown as CommerceSku).enabled, false);
    const filtered = await request('/admin/commerce/skus?status=disabled', { token: ctx.token });
    const disabledCodes = ((filtered.body as { items?: CommerceSku[] }).items ?? []).map((item) => item.code);
    assert.equal(disabledCodes.includes('session_pack_5'), true);
    await request('/admin/commerce/skus/session_pack_5/enable', { method: 'POST', token: ctx.token });

    const growthBody = defaultGrowthConfig();
    growthBody.checkin.rewardSessions = 2;
    const growth = await request('/admin/commerce/growth', {
      method: 'PUT',
      token: ctx.token,
      body: growthBody,
    });
    assert.equal(growth.status, 200, JSON.stringify(growth.body));
    assert.equal((growth.body as unknown as GrowthConfigView).checkin.rewardSessions, 2);
    const illegal = await request('/admin/commerce/growth', {
      method: 'PUT',
      token: ctx.token,
      body: { ...growthBody, surprise: 1 },
    });
    assert.equal(illegal.status, 400);
    assert.equal(illegal.body.code, ApiErrorCode.VALIDATION_ERROR);
    const reset = await request('/admin/commerce/growth/reset', { method: 'POST', token: ctx.token });
    assert.equal(reset.status, 200);
    assert.equal((reset.body as unknown as GrowthConfigView).checkin.rewardSessions, 1);

    const bankBefore = await request('/admin/system-settings/freeUserBankFirst', { token: ctx.token });
    assert.equal(bankBefore.status, 200);
    assert.equal(bankBefore.body.key, FREE_USER_BANK_FIRST_SETTING_KEY);
    const bankOn = await request('/admin/system-settings/freeUserBankFirst', {
      method: 'PUT',
      token: ctx.token,
      body: { enabled: bankBefore.body.enabled !== true },
    });
    assert.equal(bankOn.status, 200);
    await request('/admin/system-settings/freeUserBankFirst', {
      method: 'PUT',
      token: ctx.token,
      body: { enabled: bankBefore.body.enabled === true },
    });
    const keys = await ctx.pool.query(`SELECT key FROM system_settings WHERE key LIKE '%Bank%' OR key LIKE '%bank%'`);
    assert.deepEqual(
      keys.rows.map((row) => row.key),
      [FREE_USER_BANK_FIRST_SETTING_KEY],
    );

    ctx.createdSku = `pack_${randomUUID().slice(0, 8)}`;
    const created = await request('/admin/commerce/skus', {
      method: 'POST',
      token: ctx.token,
      body: {
        code: ctx.createdSku,
        type: 'session_pack',
        name: '测试加油',
        priceFen: 100,
        sessions: 1,
        summary: '测试',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const duplicate = await request('/admin/commerce/skus', {
      method: 'POST',
      token: ctx.token,
      body: {
        code: ctx.createdSku,
        type: 'session_pack',
        name: '测试加油',
        priceFen: 100,
        sessions: 1,
        summary: '测试',
      },
    });
    assert.equal(duplicate.status, 409);
  });
});

async function loginUser(label: string): Promise<{ token: string; userId: string }> {
  const response = await request('/auth/wechat/login', {
    method: 'POST',
    body: { code: `${label}-${randomUUID()}`, nick: label },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const userId = String((response.body.user as { id: string }).id);
  ctx.userIds.push(userId);
  return { token: String(response.body.token), userId };
}

async function entitlement(token: string): Promise<{
  balances: { dailyFreeRemain: number };
}> {
  const response = await request('/me/entitlement', { token });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as { balances: { dailyFreeRemain: number } };
}

async function request(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${ctx.base}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { status: response.status, body };
}

async function infraAvailable(databaseUrl: string, redisUrl: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000, max: 1 });
  const redis = new Redis(redisUrl, {
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  try {
    await pool.query('SELECT 1');
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
    redis.disconnect();
  }
}
