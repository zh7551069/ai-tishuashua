# 微信支付与订单

本刀只做 API、migration 和文档。没有小程序会员定价页、加油包页或用尽半屏。后管只有订单只读列表，没有退款按钮。

契约：[TB-23 C v0.1.0-C](contracts/tb23-wechat-pay-order-C-contracts-v0.1.0-C.md)。

## 行为

- 应付金额只看服务端 SKU `price_fen`，升级单看服务端重算的差价。请求体里的 `amountFen` / `amount` 直接丢掉。
- 回调核对应付金额。`amount.total` 必须等于订单快照 `amount_fen`，否则记 `fail_reason=amount_mismatch`，不改成 `paid`，也不发放权益。
- 支付成功在同一事务里把订单改成 `paid`，再调用 TB-20 `grantEntitlement`。会员 `refId` 和加油包 `refId` 都是 `order:{out_trade_no}`。不会直接改余额，也不会绕过 grant 去改 `ends_at`。
- 会员单入账后写 `memberships.last_order_id`。加油包入账后把对应库存批次的 `order_id` 写成商户订单号。
- 同一个 `out_trade_no` 已经是 `paid` 时，再次通知返回 HTTP 200，不再次 grant。
- 有效会员不能买更低档（`PAY_DOWNGRADE_FORBIDDEN`）。同档续费把 `ends_at` 从当前到期日和支付时间的较晚者再延长一个周期。更高档升级按下面的差价收费，支付成功后 `ends_at = paid_at + 目标天数`（满档重算）。
- 加油包只能 `purchase`。
- 本刀不调用微信退款，也不自动冲正。`commerce_refund_tickets` 只是空壳，状态只能是 `open`，没有创建工单的 API。
- 超过 2 小时仍停在 `created` / `prepay` 的订单，在用户或后管**读取**时改成 `closed`。读取之前如果回调先到，只要当时还是 `created` / `prepay`，仍可入账。

档位比较用 `duration_days`：`member_week(7) < member_month(30) < member_quarter(90) < member_year(365)`。天数相同视为同档，只能续费。

差价：

```text
remainingDays = max(0, ceil((ends_at - now) / 86400 秒))
remainingValueFen = floor(当前价 * remainingDays / 当前天数)
payFen = max(0, 目标价 - remainingValueFen)
```

## 接口

微信用户 `Authorization: Bearer`：

| 方法 | 路径                        | 说明                                                                      |
| ---- | --------------------------- | ------------------------------------------------------------------------- |
| GET  | `/api/commerce/skus?type=`  | 只返回 `enabled=true`。可短缓存，键与后管 SKU 失效共用 `commerce:skus:v1` |
| POST | `/api/orders`               | 建单并预下单。201                                                         |
| GET  | `/api/orders`               | 本人订单，`limit` 默认 20，最大 50                                        |
| GET  | `/api/orders/:outTradeNo`   | 只能看自己的                                                              |
| POST | `/api/orders/upgrade-quote` | `{ targetSkuCode }`                                                       |

没有用户 Bearer：

| 方法 | 路径                 | 说明                                                            |
| ---- | -------------------- | --------------------------------------------------------------- |
| POST | `/api/pay/wx/notify` | 微信 APIv3 通知。验签用平台证书，解密用 `WECHAT_PAY_API_V3_KEY` |

仅非生产且 `WECHAT_PAY_MOCK` 为 `true` 或 `1`：

| 方法 | 路径                       | 说明                                                                           |
| ---- | -------------------------- | ------------------------------------------------------------------------------ |
| POST | `/api/dev/pay/mock-notify` | `{ outTradeNo, transactionId? }`。跳过验签，走和正式回调一样的入账。生产恒 404 |

后管 Bearer：

| 方法 | 路径                         | 说明                                             |
| ---- | ---------------------------- | ------------------------------------------------ |
| GET  | `/api/admin/commerce/orders` | 只读。可按 `userId`、`outTradeNo`、`status` 筛选 |

### 回调给微信的 HTTP

成功（含已支付的重复通知，以及非 `SUCCESS` 的交易状态）返回 **200**：

```json
{ "code": "SUCCESS", "message": "成功" }
```

