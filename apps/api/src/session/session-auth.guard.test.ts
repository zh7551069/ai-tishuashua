import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody, type UserSummary } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { UserRepository } from '../user/user.repository';
import { SessionAuthGuard, type AuthenticatedRequest } from './session-auth.guard';
import { SessionService } from './session.service';

function user(status: UserSummary['status']): UserSummary {
  return {
    id: 'user-1',
    wxOpenId: 'oid-1',
    unionId: null,
    nick: '备考同学',
    phoneMasked: null,
    phoneBound: false,
    avatar: null,
    status,
  };
}

function contextFor(authorization?: string): {
  context: ExecutionContext;
  request: Partial<AuthenticatedRequest>;
} {
  const request: Partial<AuthenticatedRequest> = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
  return { context, request };
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

describe('SessionAuthGuard', () => {
  test('缺少或无效 token 时拒绝', async () => {
    const guard = new SessionAuthGuard(
      {
        async resolve() {
          return null;
        },
      } as unknown as SessionService,
      {
        async findById() {
          return user('active');
        },
      } as unknown as UserRepository,
    );

    const missing = contextFor();
    const missingError = await expectApi(() => guard.canActivate(missing.context));
    assert.equal(missingError.getStatus(), HttpStatus.UNAUTHORIZED);
    assert.equal((missingError.getResponse() as ApiErrorBody).code, ApiErrorCode.UNAUTHORIZED);

    const invalid = contextFor('Bearer missing-token');
    const invalidError = await expectApi(() => guard.canActivate(invalid.context));
    assert.equal((invalidError.getResponse() as ApiErrorBody).code, ApiErrorCode.UNAUTHORIZED);
  });

  test('有效 token 写入当前用户，封禁账号返回 403', async () => {
    const active = user('active');
    let current: UserSummary | null = active;
    const guard = new SessionAuthGuard(
      {
        async resolve(token: string) {
          return token === 'good-token' ? { userId: active.id } : null;
        },
      } as unknown as SessionService,
      {
        async findById() {
          return current;
        },
      } as unknown as UserRepository,
    );

    const ok = contextFor('Bearer good-token');
    assert.equal(await guard.canActivate(ok.context), true);
    assert.equal(ok.request.user?.id, active.id);

    current = user('banned');
    const banned = contextFor('Bearer good-token');
    const error = await expectApi(() => guard.canActivate(banned.context));
    assert.equal(error.getStatus(), HttpStatus.FORBIDDEN);
    assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.FORBIDDEN);
  });
});
