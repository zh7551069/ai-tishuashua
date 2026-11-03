import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { CreatedSession } from '../session/session.service';
import { SessionService } from '../session/session.service';
import { AdminLoginService } from './admin-login.service';

const PASSWORD = 'correct-horse';

class MemoryAdminSessions {
  creates: string[] = [];

  async createAdmin(username: string): Promise<CreatedSession> {
    this.creates.push(username);
    return {
      token: `admin-token-${this.creates.length}`,
      expiresAt: '2026-11-10T00:00:00.000Z',
    };
  }
}

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
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

describe('AdminLoginService', () => {
  test('未配置时不签发会话', async () => {
    const sessions = new MemoryAdminSessions();
    const service = new AdminLoginService(
      configWith({ ADMIN_USERNAME: 'admin' }),
      sessions as unknown as SessionService,
    );
    const error = await expectApi(() => service.login({ username: 'admin', password: PASSWORD }));
    assert.equal(error.getStatus(), HttpStatus.SERVICE_UNAVAILABLE);
    assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.ADMIN_NOT_CONFIGURED);
    assert.equal(sessions.creates.length, 0);
    assert.equal(JSON.stringify(error.getResponse()).includes(PASSWORD), false);
  });

  test('错误帐密返回同一提示，且不签发会话', async () => {
    const sessions = new MemoryAdminSessions();
    const service = new AdminLoginService(
      configWith({ ADMIN_USERNAME: ' admin ', ADMIN_PASSWORD: PASSWORD }),
      sessions as unknown as SessionService,
    );

    const wrongPassword = await expectApi(() =>
      service.login({ username: 'admin', password: 'nope' }),
    );
    const wrongName = await expectApi(() =>
      service.login({ username: 'Admin', password: PASSWORD }),
    );
    for (const error of [wrongPassword, wrongName]) {
      assert.equal(error.getStatus(), HttpStatus.UNAUTHORIZED);
      assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.UNAUTHORIZED);
      assert.equal((error.getResponse() as ApiErrorBody).message, '用户名或密码不正确');
      assert.equal(JSON.stringify(error.getResponse()).includes(PASSWORD), false);
    }
    assert.equal(sessions.creates.length, 0);
  });

  test('正确帐密返回 token，响应里没有口令', async () => {
    const sessions = new MemoryAdminSessions();
    const service = new AdminLoginService(
      configWith({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: PASSWORD }),
      sessions as unknown as SessionService,
    );
    const result = await service.login({ username: ' admin ', password: PASSWORD });
    assert.deepEqual(sessions.creates, ['admin']);
    assert.equal(result.token, 'admin-token-1');
    assert.equal(result.admin.username, 'admin');
    assert.deepEqual(Object.keys(result).sort(), ['admin', 'expiresAt', 'token']);
    assert.equal(JSON.stringify(result).includes(PASSWORD), false);
  });

  test('Redis 不可用时把错误交出去，响应不含口令', async () => {
    const sessions = {
      async createAdmin() {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ApiErrorCode.REDIS_UNAVAILABLE,
          'Redis 不可用',
        );
      },
    };
    const service = new AdminLoginService(
      configWith({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: PASSWORD }),
      sessions as unknown as SessionService,
    );
    const error = await expectApi(() => service.login({ username: 'admin', password: PASSWORD }));
    assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.REDIS_UNAVAILABLE);
    assert.equal(JSON.stringify(error.getResponse()).includes(PASSWORD), false);
  });
});
