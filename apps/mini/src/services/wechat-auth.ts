import Taro from '@tarojs/taro';

/**
 * 微信登录适配层占位。
 * 只向微信索取临时 code。用 code 换会话的接口是 POST /api/auth/wechat/login，业务尚未实现。
 */
export async function requestWechatLoginCode(): Promise<string> {
  const result = await Taro.login();
  if (!result.code) {
    throw new Error('微信登录未返回 code');
  }
  return result.code;
}
