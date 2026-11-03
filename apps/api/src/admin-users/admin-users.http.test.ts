import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type AdminUserList,
  type AdminUserSummary,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'users-admin';
const PASSWORD = 'users-secret';
const RAW_NICK = '备考同学';
const RAW_PHONE = '13800008000';
const MASKED_PHONE = '138****8000';
const ENV_KEYS = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'REDIS_URL',
  'DATABASE_URL',
  'WECHAT_LOGIN_MOCK',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'RATE_LIMIT_ADMIN_API_MAX',
  'RATE_LIMIT_ADMIN_IP_MAX',
  'RATE_LIMIT_WECHAT_API_MAX',
  'RATE_LIMIT_WECHAT_IP_MAX',
  'RATE_LIMIT_WECHAT_LOGIN_MAX',
] as const;

const savedEnv = new Map<string, string | undefined>();
const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  suffix: string;
  userA: string;
  userB: string;
  tokenA: string;
  openIdA: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  userA: '',
  userB: '',
  tokenA: '',
  openIdA: '',
};

describe('admin users', { concurrency: 1 }, () => {
  before(async () => {
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.ADMIN_USERNAME = USERNAME;
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.RATE_LIMIT_ADMIN_API_MAX = '100000';
    process.env.RATE_LIMIT_ADMIN_IP_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_API_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_IP_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_LOGIN_MAX = '100000';

    ctx.pool = new Pool({ connectionString: databaseUrl, max: 2 });
    ctx.suffix = randomUUID().replace(/-/g, '').slice(0, 8);
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
    await seed();
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.suffix) {
      const users = [ctx.userA, ctx.userB].filter(Boolean);
      if (users.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users])
          .catch(() => undefined);
      }
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    for (const key of ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test('没有后管会话或拿微信 token 不能看用户，后管 token 也不能看自己的小程序资料', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/users');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await call('/admin/users', { token: ctx.tokenA });
    assert.equal(wechat.status, 401);
    assert.equal(wechat.body.code, ApiErrorCode.UNAUTHORIZED);

    const detail = await call(`/admin/users/${ctx.userA}`, { token: ctx.tokenA });
    assert.equal(detail.status, 401);

    const admin = await adminToken();
    const me = await call('/users/me', { token: admin });
    assert.equal(me.status, 401);
    assert.equal(me.body.code, ApiErrorCode.UNAUTHORIZED);
  });

  test('列表按状态筛选，详情只给脱敏摘要', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const active = await findUser(admin, ctx.userA, 'active');
    const banned = await findUser(admin, ctx.userB, 'banned');
    const hiddenFromActive = await findUser(admin, ctx.userB, 'active');
    assert.ok(active);
    assert.ok(banned);
    assert.equal(hiddenFromActive, undefined);
    assert.equal(active?.nick, '备**学');
    assert.equal(active?.phoneMasked, MASKED_PHONE);
    assert.equal(active?.phoneBound, true);
    assert.equal(active?.status, 'active');
    assert.equal(banned?.nick, '张*丰');
    assert.equal(banned?.phoneMasked, null);
    assert.equal(banned?.phoneBound, false);
    assert.equal(banned?.status, 'banned');

    const detail = await call(`/admin/users/${ctx.userA}`, { token: admin });
    assert.equal(detail.status, 200);
    const user = detail.body as unknown as AdminUserSummary;
    assert.equal(user.id, ctx.userA);
    assert.equal(user.nick, '备**学');
    assert.equal(user.phoneMasked, MASKED_PHONE);
    assert.equal(JSON.stringify(user).includes(RAW_NICK), false);
    assert.equal(JSON.stringify(user).includes(ctx.openIdA), false);
    assert.equal(JSON.stringify(user).includes('wxOpenId'), false);

    const leaked = await call(`/admin/users/${ctx.userB}`, { token: admin });
    assert.equal(leaked.status, 200);
    assert.equal(JSON.stringify(leaked.body).includes(RAW_PHONE), false);
    assert.equal((leaked.body as unknown as AdminUserSummary).phoneMasked, null);
  });

  test('不存在、非法 id 和封禁写接口都不改状态', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const missing = await call(`/admin/users/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);

    const badId = await call('/admin/users/not-a-uuid', { token: admin });
    assert.equal(badId.status, 400);
    assert.equal(badId.body.code, ApiErrorCode.VALIDATION_ERROR);

    const invalid = await call('/admin/users?status=deleted', { token: admin });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, ApiErrorCode.VALIDATION_ERROR);

    const before = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [ctx.userA],
    );
    const ban = await call(`/admin/users/${ctx.userA}/ban`, {
      method: 'POST',
      token: admin,
      body: { status: 'banned' },
    });
    assert.equal(ban.status, 404);
    const after = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [ctx.userA],
    );
    assert.equal(before?.rows[0]?.status, 'active');
    assert.equal(after?.rows[0]?.status, 'active');
  });
});

async function seed(): Promise<void> {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('测试数据库未连接');
  }
  const loginA = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `users-admin-a-${ctx.suffix}`, nick: RAW_NICK },
  });
  assert.equal(loginA.status, 200);
  const userA = loginA.body as unknown as WechatLoginResponse;
  ctx.userA = userA.user.id;
  ctx.tokenA = userA.token;

  const loginB = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `users-admin-b-${ctx.suffix}`, nick: '张三丰' },
  });
  assert.equal(loginB.status, 200);
  ctx.userB = (loginB.body as unknown as WechatLoginResponse).user.id;

  const openId = await pool.query<{ wx_open_id: string }>(
    'SELECT wx_open_id FROM users WHERE id = $1',
    [ctx.userA],
  );
  ctx.openIdA = openId.rows[0]?.wx_open_id ?? '';
  assert.ok(ctx.openIdA);

  await pool.query(
    `
      UPDATE users
      SET phone_masked = $2, created_at = $3, updated_at = $3
      WHERE id = $1
    `,
    [ctx.userA, MASKED_PHONE, '2099-11-03T00:00:01.000Z'],
  );
  await pool.query(
    `
      UPDATE users
      SET phone_masked = $2, status = 'banned', created_at = $3, updated_at = $3
      WHERE id = $1
    `,
    [ctx.userB, RAW_PHONE, '2099-11-03T00:00:02.000Z'],
  );
}

async function findUser(
  token: string,
  id: string,
  status: string,
): Promise<AdminUserSummary | undefined> {
  for (let page = 1; page <= 5; page += 1) {
    const response = await call(`/admin/users?status=${status}&page=${page}&pageSize=100`, {
      token,
    });
    assert.equal(response.status, 200);
    const list = response.body as unknown as AdminUserList;
    const found = list.items.find((item) => item.id === id);
    if (found) {
      return found;
    }
    if (list.items.length < 100) {
      return undefined;
    }
  }
  return undefined;
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过后管用户集成测试');
    return false;
  }
  return true;
}

async function adminToken(): Promise<string> {
  const login = await call('/admin/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  assert.equal(login.status, 200);
  const token = (login.body as { token?: string }).token;
  assert.equal(typeof token, 'string');
  return token ?? '';
}

async function call(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
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
