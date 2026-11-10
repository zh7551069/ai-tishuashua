import type { UserSummary, WechatLoginRequest, WechatLoginResponse } from '@tishuashua/shared';
import { HttpError, apiRequest } from './http';

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

/** 把 getPhoneNumber 的 code 绑到当前会话。不是短信登录。 */
export function bindWechatPhone(token: string, code: string): Promise<UserSummary> {
  return request<UserSummary>('/users/me/phone', {
    method: 'POST',
    token,
    data: { code },
  });
}

async function request<T>(
  path: string,
  options: { method: 'GET' | 'POST'; token?: string; data?: unknown },
): Promise<T> {
  try {
    return await apiRequest<T>(path, options);
  } catch (caught) {
    if (caught instanceof HttpError) {
      throw new AuthApiError(caught.message, caught.status, caught.code);
    }
    throw caught;
  }
}
