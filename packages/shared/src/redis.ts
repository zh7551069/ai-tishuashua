export interface RedisEndpoint {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

/** 解析 redis:// 或 rediss:// 。不建立连接。 */
export function parseRedisUrl(redisUrl: string): RedisEndpoint {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error('REDIS_URL 不是合法 URL');
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL 协议必须是 redis 或 rediss');
  }

  const dbText = url.pathname.replace(/^\//, '');
  const db = dbText ? Number(dbText) : undefined;
  if (dbText && !Number.isInteger(db)) {
    throw new Error('REDIS_URL 数据库编号不合法');
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
  };
}
