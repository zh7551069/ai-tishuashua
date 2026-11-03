import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { createHash } from 'node:crypto';
import { ApiException } from '../common/api.exception';

const WECHAT_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const WECHAT_PHONE_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';

export interface WechatPhone {
  /** 不含区号的数字串。调用方必须脱敏后再落库、再放进响应。 */
  nationalNumber: string;
}

export interface WechatPhoneExchangeOptions {
  appId: string;
  appSecret: string;
  mock: boolean;
  fetchImpl?: typeof fetch;
}

interface WechatTokenBody {
  access_token?: unknown;
  expires_in?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
}

interface WechatPhoneBody {
  errcode?: unknown;
  errmsg?: unknown;
  phone_info?: {
    phoneNumber?: unknown;
    purePhoneNumber?: unknown;
    countryCode?: unknown;
    watermark?: { appid?: unknown };
  };
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * 用 getPhoneNumber 的 code 换手机号。
 * 与 jscode2session 不是同一个接口：先取 access_token，再调 getuserphonenumber。
 * mock 跟登录共用 WECHAT_LOGIN_MOCK，打开后不请求微信。
 */
export class WechatPhoneExchange {
  private cachedToken: CachedToken | null = null;

  constructor(private readonly options: WechatPhoneExchangeOptions) {}

  async exchange(code: string): Promise<WechatPhone> {
    if (this.options.mock) {
      return { nationalNumber: mockNationalNumber(code) };
    }
    if (!this.options.appId || !this.options.appSecret) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.WECHAT_NOT_CONFIGURED,
        '微信登录未配置：设置 WECHAT_APP_ID 与 WECHAT_APP_SECRET，或在本地显式设置 WECHAT_LOGIN_MOCK=true',
      );
    }
    return this.exchangeLive(code);
  }

  private async exchangeLive(code: string): Promise<WechatPhone> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const first = await this.postPhone(fetchImpl, code, await this.accessToken());
    const firstCode = readErrcode(first);
    if (firstCode === 40001 || firstCode === 42001) {
      this.cachedToken = null;
      const second = await this.postPhone(fetchImpl, code, await this.accessToken(true));
      return this.readPhone(second);
    }
    return this.readPhone(first);
  }

  private async accessToken(force = false): Promise<string> {
    if (force) {
      this.cachedToken = null;
    }
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    return this.fetchAccessToken();
  }

  private async fetchAccessToken(): Promise<string> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = new URL(WECHAT_TOKEN_URL);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', this.options.appId);
    url.searchParams.set('secret', this.options.appSecret);

    const body = await requestJson(fetchImpl, url, undefined);
    const tokenBody = body as WechatTokenBody;
    const errcode = readErrcode(tokenBody);
    if (errcode !== 0) {
      console.error(`[api] wechat token errcode=${errcode}`);
      throw mapPhoneErrcode(errcode);
    }
    if (typeof tokenBody.access_token !== 'string' || tokenBody.access_token.length === 0) {
      throw unavailable();
    }
    const expiresIn = typeof tokenBody.expires_in === 'number' ? tokenBody.expires_in : 7200;
    const ttlSeconds = Math.max(30, Math.min(expiresIn, 7200) - 120);
    this.cachedToken = {
      value: tokenBody.access_token,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    return tokenBody.access_token;
  }

  private async postPhone(
    fetchImpl: typeof fetch,
    code: string,
    accessToken: string,
  ): Promise<WechatPhoneBody> {
    const url = new URL(WECHAT_PHONE_URL);
    url.searchParams.set('access_token', accessToken);
    const body = await requestJson(fetchImpl, url, JSON.stringify({ code }));
    return body as WechatPhoneBody;
  }

  private readPhone(body: WechatPhoneBody): WechatPhone {
    const errcode = readErrcode(body);
    if (errcode !== 0) {
      console.error(`[api] wechat getuserphonenumber errcode=${errcode}`);
      throw mapPhoneErrcode(errcode);
    }
    return {
      nationalNumber: readNationalNumber(body.phone_info, this.options.appId),
    };
  }
}

function mockNationalNumber(code: string): string {
  if (code === 'mock-fail') {
    throw authFailed();
  }
  if (code === 'mock-upstream') {
    throw unavailable();
  }
  const explicit = /^mock-phone-(\d+)$/.exec(code);
  if (explicit?.[1]) {
    if (!/^\d{7,15}$/.test(explicit[1])) {
      throw authFailed();
    }
    return explicit[1];
  }
  return stableMockPhone(code);
}

/** 同一个 code 得到同一个 11 位测试号，方便开发者工具里直接点授权。 */
function stableMockPhone(code: string): string {
  const digest = createHash('sha256').update(`phone:${code}`).digest();
  const digits = ['1', String(3 + ((digest[0] ?? 0) % 7))];
  for (let index = 1; index < 10; index += 1) {
    digits.push(String((digest[index] ?? 0) % 10));
  }
  return digits.join('');
}

function readNationalNumber(
  info: WechatPhoneBody['phone_info'] | undefined,
  appId: string,
): string {
  if (!info) {
    throw unavailable();
  }
  const watermarkAppId = typeof info.watermark?.appid === 'string' ? info.watermark.appid : '';
  if (watermarkAppId && watermarkAppId !== appId) {
    throw authFailed();
  }
  const pure = digits(info.purePhoneNumber);
  if (isNational(pure)) {
    return pure;
  }
  const full = digits(info.phoneNumber);
  const country = digits(info.countryCode);
  if (country && full.startsWith(country)) {
    const national = full.slice(country.length);
    if (isNational(national)) {
      return national;
    }
  }
  if (isNational(full)) {
    return full;
  }
  throw unavailable();
}

function digits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function isNational(value: string): boolean {
  return /^\d{7,15}$/.test(value);
}

function readErrcode(body: { errcode?: unknown }): number {
  return typeof body.errcode === 'number' ? body.errcode : 0;
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: URL,
  body: string | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // fetch 失败信息可能带上含 AppSecret 的请求 URL，不记录原文。
    console.error('[api] wechat phone request failed');
    throw unavailable();
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    console.error('[api] wechat phone response was not json');
    throw unavailable();
  }
}

function mapPhoneErrcode(errcode: number): ApiException {
  if (errcode === 40029) {
    return authFailed();
  }
  if (errcode === 40013 || errcode === 40125) {
    return new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      ApiErrorCode.WECHAT_NOT_CONFIGURED,
      '微信应用配置无效',
    );
  }
  return unavailable();
}

function authFailed(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    ApiErrorCode.WECHAT_AUTH_FAILED,
    '手机号授权凭证无效或已使用',
  );
}

function unavailable(): ApiException {
  return new ApiException(
    HttpStatus.BAD_GATEWAY,
    ApiErrorCode.WECHAT_UNAVAILABLE,
    '微信手机号服务暂不可用',
  );
}
