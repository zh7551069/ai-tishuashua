# UI 技术评审 · TB-28 / C12 小程序场次明细（2026-11-07）

| 项 | 值 |
| --- | --- |
| 角色 | 架构师 Arch |
| 切片 | TB-28 / 看板 C12 |
| 契约 | `C 契约 · TB-28 … v0.1.0-C`（§5 前端四件套 / §4 对 UI / H1–H13 / F1–F8） |
| 样式权威 | `design/小程序（商业化v2.0.0）/`（index.html + styles.css + svgs）；**禁** design/dev-cache / figma-dev-cache / `get_design_context` |
| 副源 | Bridge / `ai-quiz-commerce-v2/06-session-ledger.png` 仅对照；**未**采为权威；冲突以契约 + design 包为准 |
| 对稿帧 | **`122:9`** 场次明细（包内顶层 id 未出现；子层 `127:89xx` 正文齐全：`127:8942` 标题、`127:8944` 顶卡、`127:8953/8955/8957` Tab、`127:8968+` 流水行；SYNC_INDEX 映射「场次明细」→`127:8932`；同 TB-24–27 先例） |
| 日期 | 2026-11-07（Asia/Shanghai） |
| 合码 | **不合码**；仅辉当面「合」 |

---

## 三行留痕

- **结论**：**通过**（无条件）。帧 `122:9` 在权威 design 包可对稿（顶层 id 未出现，子层与全文齐全：顶卡「当前可用」大数字 + 副文「日免已用完 · 含场次加油库存 {n}」+「今日消耗」+「次日 00:00 日免重置」/ Tab「全部 · 获得 · 消耗」/ 流水行获得绿标·消耗红标 + ±场次 + 时间；稿面示意行含日免发放、签到奖励、加油包入账、AI 出题消耗、邀请/分享等）；信息架构与 C 契约 §4–§5 + `GET /api/me/entitlement` + `GET /api/me/entitlement/ledger` 一一可实现；H1–H13 / F1–F8 可钉死（**同路由替换 stub `pages/commerce/session-ledger/index`**；**本页禁支付**；0 新 endpoint；数字←服务端禁写死；C13 分录只读；TB-27 仅入口）。
- **必改**：**无**
- **建议**：① 稿面「当前可用 3」「今日消耗 2」「库存 3」「±N 场」及行时间仅为对稿示意 → 生产一律 entitlement.balances / ledger.items，**禁**写死；② 稿面右上角 `v2.0.0` 角标 → **生产勿带**（同 TB-25/26/27）；③ 消耗行「· FDE · 20 题」属 E5，ledger 现无证/题数 → **本刀短标题「AI 出题」即可**，勿为此新开 endpoint；④ `task_grant` 无细分字段时统一「任务奖励」（E4）；邀请/分享行若已入账只读展示，**勿**本刀 grant；⑤ Tab 默认客户端过滤已加载页（E1）；`delta===0` 会员场归「全部」（E2）；⑥ `useDidShow`/进页并行拉 entitlement+ledger；失败 ErrorBlock+重试，**不伪造流水**；⑦ 会员 `active` → 顶卡不限场文案（H12），勿用三桶之和冒充剩余；⑧ 空态 design 未单独出帧 → 工程自补明确空态即可。

---

## 前端可否开工

**可开工**（必改=0）。须按契约 §5 前端四件套 / H1–H13 / F1–F8 实现；替换既有 `pages/commerce/session-ledger/index` stub 为 `122:9` 真页（**不另开第二路由**）；主数据 `GET /api/me/entitlement` + `GET /api/me/entitlement/ledger`；**禁止** session-ledger 树 `wx.requestPayment` / `POST /api/orders` / mock-notify / upgrade-quote / grant；若有购买入口仅 `navigateTo` TB-25/26（稿面本页无支付 CTA）；**不对稿** `122:8`/`122:10`（C13）。合码仍等辉当面「合」。写码仍等 Owner 点全栈（本评审只放行前端对稿门禁；Owner 已点全栈则以 Owner 为准）。

---

## 1. 样式源与帧可达性

