# UI 技术评审 · TB-29 / C13 每日分享与邀请有礼（2026-11-07）

| 项 | 值 |
| --- | --- |
| 角色 | 架构师 Arch |
| 切片 | TB-29 / 看板 C13 |
| 契约 | `C 契约 · TB-29 … v0.1.0-C`（§6 对 UI / H1–H15 / F1–F8 / A1–A8） |
| 样式权威 | `design/小程序（商业化v2.0.0）/`（index.html + styles.css + svgs）；**禁** design/dev-cache / figma-dev-cache / `get_design_context` |
| 副源 | Bridge / `ai-quiz-commerce-v2/07-daily-share.png` · `08-invite.png` 仅对照；**未**采为权威；冲突以契约 + design 包为准 |
| 对稿帧 | **`122:8`** 每日分享领场 · **`122:10`** 邀请有礼（包内顶层 id 未出现；子层 `127:89xx` / `127:90xx` 正文齐全；SYNC_INDEX 映射「每日分享领场」→`127:8898`、「邀请有礼」→`127:9016`；导出 HTML 未挂该字面根 id，**内容齐全可对稿**，同 TB-24–28 先例） |
| 签到 | 无独立必评帧；Me 既有签到壳接线（契约 §6.1） |
| 日期 | 2026-11-07（Asia/Shanghai） |
| 合码 | **不合码**；仅辉当面「合」 |
| design 包 md5 | `index.html` = `522993188277e4e4d1bffeb7e75d2d1e`（外盘权威 = box 副本同源） |

---

## 三行留痕

- **结论**：**通过**（无条件）。帧 `122:8` / `122:10` 在权威 design 包可对稿（顶层 id 未出现，子层与全文齐全：分享页标题「每日分享领场」+ 英雄卡「分享给好友，打开后领 +1 场」+「与朋友圈共用每日额度」+ 领取规则 1–5 + 今日状态「未领取 · 等待好友打开」+ 主 CTA「分享给微信好友」+ 次 CTA「分享到朋友圈」；邀请页标题「邀请有礼」+「我的邀请码」+ 奖励一览（注册/首刷双列）+ 邀请人封顶进度 + 脚注一人一邀请人/待发放/跨日库存 + 主 CTA「分享邀请海报 / 链接」）；信息架构与 C 契约 §6 + growth* API（`GET /api/me/growth` · checkin · share/token · share/open · invite/bind）一一可实现；H1–H15 / F1–F8 可钉死（**本页禁支付**；奖额/封顶←growthConfig 禁写死；会员分享不发场；入账走 grantEntitlement；pending 只写不自动解；不越权改 TB-27「我」壳 / TB-28 ledger UI）。
- **必改**：**无**
- **建议**：① **E1 文案**：稿面规则第 4 条「会员不限场时，默认改发『提炼次 +1』」→ 生产跟 PRD/H11 改为「会员不限场时不另发场次/提炼次，展示今日已享会员不限场」；`memberRefineBonus` runtime 忽略；② 稿面「+1 场」「日封顶 6 · 周封顶 15」「今日已获 2/6 · 本周 5/15」「TS-HU8」及奖励表 ±N **均为示意** → 一律 `GET /api/me/growth`（rewardSessions / caps / code / rewards.*），**禁**写死；③ 右上角 `v2.0.0` 角标 → **生产勿带**（同 TB-25–28）；④ 今日状态四态工程实现：未领 / 等待打开 / 已领 / 会员跳过（`memberSkip` + statusText）；空点分享不发奖、勿客户端伪造已领；⑤ Me 签到接线 `POST …/checkin`；会员 Me 稿「已领 提炼次 +1」**勿照抄入账**——跟 H7 入 `daily_task`（数量←config）；会员是否展示签到成功态以 entitlement/growth 为准；⑥ `tasks/index` stub → 聚合入口链到 daily-share / invite（或 redirect），禁留空 stub；⑦ 未登录：拉 growth/分享前走既有登录；冷启动 `shareToken`/`inviteCode` 登录后再 open/bind；⑧ 封顶达限：进度条/文案跟 API；超限进 pending 时 UI 可提示「待发放/人工审核」，**禁**客户端自动解；⑨ Bridge PNG 仅副源；禁 cache / `get_design_context`。

---

## 前端可否开工

