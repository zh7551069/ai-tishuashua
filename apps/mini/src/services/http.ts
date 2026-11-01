import Taro from '@tarojs/taro';
import { miniApiBase } from './api-base';

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function apiRequest<T>(
  path: string,
  options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; token?: string; data?: unknown },
): Promise<T> {
  return request<T>(path, options);
}

async function request<T>(
  path: string,
  options: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; token?: string; data?: unknown },
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
    throw new HttpError('网络异常，请重试', 0);
  }

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.data as T;
  }

  const body = response.data as ApiErrorPayload;
  throw new HttpError(body?.message || '请求失败', response.statusCode, body?.code);
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
}
