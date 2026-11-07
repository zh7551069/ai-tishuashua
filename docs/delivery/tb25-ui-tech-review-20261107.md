# UI 技术评审 · TB-25 / C9 小程序会员定价（2026-11-07）

| 项 | 值 |
| --- | --- |
| 角色 | 架构师 Arch |
| 切片 | TB-25 / 看板 C9 |
| 契约 | `C 契约 · TB-25 … v0.1.0-C`（§5 前端四件套 / §4 对 UI / H1–H12 / F1–F8） |
| 样式权威 | `design/小程序（商业化v2.0.0）/`（index.html + styles.css + svgs）；**禁** design/dev-cache / figma-dev-cache / `get_design_context` |
| 副源 | Bridge / `ai-quiz-commerce-v2` 截图仅对照；**未**采为权威；冲突以契约 + design 包为准 |
| 对稿帧 | **`122:4`** 开通会员 · 周/月/季/年 · 默认推荐月卡 · 底栏确认协议并支付（包内顶层 id 未出现；子层 `127:85xx`/`127:86xx` 正文齐全，同 TB-24 先例） |
| 日期 | 2026-11-07（Asia/Shanghai） |
| 合码 | **不合码**；仅辉当面「合」 |

---

## 三行留痕

- **结论**：**通过**（无条件）。帧 `122:4` 在权威 design 包可对稿（顶层 id 未出现，子层与全文齐全：导航「开通会员」/ Hero「题刷刷会员」+权益摘要+底注 / 三利益 chip / 四周月季年 SKU +「推荐」角标与月卡选中蓝描边 / 规则卡 / 加油包次入口 / 底栏「微信支付 · 开通后立即生效」+「确认协议并支付 ¥28」）；信息架构与 C 契约 §4–§5 + `skus`/`orders`/`upgrade-quote`/`requestPayment` 一一可实现；H1–H12 / F1–F8 可钉死（**本页可支付**；半屏仍禁；金额以服务端为准；禁写死价；加油包仅导航 C10）。
- **必改**：**无**
- **建议**：① 稿面 ¥12/28/68/198、「5 场 ¥6」仅为对稿示意 → 生产一律 `GET /api/commerce/skus`（member / 可选 session_pack enrich），**禁**写死；② 稿面右上角 `v2.0.0` 角标为设计版本标 → **生产勿带**；③ 稿无强制协议 checkbox（仅按钮文案「确认协议」）→ 按契约 O5，可链既有 `pages/legal/terms`，不另造阻塞弹层；④ 升级场景 CTA 金额跟 `upgrade-quote.payFen`，首购/续费跟选中 SKU `priceYuan`/`amountFen`；⑤ 支付中 disabled + `clientIdempotencyKey` 防双单；⑥ 月均「约 ¥x/月」客户端近似即可（E2）。

---

## 前端可否开工

**可开工**（必改=0）。须按契约 §5 前端四件套 / H1–H12 / F1–F8 实现；本页允许 `POST /api/orders` + `wx.requestPayment`（或 `WECHAT_PAY_MOCK` + mock-notify）；**不得**回退 TB-24 半屏禁支付边界；**不得**本页完成加油包支付；金额以服务端为准。合码仍等辉当面「合」。

---

## 1. 样式源与帧可达性

| 检查 | 结果 |
| --- | --- |
| design 包存在 | ✅ `index.html`（~225KB）+ `styles.css` + `svgs/`（外盘权威；本机副本：`/workspace/tb25-design-miniapp/`） |
| 会员定价正文 | ✅ 「开通会员」+「题刷刷会员」+ 三 chip + 周/月/季/年 +「推荐」+ 规则卡 +「场次加油包 5 场 ¥6」+「确认协议并支付 ¥28」+「微信支付 · 开通后立即生效」齐全 |
| 顶层 `id=122:4` | ⚠️ 包内**无**字面 `122:4` / `122:2`；子层 `data-layer-id` 以 `127:85xx`/`127:86xx` 为主（如 `127:8588` 推荐角标、`127:8614` 底栏）；**内容齐全，可按会员定价页对稿**，不阻塞（同 TB-24 `122:3` 先例） |
| 选中态 | ✅ 月卡区蓝描边 `rgb(37,99,235)` +「推荐」蓝角标；对齐 H8 默认 recommended |
| 底栏支付条 | ✅ 白底 `h-[96px]` 底栏 + 主 CTA「确认协议并支付 ¥28」+ 副标「微信支付 · 开通后立即生效」 |
| 协议勾选 | ✅ 稿**无** checkbox；仅 CTA 文案含「确认协议」→ 对齐契约 O5 |
| Bridge 副源 | 有 commerce 截图对照；**未**采为权威 |
| 禁源 | 本评审**未**采 design/dev-cache / figma-dev-cache / `get_design_context` |

