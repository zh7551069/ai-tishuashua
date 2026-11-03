import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { parseAdminSession, sessionKey, adminSessionKey } from '../session/session.service';
import { SessionService } from '../session/session.service';
import { AdminSessionGuard, type AdminRequest } from './admin-session.guard';

function contextFor(authorization?: string): {
  context: ExecutionContext;
  request: Partial<AdminRequest>;
} {
  const request: Partial<AdminRequest> = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class AdminController {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

function reflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride() {
      return isPublic;
    },
  } as unknown as Reflector;
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

describe('parseAdminSession', () => {
  test('只接受后管载荷，微信用户载荷不算', () => {
    assert.deepEqual(
      parseAdminSession(
        '{"kind":"admin","username":"admin","issuedAt":"2026-11-03T00:00:00.000Z"}',
      ),
      { username: 'admin' },
    );
    assert.equal(
      parseAdminSession('{"userId":"user-1","issuedAt":"2026-11-03T00:00:00.000Z"}'),
      null,
    );
    assert.equal(parseAdminSession('{"kind":"user","username":"admin"}'), null);
    assert.equal(parseAdminSession('{"kind":"admin","username":""}'), null);
    assert.equal(parseAdminSession('not-json'), null);
    assert.notEqual(adminSessionKey('same-token'), sessionKey('same-token'));
  });
});

describe('AdminSessionGuard', () => {
  test('公开路由不读会话', async () => {
    let resolved = 0;
    const guard = new AdminSessionGuard(reflector(true), {
      async resolveAdmin() {
        resolved += 1;
        return null;
      },
    } as unknown as SessionService);
    assert.equal(await guard.canActivate(contextFor().context), true);
    assert.equal(resolved, 0);
  });

  test('缺少或无法解析的 token 都拒绝，包括解析结果为空的微信 token', async () => {
    const guard = new AdminSessionGuard(reflector(false), {
      async resolveAdmin() {
        return null;
      },
    } as unknown as SessionService);

    const missing = await expectApi(() => guard.canActivate(contextFor().context));
    assert.equal(missing.getStatus(), HttpStatus.UNAUTHORIZED);
    assert.equal((missing.getResponse() as ApiErrorBody).code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await expectApi(() =>
      guard.canActivate(contextFor('Bearer wechat-token').context),
    );
    assert.equal((wechat.getResponse() as ApiErrorBody).message, '登录已失效，请重新登录');
  });

  test('有效后管会话写入操作者', async () => {
    const guard = new AdminSessionGuard(reflector(false), {
      async resolveAdmin(token: string) {
        return token === 'good-token' ? { username: 'admin' } : null;
      },
    } as unknown as SessionService);

    const ok = contextFor('Bearer good-token');
    assert.equal(await guard.canActivate(ok.context), true);
    assert.equal(ok.request.admin?.username, 'admin');
    assert.equal(ok.request.adminToken, 'good-token');
  });
});
