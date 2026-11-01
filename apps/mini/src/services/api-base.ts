/** 小程序只知道 API 地址。微信 AppSecret 留在 API 服务端。 */
export function miniApiBase(): string {
  return process.env.TARO_APP_API_BASE || 'http://127.0.0.1:3000/api';
}
