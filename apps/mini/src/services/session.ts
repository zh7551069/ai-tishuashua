import Taro from '@tarojs/taro';

const TOKEN_KEY = 'tishuashua.token';

export function readToken(): string {
  const value: unknown = Taro.getStorageSync(TOKEN_KEY);
  return typeof value === 'string' ? value : '';
}

export function saveToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token);
}

export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY);
}
