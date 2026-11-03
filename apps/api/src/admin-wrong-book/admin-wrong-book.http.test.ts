import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type AdminWrongBookDetail,
  type AdminWrongBookList,
  type WechatLoginResponse,
  type WrongBookList,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'wrong-book-admin';
const PASSWORD = 'wrong-book-secret';
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
  domainId: string;
  certA: string;
  certB: string;
  userA: string;
  userB: string;
  tokenA: string;
  tokenB: string;
  newestId: string;
  middleId: string;
  olderId: string;
  clearedId: string;
  kpId: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  domainId: '',
  certA: '',
  certB: '',
  userA: '',
  userB: '',
  tokenA: '',
  tokenB: '',
  newestId: '',
  middleId: '',
  olderId: '',
  clearedId: '',
  kpId: '',
};

describe('admin wrong book', { concurrency: 1 }, () => {
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
      const ids = [ctx.newestId, ctx.middleId, ctx.olderId, ctx.clearedId].filter(Boolean);
      if (ids.length > 0) {
        await pool
          .query('DELETE FROM wrong_items WHERE id = ANY($1::uuid[])', [ids])
          .catch(() => undefined);
      }
      const users = [ctx.userA, ctx.userB].filter(Boolean);
      if (users.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users])
          .catch(() => undefined);
      }
      if (ctx.domainId) {
        await pool
          .query('DELETE FROM certificates WHERE domain_id = $1', [ctx.domainId])
          .catch(() => undefined);
        await pool
          .query('DELETE FROM domains WHERE id = $1', [ctx.domainId])
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

  test('没有后管会话或拿微信 token 不能看全站错题', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/wrong-book');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await call('/admin/wrong-book', { token: ctx.tokenA });
    assert.equal(wechat.status, 401);
    assert.equal(wechat.body.code, ApiErrorCode.UNAUTHORIZED);

    const detail = await call(`/admin/wrong-book/${ctx.newestId}`, { token: ctx.tokenB });
    assert.equal(detail.status, 401);

    const admin = await adminToken();
    const crossed = await call('/wrong-book', { token: admin });
    assert.equal(crossed.status, 401);
    assert.equal(crossed.body.code, ApiErrorCode.UNAUTHORIZED);
  });

  test('后管默认分页看全部用户，并能按用户、证书和状态筛选', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const all = await call('/admin/wrong-book', { token: admin });
    assert.equal(all.status, 200);
    const list = all.body as unknown as AdminWrongBookList;
    assert.ok(list.total >= 4);
    assert.equal(list.page, 1);
    assert.equal(list.pageSize, 20);
    assert.ok(list.items.every((item) => !('options' in item)));

    const byOwner = await call(`/admin/wrong-book?userId=${ctx.userA}`, { token: admin });
    const ownerList = byOwner.body as unknown as AdminWrongBookList;
    assert.equal(byOwner.status, 200);
    assert.equal(ownerList.total, 3);
    assert.deepEqual(
      ownerList.items.map((item) => item.id),
      [ctx.newestId, ctx.olderId, ctx.clearedId],
    );
    assert.equal(ownerList.items[0]?.userNick, '错题甲');
    assert.equal(ownerList.items[0]?.stem, '后管可见的题干');

    const byUser = await call(`/admin/wrong-book?userId=${ctx.userB}`, { token: admin });
    const userList = byUser.body as unknown as AdminWrongBookList;
    assert.equal(byUser.status, 200);
    assert.equal(userList.total, 1);
    assert.equal(userList.items[0]?.id, ctx.middleId);
    assert.equal(userList.items[0]?.userNick, null);

    const byCert = await call(`/admin/wrong-book?certId=${ctx.certB}`, { token: admin });
    const certList = byCert.body as unknown as AdminWrongBookList;
    assert.equal(certList.total, 1);
    assert.equal(certList.items[0]?.id, ctx.olderId);
    assert.equal(certList.items[0]?.certName, '错题证书乙');

    const pending = await call(
      `/admin/wrong-book?userId=${ctx.userA}&certId=${ctx.certA}&status=pending`,
      { token: admin },
    );
    const pendingList = pending.body as unknown as AdminWrongBookList;
    assert.equal(pendingList.total, 1);
    assert.equal(pendingList.items[0]?.id, ctx.newestId);

    const cleared = await call(`/admin/wrong-book?userId=${ctx.userA}&status=cleared`, {
      token: admin,
    });
    const clearedList = cleared.body as unknown as AdminWrongBookList;
    assert.equal(clearedList.total, 1);
    assert.equal(clearedList.items[0]?.id, ctx.clearedId);
    assert.equal(clearedList.items[0]?.stem, '题目内容无法读取');
    assert.equal(clearedList.items[0]?.status, 'cleared');

    const page = await call(`/admin/wrong-book?userId=${ctx.userA}&page=2&pageSize=1`, {
      token: admin,
    });
    const pageList = page.body as unknown as AdminWrongBookList;
    assert.equal(pageList.total, 3);
    assert.equal(pageList.page, 2);
    assert.equal(pageList.pageSize, 1);
    assert.equal(pageList.items[0]?.id, ctx.olderId);

    const beyond = await call(`/admin/wrong-book?userId=${ctx.userA}&page=9`, { token: admin });
    const beyondList = beyond.body as unknown as AdminWrongBookList;
    assert.equal(beyondList.total, 3);
    assert.deepEqual(beyondList.items, []);
  });

  test('非法筛选返回 400，详情只读且拒绝消灭', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const badStatus = await call('/admin/wrong-book?status=gone', { token: admin });
    assert.equal(badStatus.status, 400);
    assert.equal(badStatus.body.code, ApiErrorCode.VALIDATION_ERROR);

    const badUser = await call('/admin/wrong-book?userId=abc', { token: admin });
    assert.equal(badUser.status, 400);

    const badPage = await call('/admin/wrong-book?pageSize=101', { token: admin });
    assert.equal(badPage.status, 400);

    const detail = await call(`/admin/wrong-book/${ctx.newestId}`, { token: admin });
    assert.equal(detail.status, 200);
    const item = detail.body as unknown as AdminWrongBookDetail;
    assert.equal(item.userId, ctx.userA);
    assert.equal(item.domainName, '错题领域');
    assert.deepEqual(item.answer, ['A', 'B']);
    assert.equal(item.analysis, '两个都对');
    assert.equal(item.score, 2);
    assert.deepEqual(item.kpIds, [ctx.kpId]);
    assert.equal(item.options.length, 2);

    const missing = await call(`/admin/wrong-book/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);

    const notUuid = await call('/admin/wrong-book/not-a-uuid', { token: admin });
    assert.equal(notUuid.status, 400);

    const before = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM wrong_items WHERE id = $1',
      [ctx.newestId],
    );
    const clear = await call(`/admin/wrong-book/${ctx.newestId}/clear`, {
      method: 'POST',
      token: admin,
    });
    assert.equal(clear.status, 404);
    const after = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM wrong_items WHERE id = $1',
      [ctx.newestId],
    );
    assert.equal(before?.rows[0]?.status, 'pending');
    assert.equal(after?.rows[0]?.status, 'pending');
  });

  test('小程序错题本仍然只能看自己的', async (t) => {
    if (!ready(t)) {
      return;
    }
    const own = await call('/wrong-book?status=all', { token: ctx.tokenB });
    assert.equal(own.status, 200);
    const list = own.body as unknown as WrongBookList;
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0]?.id, ctx.middleId);
    assert.equal(
      list.items.some((item) => item.id === ctx.newestId),
      false,
    );
  });
});

async function seed(): Promise<void> {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('测试数据库未连接');
  }
  ctx.domainId = randomUUID();
  ctx.certA = randomUUID();
  ctx.certB = randomUUID();
  ctx.newestId = randomUUID();
  ctx.middleId = randomUUID();
  ctx.olderId = randomUUID();
  ctx.clearedId = randomUUID();
  ctx.kpId = randomUUID();

  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '错题领域', 'online', 0)`,
    [ctx.domainId, `wb-${ctx.suffix}-d`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score,
        enabled_question_type_codes, sort_order
      )
      VALUES
        ($1, $2, $3, '错题证书甲', 'online', 100, 60, ARRAY['single','multi','judge'], 0),
        ($4, $2, $5, '错题证书乙', 'online', 100, 60, ARRAY['single','multi','judge'], 1)
    `,
    [ctx.certA, ctx.domainId, `wb-${ctx.suffix}-a`, ctx.certB, `wb-${ctx.suffix}-b`],
  );

  const loginA = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `wrong-book-a-${ctx.suffix}`, nick: '错题甲' },
  });
  assert.equal(loginA.status, 200);
  const userA = loginA.body as unknown as WechatLoginResponse;
  ctx.userA = userA.user.id;
  ctx.tokenA = userA.token;

  const loginB = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `wrong-book-b-${ctx.suffix}` },
  });
  assert.equal(loginB.status, 200);
  const userB = loginB.body as unknown as WechatLoginResponse;
  ctx.userB = userB.user.id;
  ctx.tokenB = userB.token;

  const now = Date.now();
  await pool.query(
    `
      INSERT INTO wrong_items (
        id, user_id, cert_id, kp_ids, question_snapshot, status, wrong_count, updated_at
      )
      VALUES
        ($1, $2, $3, $4::uuid[], $5::jsonb, 'pending', 3, $6),
        ($7, $8, $3, '{}', $9::jsonb, 'pending', 1, $10),
        ($11, $2, $12, '{}', $13::jsonb, 'pending', 2, $14),
        ($15, $2, $3, '{}', 'null'::jsonb, 'cleared', 1, $16)
    `,
    [
      ctx.newestId,
      ctx.userA,
      ctx.certA,
      [ctx.kpId],
      JSON.stringify({
        type: 'multi',
        stem: '后管可见的题干',
        options: [
          { id: 'A', text: '甲' },
          { id: 'B', text: '乙' },
        ],
        answer: ['A', 'B'],
        analysis: '两个都对',
        score: 2,
      }),
      new Date(now).toISOString(),
      ctx.middleId,
      ctx.userB,
      JSON.stringify({ type: 'single', stem: '乙的未消灭题', options: [], answer: ['A'] }),
      new Date(now - 60_000).toISOString(),
      ctx.olderId,
      ctx.certB,
      JSON.stringify({ type: 'judge', stem: '另一张证书', options: [], answer: ['T'] }),
      new Date(now - 120_000).toISOString(),
      ctx.clearedId,
      new Date(now - 180_000).toISOString(),
    ],
  );
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过后管错题集成测试');
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
