/** 后管系统设置。本切片只实现 freeUserBankFirst。 */
export const FREE_USER_BANK_FIRST_SETTING_KEY = 'freeUserBankFirst';

/** Worker / API 共用的短缓存键。PUT 必须删除它，不能只等 TTL。 */
export const FREE_USER_BANK_FIRST_CACHE_KEY = 'sysset:freeUserBankFirst';

export const FREE_USER_BANK_FIRST_CACHE_TTL_SECONDS = 60;

export interface FreeUserBankFirstSetting {
  key: typeof FREE_USER_BANK_FIRST_SETTING_KEY;
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SettingsDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** 缓存读写失败时，读路径降级直读数据库。写路径的删除失败要抛出。 */
export interface SettingsCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** PUT 已经写入数据库，但缓存键没有删掉。 */
export class SettingsCacheError extends Error {
  constructor() {
    super('系统设置缓存失效失败');
    this.name = 'SettingsCacheError';
  }
}

interface SettingRow {
  value: unknown;
  updated_at: Date | string | null;
  updated_by: string | null;
}

/**
 * 读免费用户题库优先。没有行、值不是布尔 true，都视为关。
 * 缓存命中优先。缓存读失败则直读数据库，不把出题打成 Redis 故障。
 */
export async function readFreeUserBankFirst(
  db: SettingsDb,
  cache: SettingsCache | null,
): Promise<boolean> {
  const cached = await readCache(cache);
  if (cached !== null) {
    return cached;
  }
  const record = await readFreeUserBankFirstRecord(db);
  if (cache) {
    await writeCache(cache, record.enabled).catch(() => undefined);
  }
  return record.enabled;
}

export async function readFreeUserBankFirstRecord(
  db: SettingsDb,
): Promise<FreeUserBankFirstSetting> {
  const result = await db.query(
    `
      SELECT value, updated_at, updated_by
      FROM system_settings
      WHERE key = $1
    `,
    [FREE_USER_BANK_FIRST_SETTING_KEY],
  );
  const row = result.rows[0] as SettingRow | undefined;
  if (!row) {
    return {
      key: FREE_USER_BANK_FIRST_SETTING_KEY,
      enabled: false,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    key: FREE_USER_BANK_FIRST_SETTING_KEY,
    enabled: readEnabled(row.value),
    updatedAt: toIso(row.updated_at),
    updatedBy: typeof row.updated_by === 'string' && row.updated_by.trim() ? row.updated_by : null,
  };
}

/**
 * 写入单键 freeUserBankFirst，并删除缓存。
 * cache 为空表示当前进程没有 Redis，调用方改走数据库。
 * 删除失败抛 SettingsCacheError。数据库写入已经完成，可以重试 PUT。
 */
export async function writeFreeUserBankFirst(
  db: SettingsDb,
  cache: SettingsCache | null,
  enabled: boolean,
  updatedBy: string,
): Promise<FreeUserBankFirstSetting> {
  const result = await db.query(
    `
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES ($1, jsonb_build_object('enabled', $2::boolean), now(), $3)
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      RETURNING value, updated_at, updated_by
    `,
    [FREE_USER_BANK_FIRST_SETTING_KEY, enabled, updatedBy],
  );
  const row = result.rows[0] as SettingRow | undefined;
  if (cache) {
    try {
      await cache.del(FREE_USER_BANK_FIRST_CACHE_KEY);
    } catch {
      throw new SettingsCacheError();
    }
  }
  return {
    key: FREE_USER_BANK_FIRST_SETTING_KEY,
    enabled: row ? readEnabled(row.value) : enabled,
    updatedAt: row ? toIso(row.updated_at) : new Date().toISOString(),
    updatedBy: row?.updated_by ?? updatedBy,
  };
}

async function readCache(cache: SettingsCache | null): Promise<boolean | null> {
  if (!cache) {
    return null;
  }
  try {
    const value = await cache.get(FREE_USER_BANK_FIRST_CACHE_KEY);
    if (value === '1') {
      return true;
    }
    if (value === '0') {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(cache: SettingsCache, enabled: boolean): Promise<void> {
  await cache.set(
    FREE_USER_BANK_FIRST_CACHE_KEY,
    enabled ? '1' : '0',
    'EX',
    FREE_USER_BANK_FIRST_CACHE_TTL_SECONDS,
  );
}

function readEnabled(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (value as { enabled?: unknown }).enabled === true;
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
