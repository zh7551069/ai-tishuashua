import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimitService } from './rate-limit.service';
import { rateLimitKey } from './rate-limit.policy';

const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
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

describe('RateLimitService', () => {
  test('关闭或没有 Redis 时不拦截，也不抛错', async () => {
    const disabled = new RateLimitService(
      configWith({ RATE_LIMIT_ENABLED: 'false', REDIS_URL: 'redis://127.0.0.1:6399' }),
    );
    await disabled.onModuleInit();
    const skipped = await disabled.consume(
      [{ scope: 'public', subject: 'ip:203.0.113.1', limit: 1 }],
      60,
      'tishuashua:ratelimit:',
    );
    assert.deepEqual(skipped, { action: 'skip' });
    await disabled.onModuleDestroy();

    const missing = new RateLimitService(configWith({ REDIS_URL: '' }));
    await missing.onModuleInit();
    const open = await missing.consume(
      [{ scope: 'wechat-login', subject: 'ip:203.0.113.2', limit: 1 }],
      60,
      'tishuashua:ratelimit:',
    );
    assert.deepEqual(open, { action: 'skip' });
    await missing.onModuleDestroy();
  });

  test('连不上 Redis 时跳过，不把调用方变成 500', async () => {
    const service = new RateLimitService(configWith({ REDIS_URL: 'redis://127.0.0.1:6399' }));
    await service.onModuleInit();
    const result = await service.consume(
      [{ scope: 'public', subject: 'ip:203.0.113.3', limit: 1 }],
      60,
      'tishuashua:ratelimit:',
    );
    assert.deepEqual(result, { action: 'skip' });
    await service.onModuleDestroy();
  });

  test('窗口内放行到阈值，下一跳拒绝', async (t) => {
    if (!(await redisAvailable(LOCAL_REDIS_URL))) {
      t.skip('Redis 不可用，跳过限流计数测试');
      return;
    }

    const service = new RateLimitService(configWith({ REDIS_URL: LOCAL_REDIS_URL }));
    await service.onModuleInit();
    const prefix = `tishuashua:ratelimit:unit-${randomUUID()}:`;
    const bucket = { scope: 'wechat-login', subject: 'ip:203.0.113.50', limit: 2 };
    const redis = new Redis(LOCAL_REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      const first = await service.consume([bucket], 60, prefix);
      const second = await service.consume([bucket], 60, prefix);
      const third = await service.consume([bucket], 60, prefix);
      assert.deepEqual(first, { action: 'allow' });
      assert.deepEqual(second, { action: 'allow' });
      assert.equal(third.action, 'limited');
      if (third.action === 'limited') {
        assert.ok(third.retryAfterSeconds >= 1);
        assert.ok(third.retryAfterSeconds <= 60);
      }
      const stored = await redis.get(rateLimitKey(prefix, bucket));
      assert.equal(stored, '3');
    } finally {
      await redis.del(rateLimitKey(prefix, bucket)).catch(() => undefined);
      redis.disconnect();
      await service.onModuleDestroy();
    }
  });
});
