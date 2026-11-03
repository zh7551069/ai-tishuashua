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
  /** 未配置 ADMIN_USERNAME / ADMIN_PASSWORD。代码里没有默认帐号。 */
  ADMIN_NOT_CONFIGURED: 'ADMIN_NOT_CONFIGURED',
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
  /** 课件扩展名不在 PPT / PPTX / PDF / DOC / DOCX。 */
  COURSEWARE_UNSUPPORTED: 'COURSEWARE_UNSUPPORTED',
  /** 单个课件超过 50MB。 */
  COURSEWARE_TOO_LARGE: 'COURSEWARE_TOO_LARGE',
  /** 文件里读不出可用文字。 */
  COURSEWARE_UNREADABLE: 'COURSEWARE_UNREADABLE',
  /** 提炼失败，且不是模型配置或输出错误。 */
  EXTRACT_FAILED: 'EXTRACT_FAILED',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}
