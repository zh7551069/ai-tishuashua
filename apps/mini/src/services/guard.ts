import Taro from '@tarojs/taro';
import { AuthApiError } from './auth-api';
import { HttpError } from './http';
import { clearToken, readToken } from './session';

export function isAuthFailure(error: unknown): boolean {
  return (
    (error instanceof HttpError || error instanceof AuthApiError) &&
    (error.status === 401 || error.status === 403)
  );
}

/** 没有登录态或会话失效时回到落地页，并返回 null。 */
export async function withAuth<T>(task: (token: string) => Promise<T>): Promise<T | null> {
  const token = readToken();
  if (!token) {
    await Taro.reLaunch({ url: '/pages/login/index' });
    return null;
  }
  try {
    return await task(token);
  } catch (error) {
    if (isAuthFailure(error)) {
      clearToken();
      await Taro.reLaunch({ url: '/pages/login/index' });
      return null;
    }
    throw error;
  }
}
