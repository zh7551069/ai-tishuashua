import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { WechatCodeExchange } from './wechat-code.exchange';

const SECRET = 'super-secret-value';

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

describe('WechatCodeExchange', () => {
  test('mock 默认关闭且缺少密钥时失败，响应不含密钥', async () => {
    const exchange = new WechatCodeExchange({
      appId: '',
      appSecret: SECRET,
      mock: false,
    });

    const error = await expectApi(() => exchange.exchange('any-code'));
    assert.equal(error.getStatus(), HttpStatus.SERVICE_UNAVAILABLE);
    const body = error.getResponse() as ApiErrorBody;
    assert.equal(body.code, ApiErrorCode.WECHAT_NOT_CONFIGURED);
    assert.equal(body.message.includes(SECRET), false);
    assert.match(body.message, /WECHAT_LOGIN_MOCK/);
  });

  test('只配置了 AppId 同样视为未配置', async () => {
    const exchange = new WechatCodeExchange({
      appId: 'wx-test-app',
      appSecret: '',
      mock: false,
    });
    const error = await expectApi(() => exchange.exchange('any-code'));
    assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_NOT_CONFIGURED);
  });

  test('显式 mock 用 code 稳定映射 openId，且不调用 fetch', async () => {
    let called = false;
    const exchange = new WechatCodeExchange({
      appId: '',
      appSecret: '',
      mock: true,
      fetchImpl: async () => {
        called = true;
        throw new Error('mock 不应请求微信');
      },
    });

    const first = await exchange.exchange('dev-user-1');
    const second = await exchange.exchange('dev-user-1');
    const other = await exchange.exchange('dev-user-2');

    assert.equal(called, false);
    assert.equal(first.openId, second.openId);
    assert.notEqual(first.openId, other.openId);
    assert.match(first.openId, /^mock_[0-9a-f]{24}$/);
    assert.equal(first.unionId, null);
    assert.equal(JSON.stringify(first).includes('session_key'), false);
  });

  test('mock-fail 与 mock-upstream 返回约定错误码', async () => {
    const exchange = new WechatCodeExchange({ appId: '', appSecret: '', mock: true });

    const authError = await expectApi(() => exchange.exchange('mock-fail'));
    assert.equal((authError.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_AUTH_FAILED);

    const upstream = await expectApi(() => exchange.exchange('mock-upstream'));
    assert.equal((upstream.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_UNAVAILABLE);
  });

  test('真实 code2session 成功时丢弃 session_key', async () => {
    let seen: URL | undefined;
    const exchange = new WechatCodeExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async (input) => {
        seen = input instanceof URL ? input : new URL(String(input));
        return Response.json({
          openid: 'o_live_user',
          unionid: 'u_live_user',
          session_key: 'SESSION_KEY_SENTINEL',
          errcode: 0,
        });
      },
    });

    const identity = await exchange.exchange('live-code');
    assert.equal(identity.openId, 'o_live_user');
    assert.equal(identity.unionId, 'u_live_user');
    assert.equal(JSON.stringify(identity).includes('SESSION_KEY_SENTINEL'), false);
    assert.equal(seen?.hostname, 'api.weixin.qq.com');
    assert.equal(seen?.pathname, '/sns/jscode2session');
    assert.equal(seen?.searchParams.get('appid'), 'wx-test-app');
    assert.equal(seen?.searchParams.get('secret'), SECRET);
    assert.equal(seen?.searchParams.get('js_code'), 'live-code');
    assert.equal(seen?.searchParams.get('grant_type'), 'authorization_code');
  });

  test('微信 40029 映射为登录失败，且不回传密钥或 errmsg', async () => {
    const exchange = new WechatCodeExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async () =>
        Response.json({
          errcode: 40029,
          errmsg: `invalid code ${SECRET}`,
        }),
    });

    const error = await expectApi(() => exchange.exchange('bad-code'));
    assert.equal(error.getStatus(), HttpStatus.UNAUTHORIZED);
    const body = error.getResponse() as ApiErrorBody;
    assert.equal(body.code, ApiErrorCode.WECHAT_AUTH_FAILED);
    assert.equal(body.message.includes(SECRET), false);
    assert.equal(body.message.includes('invalid code'), false);
  });

  test('微信 40125 视为应用配置无效', async () => {
    const exchange = new WechatCodeExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async () => Response.json({ errcode: 40125, errmsg: 'invalid appsecret' }),
    });
    const error = await expectApi(() => exchange.exchange('bad-code'));
    const body = error.getResponse() as ApiErrorBody;
    assert.equal(body.code, ApiErrorCode.WECHAT_NOT_CONFIGURED);
    assert.equal(body.message.includes(SECRET), false);
  });

  test('非 JSON 或网络失败映射为微信不可用，且不泄露密钥', async () => {
    const htmlExchange = new WechatCodeExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async () => new Response('<html>bad</html>', { status: 500 }),
    });
    const htmlError = await expectApi(() => htmlExchange.exchange('code'));
    assert.equal((htmlError.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_UNAVAILABLE);

    const networkExchange = new WechatCodeExchange({
      appId: 'wx-test-app',
      appSecret: SECRET,
      mock: false,
      fetchImpl: async () => {
        throw new Error(`connect failed ${SECRET}`);
      },
    });
    const networkError = await expectApi(() => networkExchange.exchange('code'));
    const body = networkError.getResponse() as ApiErrorBody;
    assert.equal(body.code, ApiErrorCode.WECHAT_UNAVAILABLE);
    assert.equal(body.message.includes(SECRET), false);
  });
});
