import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  FREE_USER_BANK_FIRST_CACHE_KEY,
  readFreeUserBankFirst,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

describe('admin freeUserBankFirst', { concurrency: 1 }, () => {
  test('后管读写开关，非法 body 与微信 token 被拒绝，PUT 后缓存失效', async (t) => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      t.skip('PostgreSQL 或 Redis 不可用，跳过后管开关集成测试');
      return;
    }
    const saved = {
      adminUser: process.env.ADMIN_USERNAME,
      adminPassword: process.env.ADMIN_PASSWORD,
      databaseUrl: process.env.DATABASE_URL,
      redisUrl: process.env.REDIS_URL,
      wechatMock: process.env.WECHAT_LOGIN_MOCK,
    };
    process.env.ADMIN_USERNAME = 'ops';
    process.env.ADMIN_PASSWORD = 'correct-horse';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.WECHAT_LOGIN_MOCK = 'true';

    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on('error', () => undefined);
    let app: INestApplication | undefined;
    let previous: { enabled?: unknown } | undefined;
    const userIds: string[] = [];
    try {
      app = await NestFactory.create(AppModule, { logger: false });
      configureHttp(app);
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address() as { port: number } | string | null;
      if (!address || typeof address === 'string') {
        throw new Error('测试服务没有端口');
      }
      const base = `http://127.0.0.1:${address.port}/api`;
      const anon = await request(base, '/admin/system-settings/freeUserBankFirst');
      assert.equal(anon.status, 401);
      assert.equal(anon.body.code, ApiErrorCode.UNAUTHORIZED);

      const wechat = await request(base, '/auth/wechat/login', {
        method: 'POST',
        body: { code: `settings-${randomUUID()}`, nick: 'settings' },
      });
      assert.equal(wechat.status, 200);
      const wechatToken = String(wechat.body.token);
      const wechatUser = wechat.body.user as { id?: string } | undefined;
      if (wechatUser?.id) {
        userIds.push(wechatUser.id);
      }
      const denied = await request(base, '/admin/system-settings/freeUserBankFirst', {
        token: wechatToken,
      });
      assert.equal(denied.status, 401);
      assert.equal(denied.body.code, ApiErrorCode.UNAUTHORIZED);

      const login = await request(base, '/admin/login', {
        method: 'POST',
        body: { username: 'ops', password: 'correct-horse' },
      });
      assert.equal(login.status, 200);
      const token = String(login.body.token);
      const before = await request(base, '/admin/system-settings/freeUserBankFirst', { token });
      assert.equal(before.status, 200);
      previous = before.body;
      assert.equal(before.body.key, 'freeUserBankFirst');
      assert.equal(typeof before.body.enabled, 'boolean');

      const missing = await request(base, '/admin/system-settings/freeUserBankFirst', {
        method: 'PUT',
        token,
        body: {},
      });
      assert.equal(missing.status, 400);
      assert.equal(missing.body.code, ApiErrorCode.VALIDATION_ERROR);
      const text = await request(base, '/admin/system-settings/freeUserBankFirst', {
        method: 'PUT',
        token,
        body: { enabled: 'true' },
      });
      assert.equal(text.status, 400);
      assert.equal(text.body.code, ApiErrorCode.VALIDATION_ERROR);
      const extra = await request(base, '/admin/system-settings/freeUserBankFirst', {
        method: 'PUT',
        token,
        body: { enabled: true, other: true },
      });
      assert.equal(extra.status, 400);
      assert.equal(extra.body.code, ApiErrorCode.VALIDATION_ERROR);

      await redis.set(FREE_USER_BANK_FIRST_CACHE_KEY, '0', 'EX', 60);
      const turnedOn = await request(base, '/admin/system-settings/freeUserBankFirst', {
        method: 'PUT',
        token,
        body: { enabled: true },
      });
      assert.equal(turnedOn.status, 200);
      assert.equal(turnedOn.body.enabled, true);
      assert.equal(turnedOn.body.updatedBy, 'ops');
      assert.equal(typeof turnedOn.body.updatedAt, 'string');
      assert.equal(await redis.get(FREE_USER_BANK_FIRST_CACHE_KEY), null);

      const cache = {
        get: (key: string) => redis.get(key),
        set: (key: string, value: string, mode: 'EX', ttl: number) => redis.set(key, value, mode, ttl),
        del: (key: string) => redis.del(key),
      };
      const db = { query: (sql: string, params?: unknown[]) => pool.query(sql, params) };
      assert.equal(await readFreeUserBankFirst(db, cache), true);
      assert.equal(await redis.get(FREE_USER_BANK_FIRST_CACHE_KEY), '1');
      await redis.set(FREE_USER_BANK_FIRST_CACHE_KEY, '0', 'EX', 60);
      assert.equal(await readFreeUserBankFirst(db, cache), false);
      await redis.del(FREE_USER_BANK_FIRST_CACHE_KEY);
      assert.equal(await readFreeUserBankFirst(db, cache), true);
    } finally {
      if (app) {
        const address = app.getHttpServer().address() as { port: number } | string | null;
        if (address && typeof address !== 'string' && previous) {
          const base = `http://127.0.0.1:${address.port}/api`;
          const login = await request(base, '/admin/login', {
            method: 'POST',
            body: { username: 'ops', password: 'correct-horse' },
          }).catch(() => undefined);
          const token = login && typeof login.body.token === 'string' ? login.body.token : '';
          if (token) {
            await request(base, '/admin/system-settings/freeUserBankFirst', {
              method: 'PUT',
              token,
              body: { enabled: previous.enabled === true },
            }).catch(() => undefined);
          }
        }
        await app.close();
      }
      if (userIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]).catch(() => undefined);
      }
      await redis.del(FREE_USER_BANK_FIRST_CACHE_KEY).catch(() => undefined);
      redis.disconnect();
      await pool.end().catch(() => undefined);
      restore(saved);
    }
  });
});

function restore(saved: {
  adminUser: string | undefined;
  adminPassword: string | undefined;
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
  wechatMock: string | undefined;
}): void {
  assign('ADMIN_USERNAME', saved.adminUser);
  assign('ADMIN_PASSWORD', saved.adminPassword);
  assign('DATABASE_URL', saved.databaseUrl);
  assign('REDIS_URL', saved.redisUrl);
  assign('WECHAT_LOGIN_MOCK', saved.wechatMock);
}

function assign(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function request(
  base: string,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
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
