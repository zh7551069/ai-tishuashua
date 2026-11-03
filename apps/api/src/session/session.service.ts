import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@tishuashua/shared';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { ApiException, logServerError } from '../common/api.exception';
import { loadApiEnv } from '../config/env';

/** 7 天。带 token 的请求会把 TTL 重新设为该值。微信会话和后管会话共用这个时长。 */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_KEY_PREFIX = 'tishuashua:session:';
/** 与微信会话分开，避免用户 token 命中后管键。 */
export const ADMIN_SESSION_KEY_PREFIX = 'tishuashua:admin-session:';
export const ADMIN_SESSION_KIND = 'admin';

export interface CreatedSession {
  token: string;
  expiresAt: string;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private ready = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.config);
    if (!env.redisUrl) {
      console.warn('[api] session store skipped: REDIS_URL 未配置');
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
      this.ready = false;
      logServerError('redis', error);
    });
    this.redis = redis;

    try {
      await redis.connect();
      const pong = await redis.ping();
      this.ready = pong === 'PONG';
      if (!this.ready) {
        console.warn('[api] session store skipped: Redis 未响应 PONG');
      }
    } catch (error) {
      this.ready = false;
      logServerError('redis', error);
      console.warn('[api] session store skipped: Redis 不可用');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
    this.ready = false;
  }

  async create(userId: string): Promise<CreatedSession> {
    const redis = this.requireClient();
    const token = randomBytes(32).toString('base64url');
    const payload = JSON.stringify({
      userId,
      issuedAt: new Date().toISOString(),
    });
    try {
      await redis.set(sessionKey(token), payload, 'EX', SESSION_TTL_SECONDS);
    } catch (error) {
      logServerError('redis', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        'Redis 不可用',
      );
    }
    return {
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** 命中后顺延 TTL。找不到返回 null。 */
  async resolve(token: string): Promise<{ userId: string } | null> {
    const redis = this.requireClient();
    const key = sessionKey(token);
    let raw: string | null;
    try {
      raw = await redis.get(key);
      if (!raw) {
        return null;
      }
      await redis.expire(key, SESSION_TTL_SECONDS);
    } catch (error) {
      logServerError('redis', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        'Redis 不可用',
      );
    }

    try {
      const parsed = JSON.parse(raw) as { userId?: unknown };
      if (typeof parsed.userId !== 'string' || parsed.userId.length === 0) {
        return null;
      }
      return { userId: parsed.userId };
    } catch {
      await redis.del(key).catch(() => undefined);
      return null;
    }
  }

  async createAdmin(username: string): Promise<CreatedSession> {
    const redis = this.requireClient();
    const token = randomBytes(32).toString('base64url');
    const payload = JSON.stringify({
      kind: ADMIN_SESSION_KIND,
      username,
      issuedAt: new Date().toISOString(),
    });
    try {
      await redis.set(adminSessionKey(token), payload, 'EX', SESSION_TTL_SECONDS);
    } catch (error) {
      logServerError('redis', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        'Redis 不可用',
      );
    }
    return {
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** 只认 kind=admin 的载荷。微信会话形状在这里是无效会话，并会删掉误写入的键。 */
  async resolveAdmin(token: string): Promise<{ username: string } | null> {
    const redis = this.requireClient();
    const key = adminSessionKey(token);
    let raw: string | null;
    try {
      raw = await redis.get(key);
      if (!raw) {
        return null;
      }
      await redis.expire(key, SESSION_TTL_SECONDS);
    } catch (error) {
      logServerError('redis', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        'Redis 不可用',
      );
    }

    const session = parseAdminSession(raw);
    if (!session) {
      await redis.del(key).catch(() => undefined);
      return null;
    }
    return session;
  }

  async revokeAdmin(token: string): Promise<void> {
    const redis = this.requireClient();
    try {
      await redis.del(adminSessionKey(token));
    } catch (error) {
      logServerError('redis', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        'Redis 不可用',
      );
    }
  }

  private requireClient(): Redis {
    if (!this.redis || !this.ready) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        this.redis ? 'Redis 不可用' : 'REDIS_URL 未配置',
      );
    }
    return this.redis;
  }
}

export function sessionKey(token: string): string {
  return `${SESSION_KEY_PREFIX}${token}`;
}

export function adminSessionKey(token: string): string {
  return `${ADMIN_SESSION_KEY_PREFIX}${token}`;
}

/** 微信用户载荷、缺用户名或坏 JSON 都不是后管会话。 */
export function parseAdminSession(raw: string): { username: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const body = parsed as { kind?: unknown; username?: unknown };
  if (body.kind !== ADMIN_SESSION_KIND) {
    return null;
  }
  if (typeof body.username !== 'string' || body.username.length === 0) {
    return null;
  }
  return { username: body.username };
}
