import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode, type UserSummary, type WechatLoginResponse } from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { sessionKey } from '../session/session.service';

const ENV_KEYS = [
  'WECHAT_LOGIN_MOCK',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
] as const;

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

function saveEnv(): Map<(typeof ENV_KEYS)[number], string | undefined> {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved: Map<(typeof ENV_KEYS)[number], string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function boot(): Promise<{ app: INestApplication; base: string }> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number } | string | null;
  if (!address || typeof address === 'string') {
    await app.close();
    throw new Error('测试服务没有端口');
  }
  return { app, base: `http://127.0.0.1:${address.port}/api` };
}

async function postLogin(
  base: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}/auth/wechat/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function infraAvailable(databaseUrl: string, redisUrl: string): Promise<boolean> {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 1000,
    max: 1,
  });
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

describe('wechat login http', { concurrency: 1 }, () => {
  test('缺少 code、未配置微信、以及未登录访问当前用户', async () => {
    const saved = saveEnv();
    process.env.WECHAT_LOGIN_MOCK = 'false';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    let app: INestApplication | undefined;
    try {
      const booted = await boot();
      app = booted.app;

      const missing = await postLogin(booted.base, {});
      assert.equal(missing.status, 400);
      assert.equal(missing.body.code, ApiErrorCode.VALIDATION_ERROR);

      const extra = await postLogin(booted.base, { code: 'abc', phone: '13800000000' });
      assert.equal(extra.status, 400);
      assert.equal(extra.body.code, ApiErrorCode.VALIDATION_ERROR);

      const login = await postLogin(booted.base, { code: 'abc' });
      assert.equal(login.status, 503);
      assert.equal(login.body.code, ApiErrorCode.WECHAT_NOT_CONFIGURED);
      assert.equal(JSON.stringify(login.body).includes('session_key'), false);

      const me = await fetch(`${booted.base}/users/me`);
      const meBody = (await me.json()) as Record<string, unknown>;
      assert.equal(me.status, 401);
      assert.equal(meBody.code, ApiErrorCode.UNAUTHORIZED);

      const certificates = await fetch(`${booted.base}/certificates`);
      const certificatesBody = (await certificates.json()) as {
        code?: string;
        implemented?: boolean;
      };
      assert.equal(certificates.status, 401);
      assert.equal(certificatesBody.code, ApiErrorCode.UNAUTHORIZED);
      assert.equal(certificatesBody.implemented, undefined);

      const scores = await fetch(`${booted.base}/certificates/scores`);
      const scoresBody = (await scores.json()) as { implemented?: boolean };
      assert.equal(scores.status, 200);
      assert.equal(scoresBody.implemented, false);

      const wrongBook = await fetch(`${booted.base}/wrong-book`);
      const wrongBookBody = (await wrongBook.json()) as { code?: string };
      assert.equal(wrongBook.status, 401);
      assert.equal(wrongBookBody.code, ApiErrorCode.UNAUTHORIZED);
    } finally {
      await app?.close();
      restoreEnv(saved);
    }
  });

  test('mock 打开后，失败码不落库，没有数据库时不能登录', async () => {
    const saved = saveEnv();
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.DATABASE_URL = '';
    let app: INestApplication | undefined;
    try {
      const booted = await boot();
      app = booted.app;

      const failed = await postLogin(booted.base, { code: 'mock-fail' });
      assert.equal(failed.status, 401);
      assert.equal(failed.body.code, ApiErrorCode.WECHAT_AUTH_FAILED);

      const upstream = await postLogin(booted.base, { code: 'mock-upstream' });
      assert.equal(upstream.status, 502);
      assert.equal(upstream.body.code, ApiErrorCode.WECHAT_UNAVAILABLE);

      const login = await postLogin(booted.base, { code: 'dev-user-1', nick: '备考同学' });
      assert.equal(login.status, 503);
      assert.equal(login.body.code, ApiErrorCode.DATABASE_UNAVAILABLE);
      assert.equal(JSON.stringify(login.body).includes('dev-user-1'), false);
    } finally {
      await app?.close();
      restoreEnv(saved);
    }
  });

  test('code 注册用户、写入 Redis，并用 token 访问当前用户', async (t) => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      t.skip('PostgreSQL 或 Redis 不可用，跳过登录集成测试');
      return;
    }

    const saved = saveEnv();
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;

    const code = `it-${randomUUID()}`;
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    const tokens: string[] = [];
    let userId = '';
    let app: INestApplication | undefined;

    try {
      await redis.connect();
      const booted = await boot();
      app = booted.app;

      const created = await postLogin(booted.base, {
        code,
        nick: '备考同学',
        avatar: 'https://example.com/a.png',
      });
      assert.equal(created.status, 200);
      const first = created.body as unknown as WechatLoginResponse;
      assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/);
      assert.equal(first.user.nick, '备考同学');
      assert.equal(first.user.avatar, 'https://example.com/a.png');
      assert.equal(first.user.phoneMasked, null);
      assert.equal(first.user.phoneBound, false);
      assert.equal(first.user.unionId, null);
      assert.equal(first.user.status, 'active');
      assert.match(first.user.wxOpenId, /^mock_[0-9a-f]{24}$/);
      assert.equal(JSON.stringify(created.body).includes('session_key'), false);
      assert.equal('implemented' in created.body, false);
      assert.ok(Date.parse(first.expiresAt) > Date.now() + 6 * 24 * 60 * 60 * 1000);
      userId = first.user.id;
      tokens.push(first.token);

      const stored = await redis.get(sessionKey(first.token));
      assert.equal(stored?.includes(userId), true);
      assert.equal(stored?.includes('session_key'), false);

      const meResponse = await fetch(`${booted.base}/users/me`, {
        headers: { authorization: `Bearer ${first.token}` },
      });
      const me = (await meResponse.json()) as UserSummary;
      assert.equal(meResponse.status, 200);
      assert.equal(me.id, userId);
      assert.equal(me.phoneMasked, null);
      assert.equal(me.phoneBound, false);

      await redis.expire(sessionKey(first.token), 30);
      const slid = await fetch(`${booted.base}/users/me`, {
        headers: { authorization: `Bearer ${first.token}` },
      });
      assert.equal(slid.status, 200);
      const ttl = await redis.ttl(sessionKey(first.token));
      assert.ok(ttl > 1000);

      const again = await postLogin(booted.base, { code });
      assert.equal(again.status, 200);
      const second = again.body as unknown as WechatLoginResponse;
      assert.equal(second.user.id, userId);
      assert.equal(second.user.nick, '备考同学');
      assert.notEqual(second.token, first.token);
      tokens.push(second.token);

      await pool.query(
        `UPDATE users SET union_id = 'union-kept', phone_masked = '138****2160' WHERE id = $1`,
        [userId],
      );
      const kept = await postLogin(booted.base, { code });
      const keptUser = (kept.body as unknown as WechatLoginResponse).user;
      tokens.push((kept.body as unknown as WechatLoginResponse).token);
      assert.equal(kept.status, 200);
      assert.equal(keptUser.unionId, 'union-kept');
      assert.equal(keptUser.phoneMasked, '138****2160');
      assert.equal(keptUser.phoneBound, true);
      assert.equal(keptUser.nick, '备考同学');

      const count = await pool.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM users WHERE wx_open_id = $1',
        [first.user.wxOpenId],
      );
      assert.equal(count.rows[0]?.count, 1);

      await pool.query(`UPDATE users SET status = 'banned' WHERE id = $1`, [userId]);
      const banned = await postLogin(booted.base, { code });
      assert.equal(banned.status, 403);
      assert.equal(banned.body.code, ApiErrorCode.FORBIDDEN);

      const bannedMe = await fetch(`${booted.base}/users/me`, {
        headers: { authorization: `Bearer ${first.token}` },
      });
      const bannedBody = (await bannedMe.json()) as Record<string, unknown>;
      assert.equal(bannedMe.status, 403);
      assert.equal(bannedBody.code, ApiErrorCode.FORBIDDEN);

      const missing = await fetch(`${booted.base}/users/me`, {
        headers: { authorization: 'Bearer not-a-session' },
      });
      assert.equal(missing.status, 401);
    } finally {
      if (userId) {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
      }
      if (tokens.length > 0) {
        await redis.del(...tokens.map((token) => sessionKey(token))).catch(() => undefined);
      }
      await app?.close();
      await pool.end().catch(() => undefined);
      redis.disconnect();
      restoreEnv(saved);
    }
  });
});
