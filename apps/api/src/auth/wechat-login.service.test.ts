import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody, type UserSummary } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { CreatedSession } from '../session/session.service';
import { SessionService } from '../session/session.service';
import type { UpsertUserInput } from '../user/user.repository';
import { UserRepository } from '../user/user.repository';
import { WechatCodeExchange, type WechatIdentity } from './wechat-code.exchange';
import { WechatLoginService } from './wechat-login.service';

class MemoryUsers {
  readonly rows = new Map<string, UserSummary>();

  async upsertByOpenId(input: UpsertUserInput): Promise<UserSummary> {
    const existing = [...this.rows.values()].find((user) => user.wxOpenId === input.wxOpenId);
    if (existing) {
      const next: UserSummary = {
        ...existing,
        unionId: input.unionId ?? existing.unionId,
        nick: input.nick ?? existing.nick,
        avatar: input.avatar ?? existing.avatar,
      };
      this.rows.set(existing.id, next);
      return next;
    }
    const created: UserSummary = {
      id: randomUUID(),
      wxOpenId: input.wxOpenId,
      unionId: input.unionId,
      nick: input.nick,
      phoneMasked: null,
      avatar: input.avatar,
      status: 'active',
    };
    this.rows.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<UserSummary | null> {
    return this.rows.get(id) ?? null;
  }
}

class MemorySessions {
  creates = 0;
  readonly tokens = new Map<string, string>();

  async create(userId: string): Promise<CreatedSession> {
    this.creates += 1;
    const token = `token-${this.creates}-${userId}`;
    this.tokens.set(token, userId);
    return {
      token,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  async resolve(token: string): Promise<{ userId: string } | null> {
    const userId = this.tokens.get(token);
    return userId ? { userId } : null;
  }
}

class FixedExchange extends WechatCodeExchange {
  constructor(readonly identity: WechatIdentity) {
    super({ appId: '', appSecret: '', mock: true });
  }

  override exchange(): Promise<WechatIdentity> {
    return Promise.resolve(this.identity);
  }
}

async function expectApi(run: () => Promise<unknown>): Promise<ApiException> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiException) {
      return error;
    }
    throw error;
  }
  assert.fail('expected ApiException');
}

function serviceWith(users: MemoryUsers, sessions: MemorySessions, exchange: WechatCodeExchange) {
  return new WechatLoginService(
    exchange,
    users as unknown as UserRepository,
    sessions as unknown as SessionService,
  );
}

describe('WechatLoginService', () => {
  test('mock code 注册用户并签发会话，重复登录命中同一用户', async () => {
    const users = new MemoryUsers();
    const sessions = new MemorySessions();
    const service = serviceWith(
      users,
      sessions,
      new WechatCodeExchange({ appId: '', appSecret: '', mock: true }),
    );

    const first = await service.login({
      code: 'dev-user-1',
      nick: '备考同学',
      avatar: 'https://example.com/a.png',
    });
    const second = await service.login({ code: 'dev-user-1' });

    assert.equal(first.user.id, second.user.id);
    assert.equal(second.user.nick, '备考同学');
    assert.equal(second.user.avatar, 'https://example.com/a.png');
    assert.equal(second.user.phoneMasked, null);
    assert.equal(second.user.status, 'active');
    assert.equal(second.user.unionId, null);
    assert.notEqual(first.token, second.token);
    assert.equal(sessions.creates, 2);
    assert.equal(JSON.stringify(first).includes('session_key'), false);
    assert.match(first.token, /^token-/);
  });

  test('后一次资料覆盖空值时保留已有昵称，新昵称会更新', async () => {
    const users = new MemoryUsers();
    const sessions = new MemorySessions();
    const exchange = new FixedExchange({ openId: 'oid-1', unionId: 'union-1' });
    const service = serviceWith(users, sessions, exchange);

    const created = await service.login({ code: 'ignored', nick: '原来的名字' });
    exchange.identity.unionId = null;
    const kept = await service.login({ code: 'ignored' });
    assert.equal(kept.user.id, created.user.id);
    assert.equal(kept.user.nick, '原来的名字');
    assert.equal(kept.user.unionId, 'union-1');

    const renamed = await service.login({ code: 'ignored', nick: '新名字' });
    assert.equal(renamed.user.nick, '新名字');
    assert.equal(renamed.user.unionId, 'union-1');
  });

  test('封禁用户不签发新会话', async () => {
    const users = new MemoryUsers();
    const sessions = new MemorySessions();
    const service = serviceWith(
      users,
      sessions,
      new WechatCodeExchange({ appId: '', appSecret: '', mock: true }),
    );

    const created = await service.login({ code: 'banned-user' });
    const row = users.rows.get(created.user.id);
    assert.ok(row);
    row.status = 'banned';

    const error = await expectApi(() => service.login({ code: 'banned-user' }));
    assert.equal(error.getStatus(), HttpStatus.FORBIDDEN);
    assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.FORBIDDEN);
    assert.equal(sessions.creates, 1);
  });

  test('数据库或 Redis 失败时原样抛出对应错误码', async () => {
    const users = new MemoryUsers();
    const sessions = new MemorySessions();
    users.upsertByOpenId = async () => {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.DATABASE_UNAVAILABLE,
        '数据库不可用',
      );
    };
    const service = serviceWith(
      users,
      sessions,
      new WechatCodeExchange({ appId: '', appSecret: '', mock: true }),
    );

    const dbError = await expectApi(() => service.login({ code: 'dev-user-1' }));
    assert.equal((dbError.getResponse() as ApiErrorBody).code, ApiErrorCode.DATABASE_UNAVAILABLE);
    assert.equal(sessions.creates, 0);

    users.upsertByOpenId = MemoryUsers.prototype.upsertByOpenId.bind(users);
    sessions.create = async () => {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        'Redis 不可用',
      );
    };
    const redisError = await expectApi(() => service.login({ code: 'dev-user-1' }));
    assert.equal((redisError.getResponse() as ApiErrorBody).code, ApiErrorCode.REDIS_UNAVAILABLE);
  });
});
