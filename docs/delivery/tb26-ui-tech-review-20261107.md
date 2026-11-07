# UI 技术评审 · TB-26 / C10 小程序场次加油包（2026-11-07）

| 项 | 值 |
| --- | --- |
| 角色 | 架构师 Arch |
| 切片 | TB-26 / 看板 C10 |
| 契约 | `C 契约 · TB-26 … v0.1.0-C`（§5 前端四件套 / §4 对 UI / H1–H13 / F1–F8） |
| 样式权威 | `design/小程序（商业化v2.0.0）/`（index.html + styles.css + svgs）；**禁** design/dev-cache / figma-dev-cache / `get_design_context` |
| 副源 | Bridge / 既有截图仅对照；**未**采为权威；冲突以契约 + design 包为准 |
| 对稿帧 | **`122:6`** 购买场次加油包 · 黄卡 SKU · 规则三条 · 「微信支付 ¥n」· 关闭（包内顶层 id 未出现；子层 `127:8738`/`127:8741`/`127:8748` 等正文齐全，同 TB-24/25 先例） |
| 日期 | 2026-11-07（Asia/Shanghai） |
| 合码 | **不合码**；仅辉当面「合」 |

---

## 三行留痕

- **结论**：**通过**（无条件）。帧 `122:6` 在权威 design 包可对稿（顶层 id 未出现，子层与全文齐全：半屏壳+遮罩+拖条 / 标题「购买场次加油包」+ `v2.0.0` 角标 / 黄卡「场次加油 · 5 场出题额度」+「非刷题包 · 购后 365 天 · 跨日不清零」+「¥6」 / 规则三条 / 蓝 CTA「微信支付 ¥6」 /「关闭」）；信息架构与 C 契约 §4–§5 + `skus?type=session_pack`/`orders`/`requestPayment` 一一可实现；H1–H13 / F1–F8 可钉死（**本页可支付**；半屏仍禁；金额以服务端为准；禁写死「5 场 ¥6」；入账 `session_pack`→`inventory` Lot；**不**调 `upgrade-quote`；会员页 `122:4` 仅入口导航、本刀不对稿）。
- **必改**：**无**
- **建议**：① 稿面「5 场 / ¥6 / 365 天」仅为对稿示意 → 生产一律 `GET /api/commerce/skus?type=session_pack`（`sessions`/`priceYuan|priceFen`/`inventoryExpireDays`），**禁**写死；② 稿面右上角 `v2.0.0` 角标为设计版本标 → **生产勿带**（同 TB-25）；③ 多 SKU 时须可点选，默认 `recommended=true` 否则 `sort_order` 第一；种子仅 1 条直接展示；④ CTA「微信支付 ¥{n}」跟选中应付 / 下单响应 `amountFen`；支付中 disabled + `clientIdempotencyKey` 防双单；⑤ 成功 toast「购买成功」+ 刷新 entitlement + `navigateBack`/关闭（E3）；⑥ 会员态弱提示「会员期内库存暂不扣」可工程自决（E1）；⑦ 稿面半屏视觉、路由页全屏等效均可（E2）。

---

## 前端可否开工

**可开工**（必改=0）。须按契约 §5 前端四件套 / H1–H13 / F1–F8 实现；本页允许 `POST /api/orders`（`orderKind=purchase`）+ `wx.requestPayment`（或 `WECHAT_PAY_MOCK` + mock-notify）；**不得**回退 TB-24 半屏禁支付边界；**不得**本刀对稿/改义会员页 `122:4`；金额以服务端为准；**不**调 `upgrade-quote`。合码仍等辉当面「合」。

---

## 1. 样式源与帧可达性

| 检查 | 结果 |
| --- | --- |
| design 包存在 | ✅ `index.html`（~227KB）+ `styles.css` + `svgs/`（外盘权威；本机副本：`/workspace/tb26-design-miniapp/` ≈ tb25 同源包） |
| 加油包正文 | ✅ 「购买场次加油包」+ 黄卡主/副/价 + 规则三条 +「微信支付 ¥6」+「关闭」齐全 |
| 顶层 `id=122:6` | ⚠️ 包内**无**字面 `122:6` / `122:2`；子层 `data-layer-id` 以 `127:87xx` 为主（如 `127:8738` 角标、`127:8741` 黄卡、`127:8748` 支付 CTA）；**内容齐全，可按「购买场次加油包」页对稿**，不阻塞（同 TB-24 `122:3` / TB-25 `122:4` 先例） |
| 半屏壳 | ✅ 遮罩 `rgba(17,27,56,0.6)`+blur；白底 `h-[464px]` 顶圆角 14；顶拖条灰条 |
| 黄卡 | ✅ `bg rgb(255,251,235)` + 边 `rgb(253,230,138)`；价色 `rgb(234,88,12)` |
| 支付 CTA | ✅ 蓝底 `rgb(37,99,235)`「微信支付 ¥6」；下方灰字「关闭」 |
| Bridge 副源 | 有则仅对照；**未**采为权威 |
| 禁源 | 本评审**未**采 design/dev-cache / figma-dev-cache / `get_design_context` |

