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
const RAW_PHONE = '13800138000';

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

async function postPhone(
  base: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}/users/me/phone`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('wechat phone http', { concurrency: 1 }, () => {
  test('未登录不能绑定手机号', async () => {
    const saved = saveEnv();
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    let app: INestApplication | undefined;
    try {
      const booted = await boot();
      app = booted.app;

      const missing = await postPhone(booted.base, { code: `mock-phone-${RAW_PHONE}` });
      assert.equal(missing.status, 401);
      assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);
      assert.equal(JSON.stringify(missing.body).includes(RAW_PHONE), false);
    } finally {
      await app?.close();
      restoreEnv(saved);
    }
  });

  test('mock 下绑定成功、坏凭证不改号，响应没有完整手机号', async (t) => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      t.skip('PostgreSQL 或 Redis 不可用，跳过手机号绑定集成测试');
      return;
    }

    const saved = saveEnv();
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;

    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    let userId = '';
    let token = '';
    let app: INestApplication | undefined;

    try {
      await redis.connect();
      const booted = await boot();
      app = booted.app;

      const login = await fetch(`${booted.base}/auth/wechat/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: `phone-${randomUUID()}`, nick: '备考同学' }),
      });
      assert.equal(login.status, 200);
      const created = (await login.json()) as WechatLoginResponse;
      userId = created.user.id;
      token = created.token;
      assert.equal(created.user.phoneBound, false);

      const stranger = await postPhone(booted.base, { code: 'mock-fail' }, 'not-a-session');
      assert.equal(stranger.status, 401);
      assert.equal(stranger.body.code, ApiErrorCode.UNAUTHORIZED);

      const empty = await postPhone(booted.base, {}, token);
      assert.equal(empty.status, 400);
      assert.equal(empty.body.code, ApiErrorCode.VALIDATION_ERROR);

      const extra = await postPhone(
        booted.base,
        { code: `mock-phone-${RAW_PHONE}`, phone: RAW_PHONE },
        token,
      );
      assert.equal(extra.status, 400);
      assert.equal(extra.body.code, ApiErrorCode.VALIDATION_ERROR);

      const failed = await postPhone(booted.base, { code: 'mock-fail' }, token);
      assert.equal(failed.status, 401);
      assert.equal(failed.body.code, ApiErrorCode.WECHAT_AUTH_FAILED);
      assert.equal(JSON.stringify(failed.body).includes(RAW_PHONE), false);

      const bound = await postPhone(booted.base, { code: `mock-phone-${RAW_PHONE}` }, token);
      assert.equal(bound.status, 200);
      const user = bound.body as unknown as UserSummary;
      assert.equal(user.id, userId);
      assert.equal(user.nick, '备考同学');
      assert.equal(user.phoneBound, true);
      assert.equal(user.phoneMasked, '138****8000');
      assert.equal(JSON.stringify(bound.body).includes(RAW_PHONE), false);
      assert.equal('token' in bound.body, false);

      const row = await pool.query<{ phone_masked: string }>(
        'SELECT phone_masked FROM users WHERE id = $1',
        [userId],
      );
      assert.equal(row.rows[0]?.phone_masked, '138****8000');

      const me = await fetch(`${booted.base}/users/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const meBody = (await me.json()) as UserSummary;
      assert.equal(me.status, 200);
      assert.equal(meBody.phoneBound, true);
      assert.equal(meBody.phoneMasked, '138****8000');

      const againFailed = await postPhone(booted.base, { code: 'mock-fail' }, token);
      assert.equal(againFailed.status, 401);
      const kept = await pool.query<{ phone_masked: string }>(
        'SELECT phone_masked FROM users WHERE id = $1',
        [userId],
      );
      assert.equal(kept.rows[0]?.phone_masked, '138****8000');
    } finally {
      if (userId) {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
      }
      if (token) {
        await redis.del(sessionKey(token)).catch(() => undefined);
      }
      await app?.close();
      await pool.end().catch(() => undefined);
      redis.disconnect();
      restoreEnv(saved);
    }
  });
});
