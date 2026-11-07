import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  COMMERCE_AUDIT_ACTIONS,
  COMMERCE_SKUS_CACHE_KEY,
  DAILY_FREE_SESSIONS_CACHE_KEY,
  DAILY_FREE_SESSIONS_KEY,
  DEFAULT_DAILY_FREE_SESSIONS,
  DEFAULT_REFINE_LIFETIME_LIMIT_FREE,
  GROWTH_CONFIG_CACHE_KEY,
  GROWTH_CONFIG_KEY,
  REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY,
  REFINE_LIFETIME_LIMIT_FREE_KEY,
  commerceQuotaFixed,
  defaultGrowthConfig,
  parseGrowthConfig,
  parseQuotaWrite,
  parseRefineLifetimeLimit,
  parseSkuCreate,
  parseSkuListQuery,
  parseSkuUpdate,
  parseDailyFreeQuota,
  type CommerceQuotaView,
  type CommerceSku,
  type GrowthConfigView,
} from '@tishuashua/shared';
import {
  SettingsCacheError,
  deleteCommerceCaches,
  readGrowthConfigRecord,
  readSetting,
  upsertSetting,
  type SettingsCache,
  type SettingsDb,
} from '@tishuashua/shared/commerce';
import Redis from 'ioredis';
import { logServerError } from '../common/api.exception';
import { loadApiEnv } from '../config/env';
import { DatabaseService } from '../db/database.service';
import { getSku, insertAudit, insertSku, listSkus, setSkuEnabled, updateSku } from './commerce.repository';

export class CommerceNotFoundError extends Error {
  constructor() {
    super('SKU 不存在');
    this.name = 'CommerceNotFoundError';
  }
}

export class CommerceConflictError extends Error {
  constructor() {
    super('SKU code 已存在');
    this.name = 'CommerceConflictError';
  }
}

export class CommerceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommerceValidationError';
  }
}

