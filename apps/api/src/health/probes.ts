import Redis from 'ioredis';
import { Pool } from 'pg';

export interface ProbeResult {
  ok: boolean;
  detail: string;
}

export async function probePostgres(databaseUrl: string): Promise<ProbeResult> {
  if (!databaseUrl) {
    return { ok: false, detail: 'DATABASE_URL 未配置' };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 1,
  });

  try {
    await pool.query('SELECT 1');
    return { ok: true, detail: 'SELECT 1' };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'postgres 不可用',
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function probeRedis(redisUrl: string): Promise<ProbeResult> {
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
