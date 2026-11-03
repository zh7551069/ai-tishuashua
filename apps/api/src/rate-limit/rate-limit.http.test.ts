import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode } from '@tishuashua/shared';
import Redis from 'ioredis';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { loadApiEnv } from '../config/env';
import {
  RATE_LIMIT_MESSAGE,
  accountSubject,
  rateLimitKey,
  type RateLimitSettings,
} from './rate-limit.policy';

const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

async function boot(): Promise<{ app: INestApplication; base: string }> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureHttp(app);
  const server = app.getHttpAdapter().getInstance() as { set(name: string, value: number): void };
  server.set('trust proxy', 1);
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
  options: { method: 'GET' | 'POST'; ip: string; body?: unknown },
): Promise<{ status: number; body: Record<string, unknown>; retryAfter: string | null }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method,
    headers: {
      'x-forwarded-for': options.ip,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { status: response.status, body, retryAfter: response.headers.get('retry-after') };
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

describe('rate limit http', { concurrency: 1 }, () => {
  test('超限返回 RATE_LIMITED，健康检查和另一条路径不受这把钥匙影响', async (t) => {
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await redisAvailable(redisUrl))) {
      t.skip('Redis 不可用，跳过限流集成测试');
      return;
    }

    const savedRedis = process.env.REDIS_URL;
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
      const settings = loadApiEnv(app.get(ConfigService)).rateLimit;
      if (!settings.enabled) {
        t.skip('RATE_LIMIT_ENABLED 已关闭，跳过限流集成测试');
        return;
      }

      const wechatIp = '203.0.113.21';
      const otherIp = '203.0.113.22';
      const publicIp = '203.0.113.23';
      const adminIp = '203.0.113.24';
      const wechatKey = seedKey(settings, 'wechat-login', `ip:${wechatIp}`);
      const publicKey = seedKey(settings, 'public', `ip:${publicIp}`);
      const account = accountSubject('SprayUser');
      if (!account) {
        throw new Error('帐号键为空');
      }
      const accountKey = seedKey(settings, 'admin-login', account);
      const otherAccount = accountSubject('OtherUser');
      if (!otherAccount) {
        throw new Error('帐号键为空');
      }
      keys.push(
        wechatKey,
        publicKey,
        accountKey,
        seedKey(settings, 'wechat-login', `ip:${otherIp}`),
        seedKey(settings, 'admin-login', `ip:${wechatIp}`),
        seedKey(settings, 'admin-login', `ip:${adminIp}`),
        seedKey(settings, 'admin-login', otherAccount),
      );

      await redis.set(wechatKey, String(settings.wechatLoginMax), 'EX', settings.windowSeconds);
      await redis.set(publicKey, String(settings.publicMax), 'EX', settings.windowSeconds);
      await redis.set(accountKey, String(settings.adminLoginMax), 'EX', settings.windowSeconds);

      const limited = await request(booted.base, '/auth/wechat/login', {
        method: 'POST',
        ip: wechatIp,
        body: {},
      });
      assert.equal(limited.status, 429, JSON.stringify(limited.body));
      assert.deepEqual(limited.body, {
        code: ApiErrorCode.RATE_LIMITED,
        message: RATE_LIMIT_MESSAGE,
      });
      assert.ok(Number(limited.retryAfter) >= 1);

      const other = await request(booted.base, '/auth/wechat/login', {
        method: 'POST',
        ip: otherIp,
        body: {},
      });
      assert.equal(other.status, 400, JSON.stringify(other.body));
      assert.equal(other.body.code, ApiErrorCode.VALIDATION_ERROR);

      const adminUntouched = await request(booted.base, '/admin/login', {
        method: 'POST',
        ip: wechatIp,
        body: {},
      });
      assert.equal(adminUntouched.status, 400, JSON.stringify(adminUntouched.body));
      assert.equal(adminUntouched.body.code, ApiErrorCode.VALIDATION_ERROR);

      const health = await request(booted.base, '/health', { method: 'GET', ip: wechatIp });
      assert.equal(health.status, 200);
      assert.equal(health.body.status, 'ok');

      const certificates = await request(booted.base, '/certificates/scores', {
        method: 'GET',
        ip: publicIp,
      });
      assert.equal(certificates.status, 429, JSON.stringify(certificates.body));
      assert.equal(certificates.body.code, ApiErrorCode.RATE_LIMITED);

      const healthWhilePublicLimited = await request(booted.base, '/health', {
        method: 'GET',
        ip: publicIp,
      });
      assert.equal(healthWhilePublicLimited.status, 200);

      const sprayed = await request(booted.base, '/admin/login', {
        method: 'POST',
        ip: adminIp,
        body: { username: ' SprayUser ', password: 'not-the-password' },
      });
      assert.equal(sprayed.status, 429, JSON.stringify(sprayed.body));
      assert.equal(sprayed.body.code, ApiErrorCode.RATE_LIMITED);
      assert.equal(JSON.stringify(sprayed.body).includes('not-the-password'), false);

      const freshAccount = await request(booted.base, '/admin/login', {
        method: 'POST',
        ip: adminIp,
        body: { username: 'OtherUser', password: 'not-the-password' },
      });
      assert.notEqual(freshAccount.status, 429);
      assert.notEqual(freshAccount.body.code, ApiErrorCode.RATE_LIMITED);
      assert.equal(JSON.stringify(freshAccount.body).includes('not-the-password'), false);
    } finally {
      if (keys.length > 0) {
        await redis.del(...keys).catch(() => undefined);
      }
      redis.disconnect();
      await app?.close();
      if (savedRedis === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = savedRedis;
      }
    }
  });
});

function seedKey(settings: RateLimitSettings, scope: string, subject: string): string {
  return rateLimitKey(settings.keyPrefix, { scope, subject });
}