**可开工**（必改=0）。须按契约 §6 前端四件套 / H1–H15 / F1–F8 实现；新建 `pages/commerce/daily-share/index`（122:8）与 `pages/commerce/invite/index`（122:10）；Me 签到 CTA 接线；tasks stub 改入口聚合；主数据 `GET /api/me/growth` + checkin / share/token / share/open / invite/bind；**禁止** daily-share / invite / tasks 树 `wx.requestPayment` / `POST /api/orders` / mock-notify / admin|dev grant；购买入口（若有）仅 `navigateTo` TB-25/26（本两帧 design **无**支付 CTA）；**不对稿** `122:9` 明细重写。合码仍等辉当面「合」。写码以 Owner 已点全栈为准；本评审只放行前端对稿门禁。

---

## 1. 样式源与帧可达性

| 检查 | 结果 |
| --- | --- |
| design 包存在 | ✅ 外盘 `design/小程序（商业化v2.0.0）/`（index.html md5 `522993188277e4e4d1bffeb7e75d2d1e` + styles.css + svgs/）；本机同源副本：`/workspace/tb28-design-miniapp/`（与 TB-25–28 同包） |
| 正文 `122:8` | ✅ 「每日分享领场」+ 英雄卡 + 领取规则 + 今日状态 + 双分享 CTA |
| 正文 `122:10` | ✅ 「邀请有礼」+ 邀请码卡 + 奖励一览 + 封顶进度 + 脚注 + 海报/链接 CTA |
| 顶层 `id=122:8` / `122:10` | ⚠️ 包内**无**字面；子层分享以 `127:8910`/`127:8920`/`127:8923`/`127:8926`/`127:8928` 等为主；邀请以 `127:9028`/`127:9033`/`127:9047`/`127:9052` 等为主；SYNC_INDEX 标 `127:8898` / `127:9016`（导出 HTML 未挂该字面根 id，**内容齐全可对稿**，不阻塞） |
| 支付 CTA（本两帧） | ✅ **design 无**开通/支付/¥/下单条（已对帧块 grep 0 hit） |
| 空态/已领/会员跳过 | ⚠️ design 主示意「未领取 · 等待好友打开」；其余态工程自补，**不阻塞** |
| Bridge 副源 | `07-daily-share.png` / `08-invite.png` 仅对照；**未**采为权威 |
| 禁源 | 本评审**未**采 design/dev-cache / figma-dev-cache / `get_design_context` |

---

## 2. 信息架构 / 挂载（§6）

| 面 / 组件（契约） | 设计 | 可实现 |
| --- | --- | --- |
| `DailySharePage` | 单页：英雄卡 + 规则 + 状态 + 双 CTA | ✅ 路由 `pages/commerce/daily-share/index`；token + 微信分享 |
| `InvitePage` | 单页：码卡 + 奖励表 + 封顶 + CTA + 脚注 | ✅ 路由 `pages/commerce/invite/index` |
| `TasksHub`（可选） | tasks stub → 两行链分享/邀请 | ✅ §6.2 |
| Me checkin wiring | 既有签到壳 → `POST …/checkin` | ✅ 无独立必评帧 |
| 支付 | 两帧均无支付条 | ✅ **本页禁支付**（H4） |
| 非本刀帧 | `122:9` 明细已合只读；`122:5/11/7` 入口已合 | ✅ **不对稿重写** |

---

## 3. 逐帧

### 3.1 `122:8` · 每日分享领场

| 设计控件/区 | 契约字段 / API | 对齐 |
| --- | --- | --- |
| 导航「每日分享领场」+ 返回 | `pages/commerce/daily-share/index` | ✅ 新建 |
| 英雄卡「分享给好友，打开后领 +1 场」 | `share.rewardSessions` ← growth | ✅ **禁**写死「+1」 |
| 「与朋友圈共用每日额度 · 今日未领」 | H10 共用日额度；`share.claimed` / statusText | ✅ |
| 领取规则 1–5 | 规则说明；第 4 条见 E1 | ✅ 工程改文案跟 PRD |
| 今日状态「未领取 · 等待好友打开」 | `share.claimed` / open 流程 / memberSkip | ✅ 四态可工程实现 |
| 主 CTA「分享给微信好友」 | `POST …/share/token` → 微信分享 path+token | ✅ |
| 次 CTA「分享到朋友圈」 | 同日额度；朋友圈分享 | ✅ H10 |
| 会员跳过 | H11：不发场、不发提炼次 | ✅ 文案跟契约（E1） |
| `v2.0.0` 角标 | 设计版本标 | ✅ **生产勿带** |
| 支付/下单 | **无** | ✅ H4 / F1 |

