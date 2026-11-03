import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { WechatPhoneExchange } from './wechat-phone.exchange';

const SECRET = 'super-secret-value';
const RAW_PHONE = '13800138000';

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

describe('WechatPhoneExchange', () => {
  test('mock 关闭且缺少密钥时失败，响应不含密钥', async () => {
    let called = false;
    const exchange = new WechatPhoneExchange({
      appId: '',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async () => {
        called = true;
        throw new Error('不应请求微信');
      },
    });

    const error = await expectApi(() => exchange.exchange('any-code'));
    assert.equal(called, false);
    assert.equal(error.getStatus(), HttpStatus.SERVICE_UNAVAILABLE);
    const body = error.getResponse() as ApiErrorBody;
    assert.equal(body.code, ApiErrorCode.WECHAT_NOT_CONFIGURED);
    assert.equal(body.message.includes(SECRET), false);
    assert.match(body.message, /WECHAT_LOGIN_MOCK/);
  });

  test('显式 mock 不请求微信，指定号码和稳定号码都可测', async () => {
    let called = false;
    const exchange = new WechatPhoneExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: true,
      fetchImpl: async () => {
        called = true;
        throw new Error('mock 不应请求微信');
      },
    });

    const explicit = await exchange.exchange(`mock-phone-${RAW_PHONE}`);
    const again = await exchange.exchange('devtools-code');
    const same = await exchange.exchange('devtools-code');
    const other = await exchange.exchange('devtools-code-2');

    assert.equal(called, false);
    assert.equal(explicit.nationalNumber, RAW_PHONE);
    assert.equal(again.nationalNumber, same.nationalNumber);
    assert.match(again.nationalNumber, /^1[3-9]\d{9}$/);
    assert.notEqual(again.nationalNumber, other.nationalNumber);
    assert.equal(JSON.stringify(explicit).includes(SECRET), false);

    const authError = await expectApi(() => exchange.exchange('mock-fail'));
    assert.equal((authError.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_AUTH_FAILED);

    const short = await expectApi(() => exchange.exchange('mock-phone-123'));
    assert.equal((short.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_AUTH_FAILED);

    const upstream = await expectApi(() => exchange.exchange('mock-upstream'));
    assert.equal((upstream.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_UNAVAILABLE);
  });

  test('真实换号成功时缓存 access_token，响应不含 token 和密钥', async () => {
    const seen: string[] = [];
    const exchange = new WechatPhoneExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async (input, init) => {
        const url = input instanceof URL ? input : new URL(String(input));
        seen.push(url.pathname);
        if (url.pathname === '/cgi-bin/token') {
          assert.equal(url.searchParams.get('secret'), SECRET);
          assert.equal(url.searchParams.get('appid'), 'wx-test-app');
          return Response.json({ access_token: 'TOKEN_SENTINEL', expires_in: 7200 });
        }
        assert.equal(url.pathname, '/wxa/business/getuserphonenumber');
        assert.equal(url.searchParams.get('access_token'), 'TOKEN_SENTINEL');
        assert.equal(init?.method, 'POST');
        assert.deepEqual(JSON.parse(String(init?.body)), { code: 'live-code' });
        return Response.json({
          errcode: 0,
          phone_info: {
            phoneNumber: RAW_PHONE,
            purePhoneNumber: RAW_PHONE,
            countryCode: '86',
            watermark: { appid: 'wx-test-app' },
          },
        });
      },
    });

    const first = await exchange.exchange('live-code');
    const second = await exchange.exchange('live-code');
    assert.equal(first.nationalNumber, RAW_PHONE);
    assert.equal(second.nationalNumber, RAW_PHONE);
    assert.deepEqual(seen, [
      '/cgi-bin/token',
      '/wxa/business/getuserphonenumber',
      '/wxa/business/getuserphonenumber',
    ]);
    assert.equal(JSON.stringify(first).includes('TOKEN_SENTINEL'), false);
    assert.equal(JSON.stringify(first).includes(SECRET), false);
  });

  test('access_token 失效时刷新一次；坏 code 不回传 errmsg 或密钥', async () => {
    let tokenCalls = 0;
    let phoneCalls = 0;
    const exchange = new WechatPhoneExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        if (url.pathname === '/cgi-bin/token') {
          tokenCalls += 1;
          return Response.json({ access_token: `token-${tokenCalls}`, expires_in: 7200 });
        }
        phoneCalls += 1;
        if (phoneCalls === 1) {
          return Response.json({ errcode: 40001, errmsg: `invalid credential ${SECRET}` });
        }
        return Response.json({
          errcode: 0,
          phone_info: {
            purePhoneNumber: RAW_PHONE,
            countryCode: '86',
            watermark: { appid: 'wx-test-app' },
          },
        });
      },
    });

    const phone = await exchange.exchange('live-code');
    assert.equal(phone.nationalNumber, RAW_PHONE);
    assert.equal(tokenCalls, 2);
    assert.equal(phoneCalls, 2);

    const bad = new WechatPhoneExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        if (url.pathname === '/cgi-bin/token') {
          return Response.json({ access_token: 'token', expires_in: 7200 });
        }
        return Response.json({ errcode: 40029, errmsg: `invalid code ${SECRET} ${RAW_PHONE}` });
      },
    });
    const error = await expectApi(() => bad.exchange('used-code'));
    const body = error.getResponse() as ApiErrorBody;
    assert.equal(error.getStatus(), HttpStatus.UNAUTHORIZED);
    assert.equal(body.code, ApiErrorCode.WECHAT_AUTH_FAILED);
    assert.equal(body.message.includes(SECRET), false);
    assert.equal(body.message.includes(RAW_PHONE), false);
    assert.equal(body.message.includes('invalid code'), false);
  });

  test('水印 appid 不一致视为凭证无效，网络失败不泄露密钥', async () => {
    const mismatch = new WechatPhoneExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input));
        if (url.pathname === '/cgi-bin/token') {
          return Response.json({ access_token: 'token', expires_in: 7200 });
        }
        return Response.json({
          errcode: 0,
          phone_info: {
            purePhoneNumber: RAW_PHONE,
            watermark: { appid: 'wx-other-app' },
          },
        });
      },
    });
    const mismatchError = await expectApi(() => mismatch.exchange('live-code'));
    const mismatchBody = mismatchError.getResponse() as ApiErrorBody;
    assert.equal(mismatchBody.code, ApiErrorCode.WECHAT_AUTH_FAILED);
    assert.equal(mismatchBody.message.includes(RAW_PHONE), false);

    const network = new WechatPhoneExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async () => {
        throw new Error(`connect failed ${SECRET}`);
      },
    });
    const networkError = await expectApi(() => network.exchange('live-code'));
    const networkBody = networkError.getResponse() as ApiErrorBody;
    assert.equal(networkBody.code, ApiErrorCode.WECHAT_UNAVAILABLE);
    assert.equal(networkBody.message.includes(SECRET), false);
  });
});
