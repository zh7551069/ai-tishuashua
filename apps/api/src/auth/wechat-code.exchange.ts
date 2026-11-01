import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { createHash } from 'node:crypto';
import { ApiException } from '../common/api.exception';

const WECHAT_CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

export interface WechatIdentity {
  openId: string;
  unionId: string | null;
}

export interface WechatExchangeOptions {
  appId: string;
  appSecret: string;
  mock: boolean;
  fetchImpl?: typeof fetch;
}

interface WechatCode2SessionBody {
  openid?: unknown;
  unionid?: unknown;
  session_key?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
}

/**
 * 用 wx.login 的 code 换 openId。
 * session_key 只存在于微信响应的局部变量里，不返回、不落库。
 * mock 默认关闭，只有 WECHAT_LOGIN_MOCK=true|1 才走本地替身。
 */
export class WechatCodeExchange {
  constructor(private readonly options: WechatExchangeOptions) {}

  async exchange(code: string): Promise<WechatIdentity> {
    if (this.options.mock) {
      return exchangeMock(code);
    }
    if (!this.options.appId || !this.options.appSecret) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.WECHAT_NOT_CONFIGURED,
        '微信登录未配置：设置 WECHAT_APP_ID 与 WECHAT_APP_SECRET，或在本地显式设置 WECHAT_LOGIN_MOCK=true',
      );
    }
    return exchangeLive({
      appId: this.options.appId,
      appSecret: this.options.appSecret,
      code,
      fetchImpl: this.options.fetchImpl ?? fetch,
    });
  }
}

function exchangeMock(code: string): WechatIdentity {
  if (code === 'mock-fail') {
    throw new ApiException(
      HttpStatus.UNAUTHORIZED,
      ApiErrorCode.WECHAT_AUTH_FAILED,
      '微信登录码无效或已使用',
    );
  }
  if (code === 'mock-upstream') {
    throw new ApiException(
      HttpStatus.BAD_GATEWAY,
      ApiErrorCode.WECHAT_UNAVAILABLE,
      '微信登录服务暂不可用',
    );
  }
  const digest = createHash('sha256').update(code).digest('hex').slice(0, 24);
  return { openId: `mock_${digest}`, unionId: null };
}

async function exchangeLive(input: {
  appId: string;
  appSecret: string;
  code: string;
  fetchImpl: typeof fetch;
}): Promise<WechatIdentity> {
  const url = new URL(WECHAT_CODE2SESSION_URL);
  url.searchParams.set('appid', input.appId);
  url.searchParams.set('secret', input.appSecret);
  url.searchParams.set('js_code', input.code);
  url.searchParams.set('grant_type', 'authorization_code');

  let response: Response;
  try {
    response = await input.fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    // 不记录异常原文：fetch 失败信息可能带上含 AppSecret 的请求 URL。
    console.error('[api] wechat: code2session request failed');
    throw new ApiException(
      HttpStatus.BAD_GATEWAY,
      ApiErrorCode.WECHAT_UNAVAILABLE,
      '微信登录服务暂不可用',
    );
  }

  let body: WechatCode2SessionBody;
  try {
    body = (await response.json()) as WechatCode2SessionBody;
  } catch {
    console.error('[api] wechat: code2session response was not json');
    throw new ApiException(
      HttpStatus.BAD_GATEWAY,
      ApiErrorCode.WECHAT_UNAVAILABLE,
      '微信登录服务暂不可用',
    );
  }

  const errcode = typeof body.errcode === 'number' ? body.errcode : 0;
  if (errcode !== 0) {
    console.error(`[api] wechat code2session errcode=${errcode}`);
    if (errcode === 40029 || errcode === 40163 || errcode === 40226) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.WECHAT_AUTH_FAILED,
        '微信登录码无效或已使用',
      );
    }
    if (errcode === 40013 || errcode === 40125) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.WECHAT_NOT_CONFIGURED,
        '微信应用配置无效',
      );
    }
    throw new ApiException(
      HttpStatus.BAD_GATEWAY,
      ApiErrorCode.WECHAT_UNAVAILABLE,
      '微信登录服务暂不可用',
    );
  }

  if (typeof body.openid !== 'string' || body.openid.length === 0) {
    throw new ApiException(
      HttpStatus.BAD_GATEWAY,
      ApiErrorCode.WECHAT_UNAVAILABLE,
      '微信登录服务暂不可用',
    );
  }

  return {
    openId: body.openid,
    unionId: typeof body.unionid === 'string' && body.unionid.length > 0 ? body.unionid : null,
  };
}
