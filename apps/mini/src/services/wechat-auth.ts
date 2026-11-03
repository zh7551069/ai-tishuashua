import Taro from '@tarojs/taro';

/**
 * 只向微信索取临时 code。AppSecret 不在小程序里。
 * 换会话走 POST /api/auth/wechat/login。
 */
export async function requestWechatLoginCode(): Promise<string> {
  try {
    const result = await Taro.login();
    if (!result.code) {
      throw new Error('授权已取消');
    }
    return result.code;
  } catch (error) {
    const message = errorText(error);
    if (/deny|cancel|取消/i.test(message) || message.length === 0) {
      throw new Error('授权已取消');
    }
    throw new Error('微信登录失败，请重试');
  }
}

export interface PhoneAuthDetail {
  errMsg?: string;
  code?: string;
}

/**
 * 读取 getPhoneNumber 回调里的动态 code。
 * 用户拒绝时不把空 code 发给 API。这个 code 不能当登录码。
 */
export function readPhoneAuthCode(detail: PhoneAuthDetail): string {
  const errMsg = detail.errMsg ?? '';
  if (/user deny|cancel|deny|拒绝|取消/i.test(errMsg)) {
    throw new Error('授权已取消');
  }
  if (errMsg && !/:ok\b/.test(errMsg)) {
    throw new Error('微信手机号授权失败，请重试');
  }
  const code = detail.code?.trim() ?? '';
  if (!code) {
    throw new Error('没有拿到手机号授权凭证');
  }
  return code;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'errMsg' in error && typeof error.errMsg === 'string') {
    return error.errMsg;
  }
  return '';
}
