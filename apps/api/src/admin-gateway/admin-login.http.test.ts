import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode } from '@tishuashua/shared';
import Redis from 'ioredis';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { SessionService, adminSessionKey, sessionKey } from '../session/session.service';

const ENV_KEYS = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'REDIS_URL', 'DATABASE_URL'] as const;
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'ops';
const PASSWORD = 'correct-horse';

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

async function request(
  base: string,
  path: string,
  options: { method: 'GET' | 'POST'; token?: string; body?: unknown } = { method: 'GET' },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function redisAvailable(redisUrl: string): Promise<boolean> {
  const redis = new Redis(redisUrl, {
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  try {
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

describe('admin login http', { concurrency: 1 }, () => {
  test('参数错误、未配置帐号，以及没有会话时不能访问后管', async () => {
    const saved = saveEnv();
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
    let app: INestApplication | undefined;
    try {
      const booted = await boot();
      app = booted.app;

      const missing = await request(booted.base, '/admin/login', { method: 'POST', body: {} });
      assert.equal(missing.status, 400);
      assert.equal(missing.body.code, ApiErrorCode.VALIDATION_ERROR);

      const extra = await request(booted.base, '/admin/login', {
        method: 'POST',
        body: { username: 'admin', password: 'secret', token: 'nope' },
      });
      assert.equal(extra.status, 400);
      assert.equal(extra.body.code, ApiErrorCode.VALIDATION_ERROR);

      const login = await request(booted.base, '/admin/login', {
        method: 'POST',
        body: { username: 'admin', password: 'secret' },
      });
      assert.equal(login.status, 503);
      assert.equal(login.body.code, ApiErrorCode.ADMIN_NOT_CONFIGURED);
      assert.equal(JSON.stringify(login.body).includes('implemented'), false);

      const ping = await request(booted.base, '/admin/ping');
      assert.equal(ping.status, 401);
      assert.equal(ping.body.code, ApiErrorCode.UNAUTHORIZED);

      const logout = await request(booted.base, '/admin/logout', { method: 'POST' });
      assert.equal(logout.status, 401);
      assert.equal(logout.body.code, ApiErrorCode.UNAUTHORIZED);
    } finally {
      await app?.close();
      restoreEnv(saved);
    }
  });

  test('错误口令不创建会话；没有 Redis 时正确口令也不能登录', async () => {
    const saved = saveEnv();
    process.env.ADMIN_USERNAME = USERNAME;
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.REDIS_URL = '';
    let app: INestApplication | undefined;
    try {
      const booted = await boot();
      app = booted.app;

      const wrong = await request(booted.base, '/admin/login', {
        method: 'POST',
        body: { username: USERNAME, password: 'wrong-password' },
      });
      assert.equal(wrong.status, 401);
      assert.equal(wrong.body.code, ApiErrorCode.UNAUTHORIZED);
      assert.equal(wrong.body.message, '用户名或密码不正确');
      assert.equal(JSON.stringify(wrong.body).includes(PASSWORD), false);
      assert.equal('token' in wrong.body, false);

      const login = await request(booted.base, '/admin/login', {
        method: 'POST',
        body: { username: USERNAME, password: PASSWORD },
      });
      assert.equal(login.status, 503);
      assert.equal(login.body.code, ApiErrorCode.REDIS_UNAVAILABLE);
      assert.equal(JSON.stringify(login.body).includes(PASSWORD), false);
      assert.equal('token' in login.body, false);
    } finally {
      await app?.close();
      restoreEnv(saved);
    }
  });

  test('正确帐密写入后管会话，微信 token 不能访问，退出后会话失效', async (t) => {
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await redisAvailable(redisUrl))) {
      t.skip('Redis 不可用，跳过后管登录集成测试');
      return;
    }

    const saved = saveEnv();
    process.env.ADMIN_USERNAME = USERNAME;
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.REDIS_URL = redisUrl;

    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    const keys: string[] = [];
    let app: INestApplication | undefined;

    try {
      await redis.connect();
      const booted = await boot();
      app = booted.app;

      const wrong = await request(booted.base, '/admin/login', {
        method: 'POST',
        body: { username: 'someone', password: PASSWORD },
      });
      assert.equal(wrong.status, 401);
      assert.equal(JSON.stringify(wrong.body).includes(PASSWORD), false);

      const login = await request(booted.base, '/admin/login', {
        method: 'POST',
        body: { username: ` ${USERNAME} `, password: PASSWORD },
      });
      assert.equal(login.status, 200);
      assert.equal(typeof login.body.token, 'string');
      assert.equal(JSON.stringify(login.body).includes(PASSWORD), false);
      assert.equal(JSON.stringify(login.body).includes('implemented'), false);
      const token = login.body.token as string;
      const adminKey = adminSessionKey(token);
      keys.push(adminKey);
      const stored = await redis.get(adminKey);
      assert.equal(stored?.includes('"kind":"admin"'), true);
      assert.equal(stored?.includes(`"username":"${USERNAME}"`), true);
      assert.equal(await redis.get(sessionKey(token)), null);
      const expiresAt = Date.parse(String(login.body.expiresAt));
      assert.ok(expiresAt > Date.now());
      assert.ok(expiresAt < Date.now() + 8 * 24 * 60 * 60 * 1000);

      const ping = await request(booted.base, '/admin/ping', { method: 'GET', token });
      assert.equal(ping.status, 200);
      assert.equal(ping.body.ok, true);
      assert.deepEqual(ping.body.admin, { username: USERNAME });

      const anonymous = await request(booted.base, '/admin/ping');
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.body.code, ApiErrorCode.UNAUTHORIZED);

      const sessions = app.get(SessionService);
      const userSession = await sessions.create(`user-${randomUUID()}`);
      const userKey = sessionKey(userSession.token);
      keys.push(userKey);
      const asWechat = await request(booted.base, '/admin/ping', {
        method: 'GET',
        token: userSession.token,
      });
      assert.equal(asWechat.status, 401);
      assert.equal(asWechat.body.code, ApiErrorCode.UNAUTHORIZED);
      assert.notEqual(await redis.get(userKey), null);

      const logoutWechat = await request(booted.base, '/admin/logout', {
        method: 'POST',
        token: userSession.token,
      });
      assert.equal(logoutWechat.status, 401);
      assert.notEqual(await redis.get(userKey), null);

      const me = await request(booted.base, '/users/me', { method: 'GET', token });
      assert.equal(me.status, 401);
      assert.equal(me.body.code, ApiErrorCode.UNAUTHORIZED);

      const logout = await request(booted.base, '/admin/logout', { method: 'POST', token });
      assert.equal(logout.status, 200);
      assert.equal(logout.body.ok, true);
      assert.equal(await redis.get(adminKey), null);

      const after = await request(booted.base, '/admin/ping', { method: 'GET', token });
      assert.equal(after.status, 401);
      assert.equal(after.body.code, ApiErrorCode.UNAUTHORIZED);
    } finally {
      if (keys.length > 0) {
        await redis.del(...keys).catch(() => undefined);
      }
      redis.disconnect();
      await app?.close();
      restoreEnv(saved);
    }
  });
});