---

## 2. 信息架构 / 挂载（§4 / §5）

| 面 / 组件（契约） | 设计 | 可实现 |
| --- | --- | --- |
| `MemberPricingPage`（`pages/commerce/member/index`） | 整页 390×844 画板；替换 TB-24 stub | ✅ |
| `MemberHeroCard` | 蓝卡「题刷刷会员」+ 副文案 + 底注 | ✅ 固定文案对稿 |
| `MemberBenefitChips` | 三枚 chip | ✅ |
| `MemberSkuList` / `MemberSkuRow` | 周/月/季/年 + 推荐角标 + 选中勾 | ✅ 价来自 skus；缺档不造假卡 |
| `MemberRulesCard` | 升级/续费两条 | ✅ 固定文案 |
| `SessionPackEntryRow` | 「场次加油包 5 场 ¥6（非刷题包）」 | ✅ 仅 `navigateTo` C10；本页无 pack 下单 |
| `MemberPayBar` | 底栏支付说明 + 主 CTA | ✅ 本页可支付（H4）；金额随选中/询价变 |
| `payMembership()` | 询价→下单→requestPayment/mock→轮询→刷新 | ✅ 复用 C7；0 新 endpoint |
| 非本刀帧 | `122:3`/`122:6`/`122:5` 等 | ✅ **不对稿验收**（§4.3） |

---

## 3. 逐帧

### 3.1 `122:4` · 会员定价页（开通会员）

| 设计控件/区（视觉自上而下） | 契约字段 / API | 对齐 |
| --- | --- | --- |
| 导航「开通会员」+ 返回 | 固定；`navigateBack` | ✅ |
| 角标「v2.0.0」 | 设计版本标 | ⚠️ 生产省略（建议） |
| Hero「题刷刷会员」 | 固定对稿 | ✅ |
| Hero 副文案「不限场次 · 会员提炼不限 · AI 点评不限」 | 固定 | ✅ |
| Hero 底注「免费上传提炼终身仅 1 次 · 会员期内提炼不限次」 | 固定；对齐 PRD | ✅ |
| Chip：不限 AI 出题场次 / 会员提炼不限 / AI 点评摘要不限 | 固定三枚 | ✅ |
| 周卡 ¥12「灵活尝鲜」 | `member_week`；价←API | ✅ 禁写死生产价 |
| 月卡 ¥28「最受欢迎」+「推荐」 | `member_month`；`recommended`；**默认选中** | ✅ 蓝描边选中态 |
| 季卡 ¥68「约 ¥22.7/月」 | `member_quarter`；月均可客户端算 | ✅ |
| 年卡 ¥198「约 ¥16.5/月」 | `member_year`；月均=价/12 | ✅ |
| 规则「升级可补差价 · 不支持降级」 | 固定；降级禁 H5/F4 | ✅ |
| 规则「续费延长到期日 · 会员不受日免场次限制」 | 固定 | ✅ |
| 次入口「场次加油包 5 场 ¥6（非刷题包）」 | 导航 C10；价可 skus enrich | ✅ F7 本页不支付 pack |
| 底栏副标「微信支付 · 开通后立即生效」 | 固定 | ✅ |
| 主按钮「确认协议并支付 ¥{n}」 | `{n}`←选中应付 / upgrade `payFen` | ✅ 支付中 disabled |

**本页允许（设计有、实现须做）**：`POST /api/orders` + `wx.requestPayment` / mock-notify；查单至 `paid`；刷新 `GET /api/me/entitlement`。

**本页禁面（设计无或须守）**：半屏内支付（TB-24）；本页加油包下单；写死价；客户端传 `amountFen` 改应付；降级建单；广告/退款；新支付 endpoint；密钥真值。

**同包邻接帧（勿扩范围）**：用尽半屏 `122:3`（已合）/ 加油包 `122:6`（C10）/「我」等（C11）→ 本刀只导航或不对稿。

