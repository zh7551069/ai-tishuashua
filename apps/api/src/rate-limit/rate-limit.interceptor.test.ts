import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@tishuashua/shared';
import { lastValueFrom, of } from 'rxjs';
import { ApiException } from '../common/api.exception';
import { RATE_LIMIT_MESSAGE, type RateBucket } from './rate-limit.policy';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { type ConsumeResult, type RateLimitService } from './rate-limit.service';

function config(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

function contextFor(
  request: Record<string, unknown>,
  headers: Record<string, string>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitInterceptor', () => {
  test('健康检查不计数', async () => {
    let calls = 0;
    const rates = {
      async consume() {
        calls += 1;
        return { action: 'allow' } satisfies ConsumeResult;
      },
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(rates, config());
    const observable = await interceptor.intercept(
      contextFor({ originalUrl: '/api/health', method: 'GET', ip: '127.0.0.1' }, {}),
      { handle: () => of({ status: 'ok' }) } satisfies CallHandler,
    );
    assert.deepEqual(await lastValueFrom(observable), { status: 'ok' });
    assert.equal(calls, 0);
  });

  test('已登录的出题创建按用户计数，超限带 Retry-After', async () => {
    const seen: RateBucket[][] = [];
    const rates = {
      async consume(buckets: RateBucket[]) {
        seen.push(buckets);
        return { action: 'limited', retryAfterSeconds: 7 } satisfies ConsumeResult;
      },
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(rates, config());
    const headers: Record<string, string> = {};
    const observable = await interceptor.intercept(
      contextFor(
        {
          originalUrl: '/api/quiz/sessions',
          method: 'POST',
          ip: '198.51.100.10',
          user: { id: 'user-7' },
        },
        headers,
      ),
      { handle: () => of({ ok: true }) },
    );

    await assert.rejects(lastValueFrom(observable), (error: unknown) => {
      assert.ok(error instanceof ApiException);
      assert.equal(error.getStatus(), 429);
      assert.deepEqual(error.getResponse(), {
        code: ApiErrorCode.RATE_LIMITED,
        message: RATE_LIMIT_MESSAGE,
      });
      return true;
    });
    assert.equal(headers['Retry-After'], '7');
    assert.deepEqual(
      seen[0]?.map((bucket) => `${bucket.scope}:${bucket.subject}`),
      ['wechat-api:ip:198.51.100.10', 'wechat-api:user:user-7', 'quiz-create:user:user-7'],
    );
  });

  test('后管会话按用户名计数，和微信用户不是同一档', async () => {
    const seen: RateBucket[][] = [];
    const rates = {
      async consume(buckets: RateBucket[]) {
        seen.push(buckets);
        return { action: 'allow' } satisfies ConsumeResult;
      },
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(rates, config());
    const observable = await interceptor.intercept(
      contextFor(
        {
          originalUrl: '/api/admin/ping',
          method: 'GET',
          ip: '198.51.100.11',
          admin: { username: 'ops' },
        },
        {},
      ),
      { handle: () => of({ ok: true }) },
    );
    assert.deepEqual(await lastValueFrom(observable), { ok: true });
    assert.deepEqual(
      seen[0]?.map((bucket) => `${bucket.scope}:${bucket.subject}`),
      ['admin-api:ip:198.51.100.11', 'admin-api:admin:ops'],
    );
  });

  test('未归类路径按来源 IP 走公开额度', async () => {
    const seen: RateBucket[][] = [];
    const rates = {
      async consume(buckets: RateBucket[]) {
        seen.push(buckets);
        return { action: 'limited', retryAfterSeconds: 3 } satisfies ConsumeResult;
      },
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(rates, config());
    const headers: Record<string, string> = {};
    const observable = await interceptor.intercept(
      contextFor({ originalUrl: '/api/not-a-module', method: 'GET', ip: '203.0.113.9' }, headers),
      { handle: () => of({ ok: true }) },
    );

    await assert.rejects(lastValueFrom(observable), (error: unknown) => {
      assert.ok(error instanceof ApiException);
      assert.equal(error.getStatus(), 429);
      assert.deepEqual(error.getResponse(), {
        code: ApiErrorCode.RATE_LIMITED,
        message: RATE_LIMIT_MESSAGE,
      });
      return true;
    });
    assert.equal(headers['Retry-After'], '3');
    assert.deepEqual(
      seen[0]?.map((bucket) => `${bucket.scope}:${bucket.subject}`),
      ['public:ip:203.0.113.9'],
    );
  });
});