@Injectable()
export class CommerceService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private cacheReady = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.config);
    if (!env.redisUrl) {
      console.warn('[api] commerce settings cache skipped: REDIS_URL 未配置');
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
      logServerError('commerce', error);
    });
    this.redis = redis;
    try {
      await redis.connect();
      this.cacheReady = (await redis.ping()) === 'PONG';
      if (!this.cacheReady) {
        console.warn('[api] commerce settings cache skipped: Redis 未响应 PONG');
      }
    } catch (error) {
      this.cacheReady = false;
      logServerError('commerce', error);
      console.warn('[api] commerce settings cache skipped: Redis 不可用');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
    this.cacheReady = false;
  }

  async getQuota(): Promise<CommerceQuotaView> {
    return this.readQuota();
  }

  putQuota(body: unknown, actor: string): Promise<CommerceQuotaView> {
    return this.saveQuota(body, actor, COMMERCE_AUDIT_ACTIONS.quotaUpdate);
  }

  resetQuota(actor: string): Promise<CommerceQuotaView> {
    return this.saveQuota(
      {
        dailyFreeSessions: DEFAULT_DAILY_FREE_SESSIONS,
        refineLifetimeLimitFree: DEFAULT_REFINE_LIFETIME_LIMIT_FREE,
      },
      actor,
      COMMERCE_AUDIT_ACTIONS.quotaReset,
    );
  }

  async getGrowth(): Promise<GrowthConfigView> {
    const pool = this.database.requirePool();
    const record = await readGrowthConfigRecord(dbOf(pool));
    return { ...record.config, updatedAt: record.updatedAt, updatedBy: record.updatedBy };
  }

  putGrowth(body: unknown, actor: string): Promise<GrowthConfigView> {
    return this.saveGrowth(body, actor, COMMERCE_AUDIT_ACTIONS.growthUpdate);
  }

  resetGrowth(actor: string): Promise<GrowthConfigView> {
    return this.saveGrowth(defaultGrowthConfig(), actor, COMMERCE_AUDIT_ACTIONS.growthReset);
  }

  async listSkuQuery(typeRaw: unknown, statusRaw: unknown): Promise<{ items: CommerceSku[] }> {
    const parsed = parseSkuListQuery(typeRaw, statusRaw);
    if (!parsed.ok) {
      throw new CommerceValidationError(parsed.message);
    }
    const items = await listSkus(dbOf(this.database.requirePool()), parsed.value);
    return { items };
  }

  async getSkuByCode(code: string): Promise<CommerceSku> {
    const sku = await getSku(dbOf(this.database.requirePool()), code);
    if (!sku) {
      throw new CommerceNotFoundError();
    }
    return sku;
  }

  async createSku(body: unknown, actor: string): Promise<CommerceSku> {
    const parsed = parseSkuCreate(body);
    if (!parsed.ok) {
      throw new CommerceValidationError(parsed.message);
    }
    try {
      const created = await this.transaction(async (db) => {
        const sku = await insertSku(db, parsed.value, actor);
        await insertAudit(db, {
          actor,
          action: COMMERCE_AUDIT_ACTIONS.skuCreate,
          target: `sku:${sku.code}`,
          before: null,
          after: sku,
        });
        return sku;
      });
      await this.dropCaches([COMMERCE_SKUS_CACHE_KEY]);
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CommerceConflictError();
      }
      throw error;
    }
  }

  async updateSkuByCode(code: string, body: unknown, actor: string): Promise<CommerceSku> {
    const current = await this.getSkuByCode(code);
    const parsed = parseSkuUpdate(body, current.type);
    if (!parsed.ok) {
      throw new CommerceValidationError(parsed.message);
    }
    const updated = await this.transaction(async (db) => {
      const sku = await updateSku(db, code, parsed.value, actor);
      if (!sku) {
        throw new CommerceNotFoundError();
      }
      await insertAudit(db, {
        actor,
        action: COMMERCE_AUDIT_ACTIONS.skuUpdate,
        target: `sku:${code}`,
        before: current,
        after: sku,
      });
      return sku;
    });
    await this.dropCaches([COMMERCE_SKUS_CACHE_KEY]);
    return updated;
  }

  async setEnabled(code: string, enabled: boolean, actor: string): Promise<CommerceSku> {
    const current = await this.getSkuByCode(code);
    const updated = await this.transaction(async (db) => {
      const sku = await setSkuEnabled(db, code, enabled, actor);
      if (!sku) {
        throw new CommerceNotFoundError();
      }
      await insertAudit(db, {
        actor,
        action: enabled ? COMMERCE_AUDIT_ACTIONS.skuEnable : COMMERCE_AUDIT_ACTIONS.skuDisable,
        target: `sku:${code}`,
        before: { enabled: current.enabled },
        after: { enabled: sku.enabled },
      });
      return sku;
    });
    await this.dropCaches([COMMERCE_SKUS_CACHE_KEY]);
    return updated;
  }

  private async saveQuota(
    body: unknown,
    actor: string,
    action: string,
  ): Promise<CommerceQuotaView> {
    const parsed = parseQuotaWrite(body);
    if (!parsed.ok) {
      throw new CommerceValidationError(parsed.message);
    }
    const before = await this.readQuota();
    await this.transaction(async (db) => {
      await upsertSetting(
        db,
        DAILY_FREE_SESSIONS_KEY,
        { sessions: parsed.value.dailyFreeSessions },
        actor,
      );
      await upsertSetting(
        db,
        REFINE_LIFETIME_LIMIT_FREE_KEY,
        { limit: parsed.value.refineLifetimeLimitFree },
        actor,
      );
      const after = await this.quotaFrom(db);
      await insertAudit(db, {
        actor,
        action,
        target: 'quota',
        before: quotaAudit(before),
        after: quotaAudit(after),
      });
    });
    await this.dropCaches([DAILY_FREE_SESSIONS_CACHE_KEY, REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY]);
    return this.readQuota();
  }

  private async saveGrowth(
    body: unknown,
    actor: string,
    action: string,
  ): Promise<GrowthConfigView> {
    const parsed = parseGrowthConfig(body);
    if (!parsed.ok) {
      throw new CommerceValidationError(parsed.message);
    }
    const before = await this.getGrowth();
    await this.transaction(async (db) => {
      await upsertSetting(db, GROWTH_CONFIG_KEY, parsed.value, actor);
      await insertAudit(db, {
        actor,
        action,
        target: GROWTH_CONFIG_KEY,
        before: stripMeta(before),
        after: parsed.value,
      });
    });
    await this.dropCaches([GROWTH_CONFIG_CACHE_KEY]);
    return this.getGrowth();
  }

  private async readQuota(): Promise<CommerceQuotaView> {
    return this.quotaFrom(dbOf(this.database.requirePool()));
  }

  private async quotaFrom(db: SettingsDb): Promise<CommerceQuotaView> {
    const daily = await readSetting(db, DAILY_FREE_SESSIONS_KEY);
    const refine = await readSetting(db, REFINE_LIFETIME_LIMIT_FREE_KEY);
    const stamp = laterStamp(daily, refine);
    return {
      ...commerceQuotaFixed(),
      dailyFreeSessions: parseDailyFreeQuota(daily?.value) ?? DEFAULT_DAILY_FREE_SESSIONS,
      refineLifetimeLimitFree:
        parseRefineLifetimeLimit(refine?.value) ?? DEFAULT_REFINE_LIFETIME_LIMIT_FREE,
      updatedAt: stamp.updatedAt,
      updatedBy: stamp.updatedBy,
    };
  }

  private async dropCaches(keys: string[]): Promise<void> {
    try {
      await deleteCommerceCaches(this.cache(), keys);
    } catch (error) {
      if (error instanceof SettingsCacheError) {
        throw error;
      }
      throw error;
    }
  }

  private async transaction<T>(fn: (db: SettingsDb) => Promise<T>): Promise<T> {
    const client = await this.database.requirePool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(dbOf(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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

function dbOf(source: { query: SettingsDb['query'] }): SettingsDb {
  return { query: (sql, params) => source.query(sql, params) };
}

function laterStamp(
  left: { updatedAt: string | null; updatedBy: string | null } | null,
  right: { updatedAt: string | null; updatedBy: string | null } | null,
): { updatedAt: string | null; updatedBy: string | null } {
  const a = left?.updatedAt ?? null;
  const b = right?.updatedAt ?? null;
  if (a && (!b || a >= b)) {
    return { updatedAt: a, updatedBy: left?.updatedBy ?? null };
  }
  return { updatedAt: b, updatedBy: right?.updatedBy ?? null };
}

function quotaAudit(view: CommerceQuotaView): {
  dailyFreeSessions: number;
  refineLifetimeLimitFree: number;
} {
  return {
    dailyFreeSessions: view.dailyFreeSessions,
    refineLifetimeLimitFree: view.refineLifetimeLimitFree,
  };
}

function stripMeta(view: GrowthConfigView) {
  return {
    checkin: view.checkin,
    share: view.share,
    invite: view.invite,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