| 检查 | 结果 |
| --- | --- |
| design 包存在 | ✅ `index.html`（~227KB，md5 `522993188277e4e4d1bffeb7e75d2d1e`）+ `styles.css` + `svgs/`（外盘权威；本机副本：`/workspace/tb28-design-miniapp/`，与 TB-25/26/27 同源包） |
| 正文 `122:9` | ✅ 「场次明细」标题 + 顶卡「当前可用 / 今日消耗」+ Tab 全部/获得/消耗 + 流水列表示意（日免发放 / 签到 / 加油包 / AI 出题 / 邀请·分享等） |
| 顶层 `id=122:9` | ⚠️ 包内**无**字面 `122:9`；子层以 `127:89xx` 为主（标题 `127:8942`、顶卡 `127:8944`、Tab `127:8953` 全部 / `127:8955` 获得 / `127:8957` 消耗、行簇 `127:8968+`）；SYNC_INDEX 标「场次明细」→`127:8932`（导出 HTML 未挂该字面 id，**内容齐全可对稿**，不阻塞，同 TB-24–27 先例） |
| 顶卡视觉 | ✅ 白底圆角卡；「当前可用」大数字蓝字；「今日消耗」黑字；灰副文 |
| Tab 视觉 | ✅ 选中蓝底白字 pill；未选白底灰边 |
| 行视觉 | ✅ 获得浅绿标 + 绿 `+N 场`；消耗浅红标 + 红 `−N 场`；右下时间灰字 |
| 支付 CTA | ✅ **本页 design 无**开通/支付/¥/下单条 |
| 空态 | ⚠️ design **未**单独出空态帧；契约 A6 要求明确空态 → 工程自补，**不阻塞** |
| Bridge 副源 | `06-session-ledger.png` 仅对照；**未**采为权威 |
| 禁源 | 本评审**未**采 design/dev-cache / figma-dev-cache / `get_design_context` |

---

## 2. 信息架构 / 挂载（§4 / §5）

| 面 / 组件（契约） | 设计 | 可实现 |
| --- | --- | --- |
| `SessionLedgerPage` | 单页：顶卡 + Tab + 列表；替换 stub | ✅ H1；进页双请求 |
| `LedgerAvailabilityCard` | 「当前可用」+ 副文；旁「今日消耗」 | ✅ 数字←API；会员不限场（H12） |
| `LedgerFilterTabs` | 全部 / 获得 / 消耗 | ✅ H9 |
| `LedgerList` | 行 + 空态 + cursor 续拉 | ✅ H8；空态工程补 |
| `LedgerRow` | reason 映射 + ± 符号 + 时间 | ✅ H13；E5 短标题 |
| 支付 | 设计无支付条 | ✅ **本页禁支付**（H4） |
| 非本刀帧 | `122:8`/`122:10` 分享/邀请深页；`122:5/11/7` 已合入口 | ✅ **不对稿验收** |

---

## 3. 逐帧

### 3.1 `122:9` · 场次明细

| 设计控件/区 | 契约字段 / API | 对齐 |
| --- | --- | --- |
| 导航「场次明细」+ 返回 | 路由 `pages/commerce/session-ledger/index` | ✅ 替换 TB-27 stub |
| 顶卡「当前可用」大数字 | 非会员=`dailyFreeRemain+dailyTaskRemain+inventoryRemain`；会员=不限场文案 | ✅ **禁**写死「3」；H12 |
| 副文「日免已用完 · 含场次加油库存 {n}」 | `balances.*` / `inventoryRemain` | ✅ 示意「库存 3」跟 API |
| 「今日消耗」+「次日 00:00 日免重置」 | 当日 `bizDate===businessDate` 且 `delta<0` 合计（E3） | ✅ **禁**写死「2」 |
| Tab「全部 / 获得 / 消耗」 | `all` / `delta>0` / `delta<0`（H9） | ✅ |
| 行「日免额度发放」+2 | `reason=daily_grant` | ✅ §4.3 |
| 行「每日签到奖励」+1 | `task_grant`（E4 可统一「任务奖励」） | ✅ 只读；发奖≠本刀 |
| 行「场次加油包 · 5 场」+5 | `inventory_grant` / session_pack | ✅ 数量←delta，禁写死 |
| 行「AI 出题 · {证} · {N} 题」−1 | `deduct`；E5 无元数据→短标题 | ✅ 不新开 API |
| 行「邀请注册奖励」「每日分享 · 好友打开」 | C13 已入账分录只读 | ✅ H6；勿 grant |
| 时间「今天 HH:mm」/「MM-DD HH:mm」 | `createdAt` → Asia/Shanghai | ✅ H13 |
| `v2.0.0` 角标 | 设计版本标 | ✅ **生产勿带** |
| 支付/下单 | **无** | ✅ H4 / F1 |

**本页禁面**：`requestPayment` / `POST /api/orders` / mock-notify / upgrade-quote / grant；写死可用场次/今日消耗/±场；另开第二明细路由；实现 C13 发奖 runtime；改 TB-20 ledger 写路径。

**偏差**：无阻塞。顶层 id 缺失不阻塞；空态未出帧不阻塞；证名/题数 enrich 非本刀（E5）。

### 3.2 同包邻接帧（勿扩范围）

| 帧 | 归属 |
| --- | --- |
| `122:5` / `122:11` / `122:7` | C11 已合（入口） |
| `122:4` / `122:6` | C9/C10 已合（仅可选导航目标） |
| `122:8` / `122:10` | **C13**（不对稿） |
| `122:3` | C8 半屏已合；与明细无关；半屏禁支付不回退 |

---

## 4. 跨切检查（H1–H13 / F1–F8）