**本页禁面**：`requestPayment` / `POST /api/orders` / mock-notify / upgrade-quote / admin|dev grant；写死奖额；空点分享客户端伪造已领；会员改发提炼次入账。

**偏差**：无阻塞。顶层 id 缺失不阻塞；规则第 4 条旧文案 → **契约优先**（建议①）；多状态帧未全出 → 工程自补。

### 3.2 `122:10` · 邀请有礼

| 设计控件/区 | 契约字段 / API | 对齐 |
| --- | --- | --- |
| 导航「邀请有礼」+ 返回 | `pages/commerce/invite/index` | ✅ 新建 |
| 「邀请好友一起刷题」+「我的邀请码 TS-HU8」 | `invite.code` | ✅ **禁**写死码 |
| 奖励一览：完成注册 +1/+1；首刷交卷 +3/+2 | `invite.rewards.*` ← config | ✅ **禁**写死 |
| 邀请人封顶「日 6 · 周 15」+「今日已获 2/6 · 本周 5/15」 | `dailyUsed/Cap` · `weeklyUsed/Cap` | ✅ |
| 脚注：一人一邀请人 / 待发放 / 库存跨日 | H9 · pending · inventory | ✅ |
| 主 CTA「分享邀请海报 / 链接」 | 带 inviteCode 的分享 path | ✅ |
| `v2.0.0` 角标 | 设计版本标 | ✅ **生产勿带** |
| 支付/下单 | **无** | ✅ H4 / F1 |

**本页禁面**：支付/下单；写死封顶与奖额；自邀 UI 绕过；pending 自动解；改 TB-28 明细。

**偏差**：无阻塞。示意数字/邀请码跟 API。

### 3.3 签到 · 支付 · 边界（非独立对稿帧）

| 面 | 结论 |
| --- | --- |
| 签到 | Me 壳已有（非会员「+1 场」/ 会员稿「提炼次」示意）→ 本刀接线 checkin；入账 `daily_task`+`task_grant`；幂等已签；**勿**照抄会员提炼次入账 |
| 支付边界 | 122:8/122:10 **无**支付 CTA；半屏禁支付不回退；购买仅导航 TB-25/26 |
| TB-27 | 入口+签到壳保留；不回改「我」三态主语义与禁支付 |
| TB-28 | 分录只读；本刀 grant 后自然出现；不做明细 UI |
| pending | 只写；UI 可展示待发放提示；**禁**自动解 |

### 3.4 同包邻接帧（勿扩范围）

| 帧 | 归属 |
| --- | --- |
| `122:5` / `122:11` / `122:7` | C11 已合（Me 入口） |
| `122:9` | C12 已合（明细只读；不对稿重写） |
| `122:4` / `122:6` | C9/C10 已合（可选导航） |
| `122:3` | C8 半屏已合；禁支付不回退 |
| `122:8` / `122:10` | **本刀必评** |

---

## 4. 跨切检查（H1–H15 / F1–F8）

| # | 项 | 结论 |
| --- | --- | --- |
| H1 | 增长发奖 runtime + 分享/邀请对稿 | ✅ 设计覆盖 122:8/10；签到接线 Me |
| H2 | 入账唯一 `grantEntitlement` | ✅ UI 只调 growth*；不直改余额 |
| H3 | 配置源 growthConfig；禁写死 | ✅ 稿面数字=示意 |
| H4 | 本页禁止支付 | ✅ 两帧无支付条 |
| H5 | 与 TB-27：接线不回改禁支付 | ✅ |
| H6 | 与 TB-28：不做明细 UI | ✅ |
| H7 | 签到/分享→daily_task；拉新→inventory | ✅ UI 文案「场」跟桶语义 |
| H8 | 幂等键；已领态 | ✅ 状态卡可展示 |
| H9 | 一人一邀请人；禁自邀；封顶→pending | ✅ 脚注+封顶卡 |
| H10 | 分享日 1 次；须打开；朋友圈共用 | ✅ 规则+双 CTA |
| H11 | 会员分享不发场/不发提炼次 | ✅ E1 改文案；建议① |
| H12 | 样式权威 design 包；禁 cache | ✅ 本评遵循 |
| H13 | 新 growth HTTP；禁 dev/admin grant 冒充 | ✅ UI 映射 §2 |
| H14 | 须本 UI 评审后方可前端开工 | ✅ 本文 |
| H15 | 禁密钥真值；分享仅业务 token | ✅ |
| F1 | 分享/邀请/tasks 无支付 | ✅ 可 grep |
| F2 | 禁写死奖额/封顶 | ✅ |
| F3 | 不绕过 grantEntitlement | ✅ |
| F4 | pending 不自动发奖 | ✅ |
| F5 | 不实现 122:9 / 不回改 Me 三态主逻辑 | ✅ |
| F6 | 不用 /api/dev/entitlement/grant | ✅ |
| F7 | 半屏禁支付锁仍在 | ✅ 本刀不碰半屏支付 |
| F8 | 无广告 SDK / 金币 | ✅ |
| — | 字段 ↔ growth* | **无缺阻塞字段**（多状态工程补） |
| — | 设计↔契约冲突 | **无阻塞冲突**；E1 会员提炼文案按**契约/PRD**优先 |

