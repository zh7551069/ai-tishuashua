export const ApiErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL: 'INTERNAL',
  /** 未配置 WECHAT_APP_ID / WECHAT_APP_SECRET，且未显式打开登录 mock。 */
  WECHAT_NOT_CONFIGURED: 'WECHAT_NOT_CONFIGURED',
  /** code 无效、已使用，或 mock 约定的失败码。 */
  WECHAT_AUTH_FAILED: 'WECHAT_AUTH_FAILED',
  /** 微信 jscode2session 超时、网络失败或返回非预期错误。 */
  WECHAT_UNAVAILABLE: 'WECHAT_UNAVAILABLE',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  REDIS_UNAVAILABLE: 'REDIS_UNAVAILABLE',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}
