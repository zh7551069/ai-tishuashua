# UI 技术评审 · TB-21 / C5 后管全局配额·SKU·增长配置（2026-11-07）

| 项 | 值 |
| --- | --- |
| 角色 | 架构师 Arch |
| 切片 | TB-21 / 看板 C5 |
| 契约 | `C 契约 · TB-21 … v0.1.0-C`（§6 UI 约束 / §6.5 开工门禁） |
| 样式权威 | `design/后管（商业化v2.0.0）/`（index.html + styles.css + svgs）；**禁** design/dev-cache / figma-dev-cache / `get_design_context` |
| 副源 | Bridge `Figma-Bridge-main/output/`（本刀四帧**未**出现；冲突以 design 包为准） |
| 对稿帧 | `13:86` 配额 · `13:3` SKU 列表 · `13:476` SKU 编辑 · `13:169` 增长 |
| 日期 | 2026-11-07（Asia/Shanghai） |
| 合码 | **不合码**；仅辉当面「合」 |

---

## 三行留痕

- **结论**：**通过**（无条件）。四帧在权威 design 包可对稿；路由/表单与 C 契约 §6 + §4 API 一一可实现；H4 视觉已呈「关 + 字段禁用」，契约钉死永久禁用。
- **必改**：**无**
- **建议**：① 覆盖设计稿「会员日上限…开放问题」文案为「架构禁·永久关闭」，开关 `disabled` 不可拨开；② SKU **新建态**补可写 `code` + 必选 `type`（编辑态 `code`/`type` 只读，设计已示意）；`sortOrder`/`inventoryExpireDays` 可默认（pack=365）不强制暴露；③ 侧栏「用户权益」按 §6.4 **灰置或省略**（C6）；④ 配额页「重要」条可补一句「改日免不回溯当日 remain」；⑤ 同 HTML 内 C6 补发弹层**勿实现**。

---

## 前端可否开工

**可开工**（必改=0）。须按契约 §6.3 / H4 / H5 / H6 实现，不以设计稿「开放问题」文案开通会员日上限；不以同包 C6 补发/用户权益页为范围。后端 API/migration 可与前端并行（Owner 已点全栈）。合码仍等辉当面「合」。

---

## 1. 样式源与帧可达性

| 检查 | 结果 |
| --- | --- |
| design 包存在 | ✅ `index.html`（~367KB）+ `styles.css` + `svgs/` |
| 四页正文 | ✅ 剥离文本可见：权益 SKU 列表 / 全局配额 / 增长任务配置 / 编辑 SKU 抽屉 |
| 顶层 `id=13:86` 等 | ⚠️ 包内以画板铺排呈现，子层 `data-layer-id` 为其它节点号；**内容齐全，可按页面对稿**，不阻塞 |
| Bridge 副源 | 无本刀商业化四帧文案 → 忽略 |
| 禁源 | 本评审**未**采 design/dev-cache / figma-dev-cache / get_design_context 作权威 |

画板规模：后管壳 **1440×(900/1000)**；侧栏分组文案「商业化 / 权益 · v2.0.0」。

---

## 2. 信息架构 / 路由（§6.1 / §6.4）

| 路由（契约） | 设计 | 可实现 |
| --- | --- | --- |
| `/commerce/skus` | 侧栏「权益 SKU」+ 列表页 | ✅ |
| `/commerce/quota` | 侧栏「全局配额」+ 表单页 | ✅ |
| `/commerce/growth` | 侧栏「增长任务」+ 配置页 | ✅ |
| SKU 编辑 | 页内抽屉/弹层「编辑 SKU · v2.0.0」 | ✅ |
| 既有 `/settings` 出题策略 | 配额页内嵌 `freeUserBankFirst`；侧栏「系统」保留 | ✅ 复用 TB-18，禁第二键 |
| 用户权益 / 补发 | 设计有入口与弹层 | ⛔ **本刀不做**（C6）；灰置/省略 |

---

## 3. 四帧逐帧

### 3.1 `13:86` · 全局配额 → `/commerce/quota`

| 设计控件/区 | 契约字段 / API | 对齐 |
| --- | --- | --- |
| 每日免费场次（可改，示意 2） | `dailyFreeSessions` ↔ PUT quota | ✅ |
| 业务日时区只读 Asia/Shanghai | `timezone` + `timezoneReadonly` | ✅ |
| 清零规则只读文案 | `clearingRuleText` | ✅ |
| 免费提炼终身次数 | `refineLifetimeLimitFree` | ✅ |
| AI 点评摘要「不限」只读 | `aiReviewSummary: unlimited` | ✅ |
| **会员日上限开关**「关」+ 场次「—」禁用 | H4 / `memberDailyCap.uiLocked=true`；**无写 API** | ✅ 视觉关+禁；**文案仍写「开放问题」→ 实现须按 H4 永久 disabled 并改文案（建议，非阻塞）** |
| 出题策略 `freeUserBankFirst` | 既有 GET\|PUT system-settings；可即时 | ✅ H8 |
| 扣场顺序只读 | `deductOrderText` | ✅ |
| 「重置为默认」「保存并记审计」 | POST reset + PUT；整表单提交非逐字段 | ✅ §6.3 |
| 重要条：日免只影响免费桶 / 时区固定 | 与 H3/H7 一致；可补「不回溯」 | ✅ / 建议 |