失败沿用本仓错误体，HTTP 非 2xx，微信会重试：

| 情况                                             | HTTP | code                  |
| ------------------------------------------------ | ---- | --------------------- |
| 验签失败、证书或 APIv3 密钥读不到、密文解不开    | 401  | `PAY_SIGN_INVALID`    |
| 金额不一致                                       | 400  | `PAY_AMOUNT_MISMATCH` |
| 订单不存在                                       | 404  | `NOT_FOUND`           |
| 已关单、已失败，或付款人 openId 与下单快照不一致 | 409  | `PAY_ORDER_STATE`     |

验签串是 `` `{timestamp}\n{nonce}\n{原始 body}\n` ``。时间戳偏离超过 5 分钟视为失败。日志不打印签名、私钥、APIv3 密钥或 `paySign`。

## 环境变量

名字见根目录和 `apps/api/.env.example`。仓库里只有空赋值，没有私钥、证书或 APIv3 真值。

| 变量                            | 作用                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `WECHAT_APP_ID`                 | JSAPI AppId。`WECHAT_PAY_APP_ID` 为空时用它                   |
| `WECHAT_PAY_APP_ID`             | 可选，覆盖支付 AppId                                          |
| `WECHAT_PAY_MCH_ID`             | 商户号                                                        |
| `WECHAT_PAY_MCH_SERIAL_NO`      | 商户 API 证书序列号                                           |
| `WECHAT_PAY_PRIVATE_KEY_PATH`   | 商户私钥文件。优先于正文                                      |
| `WECHAT_PAY_PRIVATE_KEY`        | 商户私钥 PEM。与 PATH 二选一                                  |
| `WECHAT_PAY_API_V3_KEY`         | 解密回调                                                      |
| `WECHAT_PAY_NOTIFY_URL`         | 公网 HTTPS 回调地址                                           |
| `WECHAT_PAY_PLATFORM_CERT_PATH` | 平台证书，用来验签                                            |
| `WECHAT_PAY_MOCK`               | `true` 或 `1` 才打开。`NODE_ENV=production` 时忽略            |
| `WECHAT_PAY_ENABLED`            | 只有 `false` 或 `0` 强制关闭。不填时，mock 或商户配齐即可下单 |

未配齐且未 mock：`503 PAY_NOT_CONFIGURED`。

真实预下单走 `POST https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi`。支付客户端在 `apps/api`，使用 Node `crypto`。`packages/shared` 的 barrel 不读文件，也不引用支付 SDK。

Mock 的 `payParams.paySign` 固定为占位字符串 `mock`，给本地和 CI 走「下单 → mock 回调 → 入账」。

## 上线前

真实收款不挡本刀的 mock 开发。上线前由辉侧确认：

1. 商户号、API 证书、APIv3 密钥只放在环境或密钥挂载，不进仓库。
2. `WECHAT_PAY_NOTIFY_URL` 是公网 HTTPS，指向 `/api/pay/wx/notify`。
3. 小程序 AppId 与商户号已绑定，支付目录已配置。
4. 生产环境不要设置 `WECHAT_PAY_MOCK`。
5. 平台证书文件挂到 `WECHAT_PAY_PLATFORM_CERT_PATH`。本刀不自动下载平台证书。
6. 微信账单对账任务名预留为 `payment.wechat-bill-reconcile`，没有调度，也不会去拉账单。

## 小程序会员定价（TB-25 / C9）

会员定价页复用上面的 C7 下单与支付，不新开 HTTP endpoint。契约见 [TB-25 C](contracts/tb25-miniapp-membership-pricing-C-contracts-v0.1.0-C.md)。页面是 `pages/commerce/member/index`（对稿 `122:4`）。调用壳在 `apps/mini/src/services/membership-pay.ts`：拉 `GET /api/commerce/skus?type=member`，升级先 `POST /api/orders/upgrade-quote`，再 `POST /api/orders`，然后 `wx.requestPayment` 或 dev `POST /api/dev/pay/mock-notify`，轮询至 `paid` 后刷新 `GET /api/me/entitlement`。半屏仍不支付。加油包入口只导航到 C10。金额以服务端为准。
