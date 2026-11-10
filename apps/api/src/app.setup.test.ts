import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode } from '@tishuashua/shared';
import { configureHttp } from './app.setup';
import { HttpCacheProbeModule } from './http-cache.module';

async function boot(): Promise<{ app: INestApplication; base: string }> {
  const app = await NestFactory.create(HttpCacheProbeModule, { logger: false });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number } | string | null;
  if (!address || typeof address === 'string') {
    await app.close();
    throw new Error('测试服务没有端口');
  }
  return { app, base: `http://127.0.0.1:${address.port}/api` };
}

async function read(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  return {
    status: response.status,
    etag: response.headers.get('etag'),
    cacheControl: response.headers.get('cache-control'),
    text,
  };
}

describe('configureHttp 不生成可再验证的缓存', () => {
  test('成功和 401 都没有 ETag，并带 no-store；带上 If-None-Match 仍返回正文', async () => {
    const booted = await boot();
    try {
      const ok = await read(`${booted.base}/cache-probe/ok`);
      assert.equal(ok.status, 200);
      assert.equal(ok.etag, null);
      assert.match(ok.cacheControl ?? '', /no-store/);
      assert.equal(JSON.parse(ok.text).status, 'ok');

      const again = await read(`${booted.base}/cache-probe/ok`, {
        'if-none-match': 'W/"1f-aaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      });
      assert.equal(again.status, 200);
      assert.equal(again.etag, null);
      assert.match(again.cacheControl ?? '', /no-store/);
      assert.equal(JSON.parse(again.text).status, 'ok');

      const denied = await read(`${booted.base}/cache-probe/private`, {
        'if-none-match': 'W/"1f-aaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      });
      assert.equal(denied.status, 401);
      assert.equal(denied.etag, null);
      assert.match(denied.cacheControl ?? '', /no-store/);
      assert.equal(JSON.parse(denied.text).code, ApiErrorCode.UNAUTHORIZED);
    } finally {
      await booted.app.close();
    }
  });
});
