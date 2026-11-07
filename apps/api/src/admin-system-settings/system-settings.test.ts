import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  FREE_USER_BANK_FIRST_CACHE_KEY,
  FREE_USER_BANK_FIRST_CACHE_TTL_SECONDS,
  SettingsCacheError,
  readFreeUserBankFirst,
  readFreeUserBankFirstRecord,
  writeFreeUserBankFirst,
  type SettingsCache,
  type SettingsDb,
} from '@tishuashua/shared';

describe('freeUserBankFirst', () => {
  test('没有行或值不是 true 时视为关，缓存命中不再查库', async () => {
    let queries = 0;
    const empty: SettingsDb = {
      async query() {
        queries += 1;
        return { rows: [] };
      },
    };
    assert.equal((await readFreeUserBankFirstRecord(empty)).enabled, false);
    assert.equal((await readFreeUserBankFirstRecord(empty)).updatedAt, null);
    assert.equal(await readFreeUserBankFirst(empty, null), false);

    const weird: SettingsDb = {
      async query() {
        return { rows: [{ value: { enabled: 'true' }, updated_at: null, updated_by: null }] };
      },
    };
    assert.equal(await readFreeUserBankFirst(weird, null), false);

    queries = 0;
    const cache = memoryCache({ [FREE_USER_BANK_FIRST_CACHE_KEY]: '1' });
    assert.equal(await readFreeUserBankFirst(empty, cache), true);
    assert.equal(queries, 0);
    assert.equal(FREE_USER_BANK_FIRST_CACHE_TTL_SECONDS, 60);
  });

  test('缓存读失败直读数据库，写入后必须删除缓存键', async () => {
    const db = scriptedDb(false);
    const broken: SettingsCache = {
      async get() {
        throw new Error('redis down');
      },
      async set() {
        throw new Error('redis down');
      },
      async del() {
        throw new Error('redis down');
      },
    };
    assert.equal(await readFreeUserBankFirst(db, broken), false);

    const cache = memoryCache({ [FREE_USER_BANK_FIRST_CACHE_KEY]: '0' });
    db.value = true;
    assert.equal(await readFreeUserBankFirst(db, cache), false);

    const written = await writeFreeUserBankFirst(db, cache, true, 'ops');
    assert.equal(written.enabled, true);
    assert.equal(written.updatedBy, 'ops');
    assert.equal(cache.store[FREE_USER_BANK_FIRST_CACHE_KEY], undefined);
    assert.equal(await readFreeUserBankFirst(db, cache), true);
    assert.equal(cache.store[FREE_USER_BANK_FIRST_CACHE_KEY], '1');
    assert.equal(cache.ttl, 60);

    await assert.rejects(
      () => writeFreeUserBankFirst(db, broken, false, 'ops'),
      (error: unknown) => error instanceof SettingsCacheError,
    );
  });
});

function scriptedDb(initial: boolean): SettingsDb & { value: boolean } {
  const state = {
    value: initial,
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('INSERT INTO system_settings')) {
        state.value = params?.[1] === true;
        return {
          rows: [
            {
              value: { enabled: state.value },
              updated_at: new Date('2026-11-07T06:00:00.000Z'),
              updated_by: params?.[2],
            },
          ],
        };
      }
      return {
        rows: [
          {
            value: { enabled: state.value },
            updated_at: new Date('2026-11-07T06:00:00.000Z'),
            updated_by: 'admin',
          },
        ],
      };
    },
  };
  return state;
}

function memoryCache(initial: Record<string, string>): SettingsCache & {
  store: Record<string, string>;
  ttl: number;
} {
  const store = { ...initial };
  const cache = {
    store,
    ttl: 0,
    async get(key: string) {
      return store[key] ?? null;
    },
    async set(key: string, value: string, _mode: 'EX', ttlSeconds: number) {
      store[key] = value;
      cache.ttl = ttlSeconds;
      return 'OK';
    },
    async del(key: string) {
      delete store[key];
      return 1;
    },
  };
  return cache;
}
