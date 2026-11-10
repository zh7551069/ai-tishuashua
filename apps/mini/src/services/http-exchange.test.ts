import assert from 'node:assert/strict';
import { mock } from 'node:test';
import test from 'node:test';
import { HttpError } from './http-error';
import {
  GET_RESPONSE_DEADLINE_MS,
  buildTransportRequest,
  dispatchApiRequest,
  interpretTransportResult,
  type TransportRequest,
  type TransportResponse,
  type TransportTask,
} from './http-exchange';

test('GET 关闭缓存，并带上不再协商的请求头', () => {
  const request = buildTransportRequest('http://127.0.0.1:3000/api/users/me', {
    method: 'GET',
    token: 'token-1',
  });
  assert.equal(request.enableCache, false);
  assert.equal(request.dataType, 'text');
  assert.equal(request.timeout, GET_RESPONSE_DEADLINE_MS);
  assert.equal(request.header.authorization, 'Bearer token-1');
  assert.equal(request.header['cache-control'], 'no-cache');
  assert.equal(request.header.pragma, 'no-cache');
  assert.equal(request.header['content-type'], undefined);
});

test('写请求不附带 GET 缓存开关', () => {
  const request = buildTransportRequest('http://127.0.0.1:3000/api/packs', {
    method: 'POST',
    token: 'token-1',
    data: { name: '包' },
  });
  assert.equal(request.enableCache, undefined);
  assert.equal(request.dataType, undefined);
  assert.equal(request.timeout, undefined);
  assert.equal(request.header['content-type'], 'application/json');
  assert.equal(request.header['cache-control'], undefined);
});

test('200 的 JSON 文本可以读出，304 和空正文会失败而不是当成成功', () => {
  const user = interpretTransportResult<{ id: string }>('GET', {
    statusCode: 200,
    data: '{"id":"u1"}',
  });
  assert.equal(user.id, 'u1');

  const alreadyObject = interpretTransportResult<{ id: string }>('GET', {
    statusCode: 200,
    data: { id: 'u2' },
  });
  assert.equal(alreadyObject.id, 'u2');

  assert.throws(
    () => interpretTransportResult('GET', { statusCode: 304, data: '' }),
    (error: unknown) => error instanceof HttpError && error.status === 304,
  );
  assert.throws(
    () => interpretTransportResult('GET', { statusCode: 304, data: '{"id":"stale"}' }),
    (error: unknown) => error instanceof HttpError && error.status === 304,
  );
  assert.throws(
    () => interpretTransportResult('GET', { statusCode: 200, data: '' }),
    (error: unknown) => error instanceof HttpError && error.status === 200,
  );
  assert.throws(
    () => interpretTransportResult('GET', { statusCode: 200, data: '   ' }),
    (error: unknown) => error instanceof HttpError && error.status === 200,
  );

  assert.throws(
    () =>
      interpretTransportResult('GET', {
        statusCode: 401,
        data: '{"code":"UNAUTHORIZED","message":"缺少登录会话"}',
      }),
    (error: unknown) =>
      error instanceof HttpError && error.status === 401 && error.message === '缺少登录会话',
  );
});

test('GET 回调不来时会超时并中断', { timeout: 5_000 }, async (t) => {
  t.after(() => {
    mock.timers.reset();
  });
  mock.timers.enable({ apis: ['setTimeout'] });

  let aborted = false;
  let seen: TransportRequest | undefined;
  const hung = dispatchApiRequest('/users/me', { method: 'GET', token: 'token-1' }, (request) => {
    seen = request;
    const task = new Promise<TransportResponse>(() => undefined) as TransportTask;
    task.abort = () => {
      aborted = true;
    };
    return task;
  });
  const assertion = assert.rejects(hung, (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 0);
    assert.equal(error.message, '网络异常，请重试');
    return true;
  });
  mock.timers.tick(GET_RESPONSE_DEADLINE_MS);
  await assertion;
  assert.equal(aborted, true);
  assert.equal(seen?.enableCache, false);
  assert.equal(seen?.header['cache-control'], 'no-cache');
});

test('304 空正文会立刻失败', async () => {
  const notModified = dispatchApiRequest('/packs', { method: 'GET' }, () => {
    return Promise.resolve({ statusCode: 304, data: '' }) as TransportTask;
  });
  await assert.rejects(
    notModified,
    (error: unknown) =>
      error instanceof HttpError && error.status === 304 && error.message === '网络异常，请重试',
  );
});
