import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  readFreeUserBankFirstRecord,
  SettingsCacheError,
  writeFreeUserBankFirst,
  type FreeUserBankFirstSetting,
  type SettingsCache,
  type SettingsDb,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { logServerError } from '../common/api.exception';
import { rethrowDatabaseError } from '../common/database-error';
import { loadApiEnv } from '../config/env';
import { DatabaseService } from '../db/database.service';

@Injectable()
export class SystemSettingsService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private cacheReady = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.config);
    if (!env.redisUrl) {
      console.warn('[api] system settings cache skipped: REDIS_URL 未配置');
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
      this.cacheReady = false;
      logServerError('system-settings', error);
    });
    this.redis = redis;
    try {
      await redis.connect();
      this.cacheReady = (await redis.ping()) === 'PONG';
      if (!this.cacheReady) {
        console.warn('[api] system settings cache skipped: Redis 未响应 PONG');
      }
    } catch (error) {
      this.cacheReady = false;
      logServerError('system-settings', error);
      console.warn('[api] system settings cache skipped: Redis 不可用');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
    this.cacheReady = false;
  }

  async getFreeUserBankFirst(): Promise<FreeUserBankFirstSetting> {
    try {
      return await readFreeUserBankFirstRecord(this.db());
    } catch (error) {
      rethrowDatabaseError('system-settings', error);
    }
  }

  async putFreeUserBankFirst(
    enabled: boolean,
    updatedBy: string,
  ): Promise<FreeUserBankFirstSetting> {
    try {
      return await writeFreeUserBankFirst(this.db(), this.cache(), enabled, updatedBy);
    } catch (error) {
      if (error instanceof SettingsCacheError) {
        throw error;
      }
      rethrowDatabaseError('system-settings', error);
    }
  }

  private db(): SettingsDb {
    const pool = this.database.requirePool();
    return {
      query: (sql, params) => pool.query(sql, params),
    };
  }

  private cache(): SettingsCache | null {
    if (!this.redis || !this.cacheReady) {
      return null;
    }
    const redis = this.redis;
    return {
      get: (key) => redis.get(key),
      set: (key, value, mode, ttl) => redis.set(key, value, mode, ttl),
      del: (key) => redis.del(key),
    };
  }
}
