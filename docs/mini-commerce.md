# 小程序商业化页

会员定价（TB-25 / C9）和场次加油包（TB-26 / C10）都复用 [微信支付与订单](payment.md) 里的 C7 链路，不新开 HTTP endpoint。半屏（TB-24）只负责导航，不下单、不拉起支付。

## 场次加油包（C10）

C10 加油包页复用 C7 下单/支付；`orderKind=purchase`；不调 `upgrade-quote`。

- 路由：`pages/commerce/session-pack/index`（对稿 `122:6`）。半屏视觉：遮罩、顶拖条、白底圆角。支付壳在 `apps/mini/src/services/session-pack-pay.ts`。UI 评审见 [TB-26 三行](delivery/tb26-ui-tech-review-20261107.md)。
- 目录：`GET /api/commerce/skus?type=session_pack`。价、场次、有效期跟返回走，不写死。
- 下单：`POST /api/orders`，body 只有 `skuCode`、`orderKind: "purchase"`、可选 `clientIdempotencyKey`。不传应付金额，也不传 `renew` / `upgrade`。
- 支付：真 `wx.requestPayment`，或非生产 `WECHAT_PAY_MOCK` 下 `POST /api/dev/pay/mock-notify`。
- 完成后轮询 `GET /api/orders/:outTradeNo` 至 `paid`，再 `GET /api/me/entitlement`，看 `inventoryRemain` 是否增加。
- 履约仍由 TB-23 写入 inventory Lot。本页不改四桶，也不调退款。

契约：[TB-26 C](contracts/tb26-miniapp-session-boost-C-contracts-v0.1.0-C.md)。
