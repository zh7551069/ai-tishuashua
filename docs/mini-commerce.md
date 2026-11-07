# 小程序商业化页

会员定价（TB-25 / C9）和场次加油包（TB-26 / C10）都复用 [微信支付与订单](payment.md) 里的 C7 链路，不新开 HTTP endpoint。半屏（TB-24）和「我」页（TB-27 / C11）只负责导航，不下单、不拉起支付。

## 「我」页（C11）

C11 只增强既有 `pages/me/index`。会员是否生效、到期日、今日剩余场次读 `GET /api/me/entitlement`，不写死配额、库存、到期或价格。档名可用 `skuCode` 约定映射，或只读 `GET /api/commerce/skus?type=member` 的名称；目录失败不挡住页面。本页不拉账本。

- 开通、续费、升级：`navigateTo` `pages/commerce/member/index`（TB-25）。
- 加油包：三帧没有单独入口行。购买仍走 TB-26 `pages/commerce/session-pack/index`（半屏和会员页已能到达）。
- 场次明细：入口进 `pages/commerce/session-ledger/index`。本页（「我」）不拉账本。没有账本粗算时，非会员只显示库存；会员显示「会员不限场 · 明细可查」。
- 每日分享、邀请有礼：入口进 `pages/commerce/daily-share/index` 与 `pages/commerce/invite/index`。`pages/commerce/tasks/index` 只做两行聚合。这两页目前是占位壳，不是 `122:8` / `122:10` 对稿。
- 签到 CTA 调 `POST /api/me/growth/checkin`，成功后再读权益。连胜条仍用本机记录。奖额读 `growthConfig`，不在页面写死。
- 本页禁止 `wx.requestPayment`、`POST /api/orders`、mock-notify 和 `upgrade-quote`。分享和邀请页同样禁止支付。

对稿帧 `122:5` / `122:11` / `122:7`。UI 评审见 [TB-27 三行](delivery/tb27-ui-tech-review-20261107.md)。契约：[TB-27 C](contracts/tb27-miniapp-me-member-states-C-contracts-v0.1.0-C.md)。

增长发奖的路由、幂等键和 pending 见 [增长](growth.md)。契约：[TB-29 C](contracts/tb29-daily-share-invite-C-contracts-v0.1.0-C.md)。

## 场次明细（C12）

C12 只替换既有 `pages/commerce/session-ledger/index`，对稿 `122:9`。样式对照 `design/bridge-export/mini-commerce-v2/`（与 TB-25/26/27 同源包）。本页只读 `GET /api/me/entitlement` 和 `GET /api/me/entitlement/ledger`，不新开 HTTP endpoint。

- 非会员「当前可用」= 日免剩余 + 奖励剩余 + 库存剩余，副文跟余额走。会员 `membership.active` 时大字改为「不限场」，不用三桶之和当剩余可扣场。
- 「今日消耗」= 已加载流水里 `bizDate === businessDate` 且 `delta < 0` 的合计。没有业务日就显示「—」，不写死。
- Tab 全部 / 获得 / 消耗过滤已加载页。获得是 `delta > 0`，消耗是 `delta < 0`。`delta === 0` 只出现在全部。
- 续拉用响应里的 `nextCursor`。失败可重试，不补假流水。
- 本页没有支付条，不调用 `wx.requestPayment`、`POST /api/orders`、mock-notify、`upgrade-quote`、grant。
- 已入账的任务、邀请、分享分录只读展示。发奖归 C13。消耗行没有证名和题数时标题是「AI 出题」。

UI 评审见 [TB-28 三行](delivery/tb28-ui-tech-review-20261107.md)。契约：[TB-28 C](contracts/tb28-miniapp-session-ledger-C-contracts-v0.1.0-C.md)。

## 场次加油包（C10）

C10 加油包页复用 C7 下单/支付；`orderKind=purchase`；不调 `upgrade-quote`。

- 路由：`pages/commerce/session-pack/index`（对稿 `122:6`）。半屏视觉：遮罩、顶拖条、白底圆角。支付壳在 `apps/mini/src/services/session-pack-pay.ts`。UI 评审见 [TB-26 三行](delivery/tb26-ui-tech-review-20261107.md)。
- 目录：`GET /api/commerce/skus?type=session_pack`。价、场次、有效期跟返回走，不写死。
- 下单：`POST /api/orders`，body 只有 `skuCode`、`orderKind: "purchase"`、可选 `clientIdempotencyKey`。不传应付金额，也不传 `renew` / `upgrade`。
- 支付：真 `wx.requestPayment`，或非生产 `WECHAT_PAY_MOCK` 下 `POST /api/dev/pay/mock-notify`。
- 完成后轮询 `GET /api/orders/:outTradeNo` 至 `paid`，再 `GET /api/me/entitlement`，看 `inventoryRemain` 是否增加。
- 履约仍由 TB-23 写入 inventory Lot。本页不改四桶，也不调退款。

契约：[TB-26 C](contracts/tb26-miniapp-session-boost-C-contracts-v0.1.0-C.md)。