**偏差**：无阻塞。稿面价为示意；无强制 checkbox → 按契约；顶层 id 缺失不阻塞。

---

## 4. 跨切检查（H1–H12 / F1–F8）

| # | 项 | 结论 |
| --- | --- | --- |
| H1 | 支付依赖复用 C7 + `WECHAT_PAY_MOCK` 可测 | ✅ UI 编排可钉；无平行 mock 契约 |
| H2 | 新 HTTP endpoint = 0 | ✅ 只消费既有 skus/orders/quote/me |
| H3 | 金额以服务端为准 | ✅ CTA 跟 API；禁信任本地写死 |
| H4 | 本页允许支付；半屏仍禁 | ✅ 底栏有支付条；与 TB-24 划清 |
| H5 | 会员降级禁止 | ✅ 规则卡有文案；实现须预拦/吃 `PAY_DOWNGRADE_FORBIDDEN` |
| H6 | 不改四桶/订单机/密钥 | ✅ 本刀前端为主 |
| H7 | 仅 `type=member`+`enabled`；禁生产写死试用价 | ✅ |
| H8 | 默认选中 `recommended`（稿面月卡） | ✅ 「推荐」+ 选中态在月卡 |
| H9 | 样式权威 design 包；禁 cache / `get_design_context` | ✅ 本评遵循 |
| H10 | 须本 UI 评审 | ✅ 本文 |
| H11 | 加油包入口仅导航 C10 | ✅ |
| H12 | 支付成功刷新 entitlement；toast+back | ✅ 行为约束（非画帧） |
| F1 | 半屏不调支付 | ✅ 本 PR 不得回退半屏 |
| F2 | 禁写死 ¥12/28/68/198 | ✅ |
| F3 | 客户端 `amountFen` 不影响应付 | ✅ |
| F4 | 降级可支付 | ✅ 必须被拦 |
| F5 | 无新 endpoint / 改 notify/grant | ✅ |
| F6 | 密钥真值入库 | ✅ 无 |
| F7 | 本页完成加油包支付 | ✅ 仅 navigate |
| F8 | 广告 SDK / 退款 API | ✅ 无 |
| — | 字段 ↔ skus / entitlement / orders | **无缺阻塞字段** |
| — | 设计↔契约冲突 | **无阻塞冲突**；价码/角标/协议勾选按**契约**优先 |

---

## 5. 技术风险（非阻塞）

1. `paying|confirming` 须 UI 锁 + 建议 `clientIdempotencyKey`，防连点双单（§5.2）。
2. 用户取消微信支付 → 回 `ready`，不假装成功；订单可留 `prepay`。
3. `PAY_NOT_CONFIGURED` toast「支付暂不可用」，不崩页。
4. 升级路径：先 `upgrade-quote` 再下单；CTA 展示差价。
5. 从 TB-24 半屏 CTA `member` 进本页后，半屏代码路径仍不得出现 `requestPayment`。
6. shared browser barrel **不**引入 `node:` / 商户私钥读取。
7. 缺档 SKU：API 未返回则不造假卡（§1.1）。

---

## 6. 分帧结论一行表

| 帧/面 | 结论 |
| --- | --- |
| `122:4` 会员定价页 | ✅ 通过 · 可对稿 · 字段↔skus/entitlement/orders/quote 齐 · H1–H12/F1–F8 可钉 · **本页可支付** · 禁写死价 |
| 底栏支付 CTA | ✅ 通过 · → C7 `requestPayment`/mock 路径可实现 |
| 加油包次入口 | ✅ 通过 · 仅导航 C10 · **不对稿** `122:6` |
| 协议 | ✅ 通过（稿无 checkbox → 按契约 O5，非缺关键帧） |
| 半屏边界 | ✅ 本刀不回退 TB-24 禁支付 |

---

## 7. 落盘

| 位置 | 路径 |
| --- | --- |
| Box | `/workspace/tishuashua-tb25-ui-tech-review-20261107.md` |
| 外盘 arch | `/Volumes/My PSSD/notion_files/题刷刷/arch/UI 技术评审 · TB-25 小程序会员定价（2026-11-07）.md` |
| 进仓约定 | 合码 PR 可附 `docs/delivery/tb25-ui-tech-review-20261107.md`（本任务不 push） |

---

*完 · TB-25 UI 技术评审 · 2026-11-07（Asia/Shanghai）· 前端可开工 · 不合码*
