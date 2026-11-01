import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@tishuashua/shared';
import { join } from 'node:path';
import { Pool } from 'pg';
import { ApiException, logServerError } from '../common/api.exception';
import { loadApiEnv } from '../config/env';
import { migrate } from './migrate';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  pool: Pool | null = null;
  ready = false;
  lastError = 'DATABASE_URL 未配置';

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.config);
    if (!env.databaseUrl) {
      this.lastError = 'DATABASE_URL 未配置';
      console.warn('[api] migrations skipped: DATABASE_URL 未配置');
      return;
    }

    this.pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 3000,
    });

    try {
      const applied = await migrate(this.pool, join(__dirname, '../../migrations'));
      this.ready = true;
      this.lastError = '';
      console.log(
        applied.length > 0
          ? `[api] migrations applied: ${applied.join(', ')}`
          : '[api] migrations up to date',
      );
    } catch (error) {
      this.ready = false;
      this.lastError = '数据库不可用';
      logServerError('migrate', error);
      console.warn('[api] migrations skipped: 数据库不可用');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
    this.pool = null;
    this.ready = false;
  }

  requirePool(): Pool {
    if (!this.pool || !this.ready) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.DATABASE_UNAVAILABLE,
        this.lastError || '数据库不可用',
      );
    }
    return this.pool;
  }
}
