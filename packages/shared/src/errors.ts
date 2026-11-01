export const ApiErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  /** 关联证书已下架。刷题包只可删除，不可修改或出题。 */
  PACK_UNAVAILABLE: 'PACK_UNAVAILABLE',
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
  /** 配置类：没有 LLM Key，且 LLM_MOCK 不是 true 或 1。 */
  LLM_NOT_CONFIGURED: 'LLM_NOT_CONFIGURED',
  /** 模型类：供应商超时、网络失败或 HTTP 非 2xx。 */
  LLM_UNAVAILABLE: 'LLM_UNAVAILABLE',
  /** 模型类：返回内容过不了 JSON Schema。 */
  LLM_INVALID_OUTPUT: 'LLM_INVALID_OUTPUT',
  /** 模型类：出题过程失败，且没有留下半卷。 */
  QUIZ_GENERATION_FAILED: 'QUIZ_GENERATION_FAILED',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}
