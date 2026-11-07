/**
 * 商业化配置的数据库读写。含 SQL。
 * 只从 `@tishuashua/shared/commerce` 引入，不要再从 barrel（index.ts）导出。
 */
import {
  COMMERCE_SETTING_CACHE_TTL_SECONDS,
  DAILY_FREE_SESSIONS_CACHE_KEY,
  DAILY_FREE_SESSIONS_KEY,
  defaultGrowthConfig,
  GROWTH_CONFIG_CACHE_KEY,
  GROWTH_CONFIG_KEY,
  parseGrowthConfig,
  parseRefineLifetimeLimit,
  REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY,
  REFINE_LIFETIME_LIMIT_FREE_KEY,
  DEFAULT_REFINE_LIFETIME_LIMIT_FREE,
  type GrowthConfig,
} from './commerce-config';
import { DEFAULT_DAILY_FREE_SESSIONS, parseDailyFreeQuota } from './entitlement-types';
import { SettingsCacheError, type SettingsCache, type SettingsDb } from './system-settings';

export { SettingsCacheError };
export type { SettingsCache, SettingsDb };

interface SettingRow {
  value: unknown;
  updated_at: Date | string | null;
  updated_by: string | null;
}

export interface SettingSnapshot {
  value: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * 读日免场次。cache 为空时直读数据库。
 * ensureDay 传 null：下一次 daily_grant 必须看见刚写入的 sessions，不能吃未删掉的短缓存。
 */
export async function readDailyFreeSessions(
  db: SettingsDb,
  cache: SettingsCache | null,
): Promise<number> {
  const cached = await readCachedQuota(cache);
  if (cached !== null) {
    return cached;
  }
  const row = await readSetting(db, DAILY_FREE_SESSIONS_KEY);
  const sessions = parseDailyFreeQuota(row?.value) ?? DEFAULT_DAILY_FREE_SESSIONS;
  if (cache) {
    await cache
      .set(
        DAILY_FREE_SESSIONS_CACHE_KEY,
        String(sessions),
        'EX',
        COMMERCE_SETTING_CACHE_TTL_SECONDS,
      )
      .catch(() => undefined);
  }
  return sessions;
}

/** 免费用户终身提炼次数。没有合法配置时返回 1。会员是否不限由调用方决定。 */
export async function readRefineLifetimeLimitFree(
  db: SettingsDb,
  cache: SettingsCache | null,
): Promise<number> {
  const cached = await readCachedLimit(cache);
  if (cached !== null) {
    return cached;
  }
  const row = await readSetting(db, REFINE_LIFETIME_LIMIT_FREE_KEY);
  const limit = parseRefineLifetimeLimit(row?.value) ?? DEFAULT_REFINE_LIFETIME_LIMIT_FREE;
  if (cache) {
    await cache
      .set(
        REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY,
        String(limit),
        'EX',
        COMMERCE_SETTING_CACHE_TTL_SECONDS,
      )
      .catch(() => undefined);
  }
  return limit;
}

/**
 * 读增长配置。缓存键与 TB-21 相同（sysset:growthConfig，60 秒）。
 * 缓存缺失或损坏时直读数据库。读失败不抛 Redis 错误。
 */
export async function readGrowthConfig(
  db: SettingsDb,
  cache: SettingsCache | null,
): Promise<GrowthConfig> {
  const cached = await readCachedGrowth(cache);
  if (cached) {
    return cached;
  }
  const record = await readGrowthConfigRecord(db);
  if (cache) {
    await cache
      .set(
        GROWTH_CONFIG_CACHE_KEY,
        JSON.stringify(record.config),
        'EX',
        COMMERCE_SETTING_CACHE_TTL_SECONDS,
      )
      .catch(() => undefined);
  }
  return record.config;
}

export async function readGrowthConfigRecord(
  db: SettingsDb,
): Promise<{ config: GrowthConfig; updatedAt: string | null; updatedBy: string | null }> {
  const row = await readSetting(db, GROWTH_CONFIG_KEY);
  const parsed = row ? parseGrowthConfig(row.value) : null;
  return {
    config: parsed && parsed.ok ? parsed.value : defaultGrowthConfig(),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

export async function readSetting(db: SettingsDb, key: string): Promise<SettingSnapshot | null> {
  const result = await db.query(
    `
      SELECT value, updated_at, updated_by
      FROM system_settings
      WHERE key = $1
    `,
    [key],
  );
  const row = result.rows[0] as SettingRow | undefined;
  if (!row) {
    return null;
  }
  return {
    value: row.value,
    updatedAt: toIso(row.updated_at),
    updatedBy: typeof row.updated_by === 'string' && row.updated_by.trim() ? row.updated_by : null,
  };
}

export async function upsertSetting(
  db: SettingsDb,
  key: string,
  value: unknown,
  updatedBy: string,
): Promise<SettingSnapshot> {
  const result = await db.query(
    `
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES ($1, $2::jsonb, now(), $3)
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      RETURNING value, updated_at, updated_by
    `,
    [key, JSON.stringify(value), updatedBy],
  );
  const row = result.rows[0] as SettingRow | undefined;
  return {
    value: row?.value ?? value,
    updatedAt: row ? toIso(row.updated_at) : new Date().toISOString(),
    updatedBy: row?.updated_by ?? updatedBy,
  };
}

/** 数据库已经提交。删除失败抛 SettingsCacheError，调用方返回 503。 */
export async function deleteCommerceCaches(
  cache: SettingsCache | null,
  keys: readonly string[],
): Promise<void> {
  if (!cache) {
    return;
  }
  try {
    for (const key of keys) {
      await cache.del(key);
    }
  } catch {
    throw new SettingsCacheError();
  }
}

async function readCachedQuota(cache: SettingsCache | null): Promise<number | null> {
  if (!cache) {
    return null;
  }
  try {
    const value = await cache.get(DAILY_FREE_SESSIONS_CACHE_KEY);
    if (value === null) {
      return null;
    }
    return parseDailyFreeQuota(value);
  } catch {
    return null;
  }
}

async function readCachedGrowth(cache: SettingsCache | null): Promise<GrowthConfig | null> {
  if (!cache) {
    return null;
  }
  try {
    const value = await cache.get(GROWTH_CONFIG_CACHE_KEY);
    if (!value) {
      return null;
    }
    const parsed = parseGrowthConfig(JSON.parse(value) as unknown);
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

async function readCachedLimit(cache: SettingsCache | null): Promise<number | null> {
  if (!cache) {
    return null;
  }
  try {
    const value = await cache.get(REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY);
    if (value === null || !/^[1-9]\d?$/.test(value)) {
      return null;
    }
    const parsed = Number(value);
    return parsed >= 1 && parsed <= 99 ? parsed : null;
  } catch {
    return null;
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}