---

## 2. 信息架构 / 挂载（§4 / §5）

| 面 / 组件（契约） | 设计 | 可实现 |
| --- | --- | --- |
| `SessionPackPage`（`pages/commerce/session-pack/index`） | 半屏视觉壳（遮罩+拖条+白底）；替换 TB-24/25 stub | ✅ 路由页全屏等效亦可（E2） |
| `SessionPackSkuCard` | 黄卡：场次/有效期/价/「非刷题包」 | ✅ 字段来自 API；禁写死 |
| `SessionPackSkuList`（可选） | 多 SKU 时列表+选中 | ✅ 默认 recommended |
| `SessionPackRules` | 三条规则说明 | ✅ 固定对稿文案在 |
| `SessionPackPayBar` | 「微信支付 ¥{n}」+「关闭」 | ✅ 本页可支付（H4）；金额随选中变 |
| `paySessionPack()` | 下单→requestPayment/mock→轮询→刷新 entitlement | ✅ 复用 C7；0 新 endpoint；**不**调 upgrade-quote |
| 非本刀帧 | `122:3`/`122:4`/`122:5`/`122:9` 等 | ✅ **不对稿验收**（§4.3）；`122:4` 仅导航来源 |

---

## 3. 逐帧

### 3.1 `122:6` · 购买场次加油包

| 设计控件/区（视觉自上而下） | 契约字段 / API | 对齐 |
| --- | --- | --- |
| 遮罩 + 半屏白壳 + 顶拖条 | 对稿视觉；关闭=`navigateBack` | ✅ |
| 标题「购买场次加油包」 | 固定 | ✅ |
| 角标「v2.0.0」 | 设计版本标 | ⚠️ 生产省略（建议） |
| 黄卡主标「场次加油 · {n} 场出题额度」 | `sessions` / `name` | ✅ **禁**写死 5 |
| 黄卡副标「非刷题包 · 购后 {d} 天 · 跨日不清零」 | `inventoryExpireDays`；H13 名词钉死 | ✅ **禁**写死 365 |
| 黄卡价「¥{n}」 | `priceYuan`/`priceFen` | ✅ **禁**写死 ¥6 |
| 规则「1 场 = 成功「AI 开始出题」进入答题页」 | 固定；对齐 TB-20 | ✅ |
| 规则「「再练这 N 道」不额外扣场」 | 固定 | ✅ |
| 规则「扣场顺序：日免 → 当日奖励 → 场次加油库存」 | 固定；本刀不改扣场序（H7） | ✅ |
| 主按钮「微信支付 ¥{n}」 | `{n}`←选中应付 / `amountFen` | ✅ 支付中 disabled |
| 「关闭」 | `navigateBack`；不建单 | ✅ |

**本页允许（设计有、实现须做）**：`POST /api/orders`（仅 `purchase`）+ `wx.requestPayment` / mock-notify；查单至 `paid`；刷新 `GET /api/me/entitlement`（`inventoryRemain`↑）；入账语义由 TB-23 grant（`source=session_pack` → inventory Lot）。

**本页禁面（设计无或须守）**：半屏内支付（TB-24）；写死价/场次/天数；客户端传 `amountFen` 改应付；调 `upgrade-quote` / `renew`/`upgrade`；新支付 endpoint；密钥真值；把加油包当刷题包售卖；广告/退款；改「我」大页/场次明细。

**同包邻接帧（勿扩范围）**：用尽半屏 `122:3`（已合）/ 会员定价 `122:4`（已合，仅入口）/「我」等（C11）/ 场次明细 `122:9`（C12）→ 本刀只导航或不对稿。

**偏差**：无阻塞。稿面价/场次/天数为示意；顶层 id 缺失不阻塞；稿面半屏 vs 独立页壳按 E2 自决。

---

## 4. 跨切检查（H1–H13 / F1–F8）

