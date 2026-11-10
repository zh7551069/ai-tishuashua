export const ApiErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  /** 关联证书已下架。刷题包只可删除，不可修改或出题。 */
  PACK_UNAVAILABLE: 'PACK_UNAVAILABLE',
  /** 目录项仍被证书、刷题包、错题或用户课件引用，不能删除。可以改为下架。 */
  CATALOG_IN_USE: 'CATALOG_IN_USE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 超过 API 限流窗口。HTTP 429。规则见 docs/rate-limit.md。 */
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL: 'INTERNAL',
  /** 每日计划读路径上的未预期失败。其它接口的未捕获异常仍用 INTERNAL。 */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
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
  /** 非会员且日免、任务奖、库存都不足以预扣 1 场。HTTP 402。 */
  ENTITLEMENT_EXHAUSTED: 'ENTITLEMENT_EXHAUSTED',
  /** 同一幂等键冲突且无法安全合并。HTTP 409。 */
  ENTITLEMENT_CONFLICT: 'ENTITLEMENT_CONFLICT',
  /** 未配齐微信支付商户，且未打开 WECHAT_PAY_MOCK。HTTP 503。 */
  PAY_NOT_CONFIGURED: 'PAY_NOT_CONFIGURED',
  /** SKU 不存在或已停用。HTTP 409。 */
  PAY_SKU_UNAVAILABLE: 'PAY_SKU_UNAVAILABLE',
  /** 有效会员不能购买更低档位。HTTP 409。 */
  PAY_DOWNGRADE_FORBIDDEN: 'PAY_DOWNGRADE_FORBIDDEN',
  /** 回调金额和订单快照不一致。HTTP 400。 */
  PAY_AMOUNT_MISMATCH: 'PAY_AMOUNT_MISMATCH',
  /** 微信支付回调验签失败。HTTP 401。 */
  PAY_SIGN_INVALID: 'PAY_SIGN_INVALID',
  /** 订单状态不能这样迁移。HTTP 409。 */
  PAY_ORDER_STATE: 'PAY_ORDER_STATE',
  /** 签到、分享或邀请开关关闭。HTTP 403。 */
  GROWTH_DISABLED: 'GROWTH_DISABLED',
  /** 今日已签到或分享奖励已领。推荐接口改回 200 幂等；保留此码供硬拒绝。HTTP 409。 */
  GROWTH_ALREADY_CLAIMED: 'GROWTH_ALREADY_CLAIMED',
  /** 已经有邀请人。HTTP 409。 */
  GROWTH_ALREADY_BOUND: 'GROWTH_ALREADY_BOUND',
  /** 自己邀请自己，或打开自己的分享链接刷奖。HTTP 400。 */
  GROWTH_SELF_INVITE: 'GROWTH_SELF_INVITE',
  /** shareToken 不存在或不是今天。HTTP 400。 */
  GROWTH_INVALID_TOKEN: 'GROWTH_INVALID_TOKEN',
  /** 日/周封顶后若选择硬拒绝。默认邀请人超额改写 pending，不走这个码。HTTP 409。 */
  GROWTH_CAP_REACHED: 'GROWTH_CAP_REACHED',
  /** 邀请码无效，或其它增长条件不满足。HTTP 400。 */
  GROWTH_CONDITION_NOT_MET: 'GROWTH_CONDITION_NOT_MET',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** 用尽场次时附带半屏最小载荷。旧客户端可以忽略。 */
  details?: unknown;
}
