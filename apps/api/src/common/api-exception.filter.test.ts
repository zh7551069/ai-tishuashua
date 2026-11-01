import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import { ApiException } from './api.exception';
import { ApiExceptionFilter } from './api-exception.filter';

function capture(exception: unknown): { status?: number; body?: ApiErrorBody } {
  const result: { status?: number; body?: ApiErrorBody } = {};
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status(code: number) {
          result.status = code;
          return this;
        },
        json(body: ApiErrorBody) {
          result.body = body;
        },
      }),
    }),
  } as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return result;
}

describe('ApiExceptionFilter', () => {
  test('业务异常保留自己的错误码', () => {
    const result = capture(
      new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.WECHAT_NOT_CONFIGURED,
        '微信登录未配置',
      ),
    );
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, {
      code: ApiErrorCode.WECHAT_NOT_CONFIGURED,
      message: '微信登录未配置',
    });
  });

  test('校验异常拼出字段说明，未知异常不泄露内部信息', () => {
    const validation = capture(
      new HttpException(
        {
          message: ['code should not be empty', 'code must be a string'],
          error: 'Bad Request',
          statusCode: 400,
        },
        HttpStatus.BAD_REQUEST,
      ),
    );
    assert.equal(validation.status, 400);
    assert.equal(validation.body?.code, ApiErrorCode.VALIDATION_ERROR);
    assert.match(validation.body?.message ?? '', /code should not be empty/);

    const internal = capture(new Error('database driver failed: secret-detail'));
    assert.equal(internal.status, 500);
    assert.equal(internal.body?.code, ApiErrorCode.INTERNAL);
    assert.equal(internal.body?.message, 'Internal server error');
    assert.equal(JSON.stringify(internal.body).includes('secret-detail'), false);
  });
});