| # | 项 | 结论 |
| --- | --- | --- |
| H1 | 路由唯一：增强/替换 `pages/commerce/session-ledger/index` | ✅ 设计为单页明细；禁双开 |
| H2 | 新 HTTP endpoint = 0 | ✅ 只消费 entitlement + ledger |
| H3 | 可用场次/流水数字以服务端为准；禁写死 | ✅ 稿面数字=示意 |
| H4 | 本页禁止支付 | ✅ 设计无支付条；仅可选导航 |
| H5 | 与 TB-27：入口归 27；全量归 28；不回改「我」禁支付 | ✅ |
| H6 | 与 C13：发奖 runtime≠本刀；已入账只读 | ✅ |
| H7 | ledger 只追加、只读消费；不改 TB-20 写路径 | ✅ |
| H8 | 列表=`items` 新→旧；`nextCursor` 分页 | ✅ API 已具备 |
| H9 | Tab 全部/获得/消耗映射 | ✅ 设计三 Tab 齐 |
| H10 | 样式权威 design 包；禁 cache / `get_design_context` | ✅ 本评遵循 |
| H11 | 须本 UI 评审后方可前端开工 | ✅ 本文 |
| H12 | 会员顶卡不限场；不用三桶之和冒充剩余 | ✅ |
| H13 | reason→标题；delta 带符号；时间 Asia/Shanghai；禁 invent 订单金额 | ✅ |
| F1 | 本页无支付/下单 API | ✅ 可 grep 验收 |
| F2 | 禁写死当前可用/今日消耗/delta | ✅ |
| F3 | 无新 HTTP endpoint | ✅ |
| F4 | 无 C13 发奖 grant | ✅ |
| F5 | 仍唯一 session-ledger 路由 | ✅ |
| F6 | 无改 TB-20 扣场/日切/ledger 写 | ✅ |
| F7 | 半屏禁支付锁仍在 | ✅ 本刀不碰半屏 |
| F8 | 无广告 SDK / 金币 | ✅ |
| — | 字段 ↔ entitlement/ledger | **无缺阻塞字段**（E5 短标题即可） |
| — | 设计↔契约冲突 | **无阻塞冲突**；稿面示意数字/角标/证题 enrich 按**契约**优先 |

---

## 5. 技术风险（非阻塞）

1. 稿面「当前可用 3」与「库存 3」并存 → 实现必须按契约三桶之和 / inventoryRemain，避免照抄。
2. entitlement/ledger 失败 → ErrorBlock/可重试；**不得**落假流水或假可用数。
3. 「今日消耗」算法（E3）可首屏粗算；不足时勿写死，可隐藏或「—」。
4. E5 消耗行证名/题数：短标题「AI 出题」；勿为本刀新开 enrich API。
5. C13 示意行（邀请/分享）若环境尚无分录 → 列表如实为空/无该行，**勿**客户端伪造。
6. Tab 客户端过滤时，「加载更多」后需对新增页再过滤；或切 Tab 重置 cursor（工程自决）。
7. 会员态顶卡：design 本帧示意非会员数字卡；`active===true` 时切不限场文案（契约优先于稿面单一示意）。
8. 勿在 session-ledger 树引入 C7 下单/`requestPayment`「顺手支付」。
9. shared browser barrel **不**引入 `node:` / 商户私钥读取。

---

## 6. 分帧结论一行表

| 帧/面 | 结论 |
| --- | --- |
| `122:9` 场次明细 | ✅ 通过 · 可对稿 · 顶卡+Tab+流水 · 字段↔entitlement/ledger 齐 · **禁支付** |
| `LedgerAvailabilityCard` | ✅ 通过 · 大数字/副文←API · 会员不限场 · 禁写死 |
| `LedgerFilterTabs` | ✅ 通过 · 全部/获得/消耗 · H9 |
| `LedgerList` + cursor | ✅ 通过 · nextCursor 续拉 · 空/错态工程补 |
| `LedgerRow` | ✅ 通过 · reason 映射 + ± 符号 + 时间 · E5 短标题 |
| 支付边界 | ✅ 本页禁支付 · 半屏禁支付不回退 · CTA 仅导航（稿面无 CTA） |
| TB-27 边界 | ✅ 入口已合 · 本刀替换 stub · 不回改「我」 |
| C13 边界 | ✅ 分录只读 · 发奖 runtime 非本刀 |
| `122:8` / `122:10` | ✅ **不对稿** · 归 C13 |

---

## 7. 落盘

| 位置 | 路径 |
| --- | --- |
| Box | `/workspace/tishuashua-tb28-ui-tech-review-20261107.md` |
| 外盘 arch | `/Volumes/My PSSD/notion_files/题刷刷/arch/UI 技术评审 · TB-28 小程序场次明细（2026-11-07）.md` |
| 进仓约定 | `docs/delivery/tb28-ui-tech-review-20261107.md`（本任务副本在 `/workspace/docs-delivery-convention/`；**未 push**） |

---

*完 · TB-28 UI 技术评审 · 2026-11-07（Asia/Shanghai）· 前端可开工 · 不合码*