**偏差**：设计 helper「开启后才出现会员日上限字段（开放问题）」与 H4 冲突 → **以实现/契约为准**，不重出设计不阻塞开工。  
**非目标**：无支付 UI。

### 3.2 `13:3` · 权益 SKU 列表 → `/commerce/skus`

| 设计 | 契约 | 对齐 |
| --- | --- | --- |
| Tab：全部 / 会员 / 加油包 / 已停用 | query `type` / `status` | ✅ |
| 列：code / 名称 / 类型 / 试用价 / 有效期 / 权益摘要 / 状态 / 操作 | `Sku` DTO | ✅ |
| 五行种子（周/月荐/季/年/加油×5）价与契约种子一致 | §3.4 | ✅ |
| 新建 / 行内编辑 / 停用 | POST / PUT / disable | ✅ |
| 脚注：改价不影响已支付快照；无证书通关包 | H5 / 范围 | ✅ |

**偏差**：无。空态未单独画 → 实现用后管表格空态即可（建议）。

### 3.3 `13:476` · SKU 编辑抽屉

| 设计 | 契约 | 对齐 |
| --- | --- | --- |
| 标题「编辑 SKU」；`code（只读）` +「创建后不可改」 | H5；PUT 禁改 code | ✅ |
| 显示名称 / 试用价（元）/ 有效天数 / 权益摘要 | name / priceFen←元×100 / durationDays / summary | ✅ |
| 加油包场次数（会员「—」） | `sessions` 仅 pack | ✅ |
| 启用 / 推荐角标 | enabled / recommended | ✅ |
| 取消 / 保存并记审计 | PUT + audit | ✅ |

**偏差（建议级）**：

- 设计示意**编辑态**；**新建态**须另做：可写 `code`、必选 `type`（member\|session_pack）、条件显示 duration vs sessions（契约 §4.3 已钉，无需改设计包）。
- 未画 `sortOrder` / `inventoryExpireDays` → 默认可写死/默认 365（pack），不阻塞。
- 同画板邻接 **C6「补发场次」弹层** → **禁实现**。

### 3.4 `13:169` · 增长任务配置 → `/commerce/growth`

| 设计区 | `growthConfig` 字段 | 对齐 |
| --- | --- | --- |
| 签到：启用 + 奖励场次 +1 | `checkin.enabled` / `rewardSessions` | ✅ |
| 分享：启用 + 奖励 +1 + 会员改发提炼次 +1 | `share.*` / `memberRefineBonus` | ✅ |
| 拉新注册：开 + 邀请人/新用户各 +1 | `invite.registerEnabled` / `inviterRegisterSessions` / `inviteeWelcomeSessions` | ✅ |
| 首刷：开 + 邀请人 +3 / 新用户 +2 | `firstSubmitEnabled` / `inviterFirstSubmitSessions` / `inviteeFirstSubmitSessions` | ✅ |
| 日封顶开 +6 / 周封顶开 +15 | `dailyCap*` / `weeklyCap*` | ✅ |
| 重置为默认 / 保存并记审计 | POST reset + PUT 全量 | ✅ |
| 说明：超限→待发放在「用户权益」处理 | C13/C6 文案；本刀只存配置 | ✅ H9 |

**偏差**：无缺字段。校验 0…99 / 全量 PUT 按契约 §3.2（建议前端同校验）。

---

## 4. 跨切检查

| # | 项 | 结论 |
| --- | --- | --- |
| 1 | 表单字段 ↔ API | 配额/增长/SKU 编辑：**无缺阻塞字段** |
| 2 | H4 会员日上限 | 视觉已关+禁用；实现须 **永久 disabled** + 文案去「开放问题」 |
| 3 | SKU code 编辑只读 / 新建可写 | 编辑 ✅；新建按契约补 |
| 4 | 无支付/微信商户 UI | ✅ 本刀四页无下单/商户；邻页 C6 勿做 |
| 5 | 壳/表格/抽屉复用 | 可复用后管既有 Layout + Table + Drawer；权限=后管 Bearer |
| 6 | 热生效文案 | 有「重要」条；建议补不回溯一句 |
| 7 | 保存模式 | 配额/增长/SKU：**整单保存+审计**；出题策略开关可即时（§6.3） |

---

## 5. 技术风险（非阻塞）

1. shared 类型勿经 browser barrel 导出 Node SQL（对齐 PR#52 教训）。
2. 价展示用元、写入 `priceFen`；注意浮点，建议输入约束到分。
3. 增长页字段密，注意表单分区与校验错误汇总。
4. 设计包含 C6/题库画板——开工包拷贝时勿误当成 TB-21 范围。

---

## 6. 落盘

| 位置 | 路径 |
| --- | --- |
| Box | `/workspace/tishuashua-tb21-ui-tech-review-20261107.md` |
| 外盘 arch | `/Volumes/My PSSD/notion_files/题刷刷/arch/UI 技术评审 · TB-21 后管配额SKU增长（2026-11-07）.md` |
| 进仓约定 | 合码 PR 可附 `docs/delivery/tb21-ui-tech-review-20261107.md` |

---

*完 · TB-21 UI 技术评审 · 2026-11-07（Asia/Shanghai）· 前端可开工 · 不合码*
