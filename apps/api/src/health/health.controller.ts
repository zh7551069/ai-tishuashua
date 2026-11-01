import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthStatus } from '@tishuashua/shared';
import type { Response } from 'express';
import { loadApiEnv } from '../config/env';
import { probePostgres, probeRedis } from './probes';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  @Get()
  @ApiOperation({ summary: '存活检查，不访问数据库或 Redis' })
  live(): HealthStatus {
    return { status: 'ok', service: 'api' };
  }

  @Get('ready')
  @ApiOperation({ summary: '就绪检查：PostgreSQL SELECT 1 与 Redis PING' })
  async ready(@Res({ passthrough: true }) response: Response) {
    const env = loadApiEnv(this.config);
    const [postgres, redis] = await Promise.all([
      probePostgres(env.databaseUrl),
      probeRedis(env.redisUrl),
    ]);
    const ok = postgres.ok && redis.ok;
    response.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'api',
      checks: { postgres, redis },
    };
  }
}