| # | 项 | 结论 |
| --- | --- | --- |
| H1 | 支付依赖复用 C7 + `WECHAT_PAY_MOCK` 可测 | ✅ UI 编排可钉；无平行 mock 契约 |
| H2 | 新 HTTP endpoint = 0 | ✅ 只消费 skus/orders/me/mock-notify；**不**调 upgrade-quote |
| H3 | 金额以服务端为准；禁写死「5 场 ¥6」 | ✅ CTA/黄卡跟 API |
| H4 | 本页允许支付；半屏仍禁 | ✅ 蓝 CTA 在；与 TB-24 划清 |
| H5 | 仅 `type=session_pack`+`enabled`；`orderKind=purchase` | ✅ |
| H6 | 履约入账 `inventory` Lot · `source=session_pack` | ✅ 服务端既有；本页刷新可见 |
| H7 | 不改四桶/订单机/密钥 | ✅ 本刀前端为主 |
| H8 | 会员可购不误扣 / 不禁购 | ✅ 行为约束（非画帧）；E1 弱文案可选 |
| H9 | 退款人工；本刀不调退款 | ✅ |
| H10 | 样式权威 design 包；禁 cache / `get_design_context` | ✅ 本评遵循 |
| H11 | 须本 UI 评审 | ✅ 本文 |
| H12 | 支付成功刷新 entitlement；toast+关闭/返回 | ✅ 行为约束 |
| H13 | 加油包≠刷题包；文案含「非刷题包」 | ✅ 副标在稿 |
| F1 | 半屏不调支付 | ✅ 本 PR 不得回退半屏 |
| F2 | 禁写死 ¥6 / 5 场 / 365 天 | ✅ |
| F3 | 客户端 `amountFen` 不影响应付 | ✅ |
| F4 | 对 pack 调 upgrade-quote / renew/upgrade | ✅ 仅 purchase |
| F5 | 无新 endpoint / 改 notify/grant | ✅ |
| F6 | 密钥真值入库 | ✅ 无 |
| F7 | 把加油包实现成刷题包数量售卖 | ✅ 文案/入账仅为 inventory |
| F8 | 广告 SDK / 退款 API / 未使用自动退 | ✅ 无 |
| — | 字段 ↔ skus / entitlement / orders | **无缺阻塞字段** |
| — | 设计↔契约冲突 | **无阻塞冲突**；价码/天数/角标按**契约**优先 |

---

## 5. 技术风险（非阻塞）

1. `paying|confirming` 须 UI 锁 + 建议 `clientIdempotencyKey`，防连点双单（§5.2）。
2. 用户取消微信支付 → 回 `ready`，不假装成功；订单可留 `prepay`。
3. `PAY_SKU_UNAVAILABLE` / `PAY_NOT_CONFIGURED` toast，不崩页。
4. 空目录（无 enabled pack）→ 友好空态；**不**造假卡、不写死种子。
5. 从 TB-24 半屏 CTA `pack` / TB-25 会员次入口进本页后，半屏代码路径仍不得出现 `requestPayment`。
6. 可复用 TB-25 membership-pay 的 C7 下单/轮询基建，**不得**误用 member upgrade/renew。
7. shared browser barrel **不**引入 `node:` / 商户私钥读取。
8. 可叠加购买：多单多 Lot；成功后 `inventoryRemain` 累加可测。

---

## 6. 分帧结论一行表

| 帧/面 | 结论 |
| --- | --- |
| `122:6` 购买场次加油包 | ✅ 通过 · 可对稿 · 字段↔skus/entitlement/orders 齐 · H1–H13/F1–F8 可钉 · **本页可支付** · 禁写死价 · `session_pack`→inventory |
| 黄卡 SKU | ✅ 通过 · 价/场次/有效期←API · 含「非刷题包」 |
| 规则三条 | ✅ 通过 · 固定对稿 · 对齐 TB-20 |
| 支付 CTA「微信支付 ¥{n}」 | ✅ 通过 · → C7 `requestPayment`/mock 路径可实现 · 不调 upgrade-quote |
| 「关闭」 | ✅ 通过 · navigateBack · 不建单 |
| 半屏边界 | ✅ 本刀不回退 TB-24 禁支付 |
| 会员页 `122:4` | ✅ 仅入口导航 · **不对稿** |

---

## 7. 落盘

| 位置 | 路径 |
| --- | --- |
| Box | `/workspace/tishuashua-tb26-ui-tech-review-20261107.md` |
| 外盘 arch | `/Volumes/My PSSD/notion_files/题刷刷/arch/UI 技术评审 · TB-26 小程序场次加油包（2026-11-07）.md` |
| 进仓约定 | `docs/delivery/tb26-ui-tech-review-20261107.md`（本任务副本在 `/workspace/docs-delivery-convention/`；**未 push**） |

---

*完 · TB-26 UI 技术评审 · 2026-11-07（Asia/Shanghai）· 前端可开工 · 不合码*
