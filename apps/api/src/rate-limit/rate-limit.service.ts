import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { logServerError } from '../common/api.exception';
import { loadApiEnv } from '../config/env';
import {
  rateLimitExceeded,
  rateLimitKey,
  type RateBucket,
  type RateHit,
} from './rate-limit.policy';

/**
 * 固定窗口。INCR 和补 TTL 放在同一段 Lua 里，避免计数成功但键永远不过期。
 * 返回值是这次加完之后的次数，以及剩余秒数。
 */
const INCREMENT_WINDOW = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

export type ConsumeResult =
  { action: 'allow' } | { action: 'skip' } | { action: 'limited'; retryAfterSeconds: number };

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private ready = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.config);
    if (!env.rateLimit.enabled) {
      console.warn('[api] rate limit disabled');
      return;
    }
    if (!env.redisUrl) {
      console.warn('[api] rate limit skipped: REDIS_URL 未配置');
      return;
    }

    const redis = new Redis(env.redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on('error', (error: Error) => {
      this.ready = false;
      logServerError('rate-limit', error);
    });
    this.redis = redis;

    try {
      await redis.connect();
      const pong = await redis.ping();
      this.ready = pong === 'PONG';
      if (!this.ready) {
        console.warn('[api] rate limit skipped: Redis 未响应 PONG');
        return;
      }
      console.log(
        `[api] rate limit ready window=${env.rateLimit.windowSeconds}s wechatLogin=${env.rateLimit.wechatLoginMax} adminLogin=${env.rateLimit.adminLoginMax}`,
      );
    } catch (error) {
      this.ready = false;
      logServerError('rate-limit', error);
      console.warn('[api] rate limit skipped: Redis 不可用');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
    this.ready = false;
  }

  /**
   * Redis 未配置、连接失败或单次命令失败时返回 skip，不抛错。
   * 调用方继续走原来的接口逻辑，因此参数错误和口令错误不会被改成 REDIS_UNAVAILABLE。
   */
  async consume(
    buckets: RateBucket[],
    windowSeconds: number,
    keyPrefix: string,
  ): Promise<ConsumeResult> {
    if (!this.ready || !this.redis || buckets.length === 0) {
      return { action: 'skip' };
    }

    const hits: RateHit[] = [];
    try {
      for (const bucket of buckets) {
        const raw = await this.redis.eval(
          INCREMENT_WINDOW,
          1,
          rateLimitKey(keyPrefix, bucket),
          String(windowSeconds),
        );
        const parsed = parseEval(raw);
        if (!parsed) {
          logServerError('rate-limit', new Error('计数结果无法解析'));
          return { action: 'skip' };
        }
        hits.push({ ...parsed, limit: bucket.limit });
      }
    } catch (error) {
      logServerError('rate-limit', error);
      return { action: 'skip' };
    }

    const limited = rateLimitExceeded(hits);
    if (!limited) {
      return { action: 'allow' };
    }
    return { action: 'limited', retryAfterSeconds: limited.retryAfterSeconds };
  }
}

function parseEval(raw: unknown): { current: number; ttlSeconds: number } | null {
  if (!Array.isArray(raw) || raw.length < 2) {
    return null;
  }
  const current = Number(raw[0]);
  const ttlSeconds = Number(raw[1]);
  if (!Number.isFinite(current) || !Number.isFinite(ttlSeconds)) {
    return null;
  }
  return { current, ttlSeconds };
}