---

## 5. UI ↔ growth* 动作映射

| UI 动作 | API | 备注 |
| --- | --- | --- |
| 进分享/邀请页 / Me 刷新任务态 | `GET /api/me/growth` | 奖额·封顶·状态·邀请码 |
| Me 点签到 | `POST /api/me/growth/checkin` | 幂等；刷新 entitlement |
| 点「分享给好友/朋友圈」 | `POST …/share/token` → 微信分享 | 空点不发奖 |
| 被分享者冷启动 | 登录后 `POST …/share/open` | 给 sharer 发奖 |
| 新用户带码进入 | 登录后 `POST …/invite/bind` | inviteCode 推荐 |
| 首刷奖 | 交卷钩子（无独立 UI） | 非本页按钮 |
| 达封顶 | growth 返回 pending/进度 | UI 只展示；不自动解 |

---

## 6. 技术风险（非阻塞）

1. E1：稿面「改发提炼次」若照抄 → 违反 H11；实现必须以契约文案为准。
2. 示意「+1 / 6 / 15 / TS-HU8」照抄 → 违反 F2；一律 API。
3. 微信分享失败/用户取消 → 保持未领态；勿乐观写已领。
4. 冷启动参数丢失 → open/bind 失败要可提示；勿静默吞。
5. 会员进分享页：CTA 可仍允许分享传播，但状态区须 `memberSkip` 文案，且服务端不发奖。
6. tasks stub 若残留空页 → 误导；本刀须改聚合或 redirect。
7. 勿在 daily-share/invite 树「顺手」引入支付。
8. shared browser barrel **不**引入 `node:` / 商户私钥读取。

---

## 7. 分帧结论一行表

| 帧/面 | 结论 |
| --- | --- |
| `122:8` 每日分享 | ✅ 通过 · 可对稿 · 规则+状态+双 CTA · 字段↔growth.share · **禁支付** · E1 文案跟契约 |
| `122:10` 邀请有礼 | ✅ 通过 · 可对稿 · 码+奖励表+封顶+脚注+CTA · 字段↔growth.invite · **禁支付** |
| 签到（Me 接线） | ✅ 通过 · 无独立必评帧 · checkin 可实现 · 勿照抄会员提炼次入账 |
| 支付边界 | ✅ 本两帧禁支付 · 半屏禁支付不回退 · CTA 仅分享/邀请 |
| TB-27 边界 | ✅ 入口/签到壳保留 · 接线不回改三态主语义 |
| TB-28 边界 | ✅ 分录只读 · 本刀不做明细 UI |
| pending | ✅ 只写不自动解 · UI 可提示待发放 |
| `TasksHub` | ✅ stub→聚合入口 · 禁空 stub |

---

## 8. 落盘

| 位置 | 路径 |
| --- | --- |
| Box | `/workspace/tishuashua-tb29-ui-tech-review-20261107.md` |
| 外盘 arch | `/Volumes/My PSSD/notion_files/题刷刷/arch/UI 技术评审 · TB-29 每日分享与邀请有礼（2026-11-07）.md` |
| 进仓约定 | `docs/delivery/tb29-ui-tech-review-20261107.md`（本任务副本在 `/workspace/docs-delivery-convention/`；**未 push**） |

---

*完 · TB-29 UI 技术评审 · 2026-11-07（Asia/Shanghai）· 前端可开工 · 不合码 · 未发用户 · 未广播*
