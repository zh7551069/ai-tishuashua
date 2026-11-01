import Taro from '@tarojs/taro';
import type { UserSummary, WechatLoginRequest, WechatLoginResponse } from '@tishuashua/shared';
import { miniApiBase } from './api-base';

export class AuthApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

export function loginWithWechatCode(input: WechatLoginRequest): Promise<WechatLoginResponse> {
  return request<WechatLoginResponse>('/auth/wechat/login', {
    method: 'POST',
    data: input,
  });
}

export function fetchCurrentUser(token: string): Promise<UserSummary> {
  return request<UserSummary>('/users/me', {
    method: 'GET',
    token,
  });
}

async function request<T>(
  path: string,
  options: { method: 'GET' | 'POST'; token?: string; data?: unknown },
): Promise<T> {
  let response: Taro.request.SuccessCallbackResult<T | ApiErrorPayload>;
  try {
    response = await Taro.request<T | ApiErrorPayload>({
      url: `${miniApiBase()}${path}`,
      method: options.method,
      data: options.data,
      header: {
        ...(options.data ? { 'content-type': 'application/json' } : {}),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
    });
  } catch {
    throw new AuthApiError('网络异常，请重试', 0);
  }

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.data as T;
  }

  const body = response.data as ApiErrorPayload;
  throw new AuthApiError(body?.message || '请求失败', response.statusCode, body?.code);
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
}
