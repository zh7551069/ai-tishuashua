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

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'errMsg' in error && typeof error.errMsg === 'string') {
    return error.errMsg;
  }
  return '';
}
