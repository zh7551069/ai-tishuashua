import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthStatus } from '@tishuashua/shared';
import type { Response } from 'express';
import Redis from 'ioredis';
import { loadWorkerEnv } from './config/env';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  live(): HealthStatus {
    return { status: 'ok', service: 'worker' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const env = loadWorkerEnv(this.config);
    const redis = await probeRedis(env.redisUrl);
    response.status(redis.ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: redis.ok ? 'ok' : 'degraded',
      service: 'worker',
      checks: { redis },
    };
  }
}

async function probeRedis(redisUrl: string): Promise<{ ok: boolean; detail: string }> {
  if (!redisUrl) {
    return { ok: false, detail: 'REDIS_URL 未配置' };
  }

  const redis = new Redis(redisUrl, {
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  let socketError = '';
  redis.on('error', (error: Error) => {
    socketError = error.message;
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    return { ok: pong === 'PONG', detail: pong };
  } catch (error) {
    return {
      ok: false,
      detail: socketError || (error instanceof Error ? error.message : 'redis 不可用'),
    };
  } finally {
    redis.disconnect();
  }
}
