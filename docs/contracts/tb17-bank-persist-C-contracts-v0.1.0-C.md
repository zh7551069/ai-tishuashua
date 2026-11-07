# 题刷刷 · TB-17 AI出题落库与免费用户题库优先开关 · C 接口契约（v0.1.0-C）

| 项 | 值 |
| --- | --- |
| 性质 | **C 契约已放行**（辉本人当面「六项全采推荐」+「确认进入完整交付」） |
| 放行 | **2026-11-07**（Asia/Shanghai）· 架构师对话当面确认（应答 t69s393） |
| 架构版本旁注 | **v0.1.0-C**（TB-17；相对现网 `docs/quiz.md` + 复练契约的增量） |
| 依据 | B 评估 [/workspace/tishuashua-tb17-bank-persist-B-eval-20261107.md](./tishuashua-tb17-bank-persist-B-eval-20261107.md) · 外盘 `arch/B 架构探路短评估 · AI出题落库与题库优先开关（2026-11-07）.md` · 业务需求 / PRD增量（同日） |
| 已拍板并入 | **§0 T1–T6 全采**（不可改） |
| 仓 | https://github.com/zh7551069/ai-tishuashua |
| 进仓约定 | 合码 PR 应落到 `docs/contracts/tb17-bank-persist-C-contracts-v0.1.0-C.md`，并同步修订 `docs/quiz.md`、新增/修订 `docs/admin-system-settings.md`（或挂 `docs/admin-login.md` 旁注）；**本任务未 push / 未合码** |
| 本地 arch 副本 | `/Volumes/My PSSD/notion_files/题刷刷/arch/C 契约 · AI出题落库与题库优先开关（2026-11-07）.md` |
| 契约归属 | 架构师；**全栈不得私改路径 / 字段 / 错误码 / 分页 / 枚举 / 落库 / 抽题窗口 / 会员旁路而不申报** |
| 业务对接 | 题刷刷 · 业务组 |
| 合码 | **仅辉当面「合」授权** |

> **放行范围**：本文件（含 §14 UI 约束三行）为正式 C。**后端 / shared / Worker 可按本契约开工**。后管开关前端须另过 UI 技术评审三行留痕（§14）；**未通过禁正式像素前端开工**（允许 API + 占位 UI，见 §14）。不合码直至辉当面授权。不写业务代码以外的合码动作由本文件授权。

---

## 0. T1–T6 硬拍板（不可改）

| # | 拍板 |
| --- | --- |
| **T1** | 抽题：同会话 KP 优先；题型 ∈ 设置；难度**软匹配**；近 **30 天** ∪ 近 **3 场**避复；窗口内禁同题；**不做**题型/难度强制配比 |
| **T2** | 教材：用现有 `textbooks` / `knowledge_points.textbook_id`；独立 KP → `textbook_id = NULL`；**禁** RAG / 哨兵教材 |
| **T3** | 历史回填：**不做**；仅本切片上线后**新生成**起存 |
| **T4** | `freeUserBankFirst` 上线默认：**关** |
| **T5** | 会员：**不受开关影响**（仍 AI + 入库）；现网无会员字段时 `isFreeUser() ≡ true`，预留 bypass 缝；**禁**本刀做会员商业化 |
| **T6** | 模型：独立 `question_bank` + 错题可选 `bank_question_id`；**禁止**扩展 `wrong_items` 当全量题库 |

---

## 1. 范围与硬约束

### 1.1 做

1. AI / `ai_variant` 生成成功 → **每题**写入 `question_bank`（归属：领域 / 证书 / 教材可空 / 知识点 + 入库来源）。
2. 组卷编排插入「题库抽题」分支（仅当 `freeUserBankFirst && isFreeUser`）：`wrong_carry → bank → AI`。
3. `paper_questions.source` 增 `bank`；shared `QUESTION_SOURCES` 一次改齐。
4. 后管 `system_settings` + `GET/PUT .../freeUserBankFirst`；短缓存；默认关。
5. `wrong_items.bank_question_id` 可选 FK；错题重练 / `wrong_carry` / 消灭指纹逻辑**不退化**。
6. 会员旁路闸门 `isFreeUser`（本刀恒 true + 单测锁定未来 bypass）。
7. 可观测：生成日志/进度旁路增 `wrongCarried` / `bankDrawn` / `aiGenerated` 计数（实现可挂 session 旁注或 worker 日志；契约要求可测）。

### 1.2 不做（本切片）

- 短信 / 计费 / 会员购买闭环 / 配额产品化 / **RAG·教材向量库** / 哨兵教材
- 历史 `paper_questions` / `wrong_items` ETL 回填
- 题库人工编辑器、批量导入、审核工作流、后管题库浏览列表（可列后续）
- C 端用户自选「题库 / AI」模式；向小程序暴露开关
- 对 `source=variant` 做「先抽库」（变异仍 1 题 AI 改写；**成功题仍入库**）
- 改 `WRONG_QUESTION_RATIO_MAX` / 先手式配额；复活 failed session；新建队列名
- Me / 签到 / 主题色 / 后管商业化页 / 像素对稿类切片
- 改商业化权益扣场顺序（仅交叉引用）

### 1.3 相对复练契约（交叉引用）

- 会话 `QuizSessionSource` **不变**：`normal | retrain_similar | variant | wrongSet`（`wrongSet` 仍预留拒绝）。本切片**不**改会话 source 枚举。
- 题目 `QuestionSource` **扩展**：在复练已定的 `ai | wrong_carry | ai_variant` 上增 **`bank`**（见 §3）。
- `retrain_similar`：与 `normal` 同走 §5 编排（可 wrong_carry + 条件抽库 + AI）；KP 集仍=会话覆盖（复练 U1/U2）。
- `variant`：编排仍仅 1 道 `ai_variant`；**入库** `question_bank.source='ai_variant'`；**不** `drawFromBank`；U3–U6 / 禁 RAG 仍有效。
- 答对变异不按 `wrong_item_id` 清除原错（复练 U4）不变。

---

## 2. 认证、Base、错误外壳

- Base：现网 API，前缀 `/api`。
- C 端出题：`Authorization: Bearer <微信用户 token>`（`docs/wechat-login.md`）。
- 后管设置：`Authorization: Bearer <后管 token>`（`docs/admin-login.md`）；微信用户 token → `401 UNAUTHORIZED`。
- 错误体：现网 `{ "code": ApiErrorCode, "message": string }`。
- 本切片**尽量不新增**错误码枚举值，复用：
  - `VALIDATION_ERROR`（400）
  - `NOT_FOUND`（404）
  - `UNAUTHORIZED`（401）
  - `FORBIDDEN`（403，若后管权限模型已有；现网后管单帐号则可不用）
  - `PACK_UNAVAILABLE` / `LLM_*` / `QUIZ_GENERATION_FAILED` / `REDIS_UNAVAILABLE` / `DATABASE_UNAVAILABLE`（生成路径与现网一致）
- 分页：本切片**无**题库列表 API；成绩列表 / 错题列表分页语义不变。后管设置读写**无分页**。

---

## 3. 枚举一次定全（题目来源）

### 3.1 `QuestionSource`（扩展）

```ts
export const QUESTION_SOURCES = [
  'ai',
  'wrong_carry',
  'ai_variant',
  'bank', // TB-17：从 question_bank 抽入本卷
] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];
```

| 值 | 含义 | 是否写入 `question_bank` |
| --- | --- | --- |
| `ai` | 本场 AI 原创入卷 | **是**（`question_bank.source='ai'`） |
| `wrong_carry` | 未消灭错题带入 | 否（不作为新 AI 入库；可选回填 `wrong_items.bank_question_id`） |
| `ai_variant` | 题型变异入卷 | **是**（`question_bank.source='ai_variant'`） |
| `bank` | 从题库抽入本卷 | 否（不复制新 bank 行；`paper_questions` 引用已有 bank id） |

- 迁移：`paper_questions_source_check` 扩至含 `bank`（在 007 基础上再 ALTER）。
- 客户端 / 后管只读展示：旧客户端可忽略未知 source；shared 必须一次改齐。

### 3.2 会话 `QuizSessionSource`

**不改**（见复练 C §3.1）。TB-17 不新增会话来源。

### 3.3 题库行入库来源 `BankIngestSource`

```ts
export const BANK_INGEST_SOURCES = ['ai', 'ai_variant'] as const;
export type BankIngestSource = (typeof BANK_INGEST_SOURCES)[number];
```

- 落在 `question_bank.source`；**不含** `bank` / `wrong_carry`（抽题与错题带入不是「入库事件」）。

### 3.4 题库状态

```ts
export const BANK_STATUSES = ['online', 'offline'] as const;
```

- 本刀写入一律 `online`；下架/编辑器另切片。抽题**只抽** `status='online'`。

---

## 4. 数据模型（概念级字段 · 非正式 DDL）

> 实现可微调列类型（如 `jsonb` vs 规范化 options），**不得**改对外语义与唯一性约定。推荐迁移序号：`008_question_bank_and_settings.sql`（以仓内实际下一号为准）。

### 4.1 `question_bank`（新表 · T6）

| 字段 | 类型（概念） | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | uuid PK | 是 | |
| `domain_id` | uuid → domains | 是 | 自 `loadContext` |
| `certificate_id` | uuid → certificates | 是 | |
| `textbook_id` | uuid → textbooks **NULL 可** | 否 | 取 KP 的 `textbook_id`；独立 KP → **NULL**（T2） |
| `kp_ids` | uuid[] | 是 | 长度 ≥ 1；须 ⊆ 会话 KP 集（与现 parse 约束一致） |
| `type_code` | text | 是 | `single\|multi\|judge` |
| `stem` | text | 是 | |
| `options` | jsonb | 是 | 与 paper 同形 |
| `answer` | jsonb | 是 | |
| `analysis` | text | 否 | |
| `difficulty` | text | 否 | 取当时 `session.settings.difficulty`；可空 |
| `source` | text | 是 | `ai` \| `ai_variant` |
| `content_key` | text | 是 | 题干指纹，算法对齐 `wrongItemKey`（§4.4） |
| `origin_session_id` | uuid | 否 | 审计；cancel 后仍可保留 |
| `origin_user_id` | uuid | 否 | 审计；**题库全站按证书共享**，不按用户隔离 |
| `status` | text | 是 | 默认 `online` |
| `created_at` | timestamptz | 是 | |

**约束 / 索引（钉死语义）**

- `UNIQUE (certificate_id, content_key)` —— 幂等去重键。
- 索引建议：`(certificate_id, status)`；`(certificate_id, type_code, status)`；GIN(`kp_ids`)。
- **共享范围**：按证书（+KP 过滤）全站共享；不含用户 PII。本刀不加 `visibility`。

### 4.2 `paper_questions` 增量

| 变更 | 说明 |
| --- | --- |
| `source` CHECK 增 `bank` | 见 §3.1 |
| `bank_question_id` uuid NULL | 可选 FK → `question_bank(id)`；`source='bank'` 时**必填**；`source∈{ai,ai_variant}` 时**建议填写**刚入库 id；`wrong_carry` 可空 |

### 4.3 `wrong_items` 增量

| 变更 | 说明 |
| --- | --- |
| `bank_question_id` uuid NULL | 可选 FK → `question_bank(id)`；**禁止**把 wrong 表当全量库（T6） |
| 消灭 / 指纹 / `wrong_carry` | **仍以 `question_snapshot` + `wrongItemKey` 为准**；不得改为「仅靠 bank id」消灭 |

### 4.4 `content_key` 算法（对齐现网）

与 `apps/api/src/quiz/quiz.repository.ts` 中 `wrongItemKey` 同构：

```text
content_key = type + '\u0002' + stem.trim() + '\u0002' + optionsJoined + '\u0002' + answerSorted
optionsJoined = map(option => id + '\u0000' + text).join('\u0001')
answerSorted  = sort(answer).join('\u0001')
```

- 入库与抽题避复、幂等**共用**此键。
- shared 宜抽 `questionContentKey(...)` 供 API / Worker 共用（实现细节，PR 说明即可）。

### 4.5 `system_settings`（新表）

| 字段 | 类型（概念） | 说明 |
| --- | --- | --- |
| `key` | text PK | 本刀键：`freeUserBankFirst` |
| `value` | jsonb | `{ "enabled": boolean }` |
| `updated_at` | timestamptz | |
| `updated_by` | text | 后管用户名或固定 `admin`（现网单帐号） |

- 种子：若不存在则视默认 `enabled=false`（T4）；**推荐**迁移 INSERT 默认行，避免首读歧义。
- 同表可挂未来 `dataRetentionDays` —— 本刀**只**实现 `freeUserBankFirst`。

---

## 5. 组卷编排（Worker · 同队列）

### 5.1 队列

- 仍仅 `JOB_GENERATE_QUIZ` = `quiz.generate`。
- Payload 不变 `{ userId, sessionId }`；分支读 session + SettingReader。

### 5.2 `normal` / `retrain_similar`（核心）

```text
1) wrong_carry = takeWrongCarry(...)     // 现规则；quota = floor(count × 0.5)
2) need = count - |wrong_carry|
3) if settings.freeUserBankFirst && isFreeUser(user):
     bank = drawFromBank(need, filters)  // §5.4
   else:
     bank = []
4) aiNeed = need - |bank|
5) if aiNeed > 0:
     ai = requestOriginalQuestions(..., aiNeed)
     → 每题校验通过后 persistQuestionBank(source='ai') 再入卷（source='ai'）
6) paper = wrong_carry + bank + ai
7) 题干 Set 去重（现规则）；分值归一化；写 paper_questions；mark ready
```

- 开关**关**或会员（`!isFreeUser`）：跳过步骤 3，行为≈今，但步骤 5 **必须入库**。
- 抽不满：剩余交给 AI（成功标准）；**禁止**因库不足整卷失败（除非 AI 也失败——维持现网整卷 failed / 删半卷 paper）。
- AI 失败 / cancel：删本会话 `paper_questions`；**不删**已写入的 `question_bank`（T3 精神：token 已花，资产保留）。
- 半卷 paper 仍删 —— 与今一致。

### 5.3 `variant`

1. 现复练变异路径不变（count=1、practice、禁 wrong_carry、禁 RAG）。
2. 变异题结构校验通过后：`persistQuestionBank(source='ai_variant')`，`paper_questions.source='ai_variant'`，建议带 `bank_question_id`。
3. **不**调用 `drawFromBank`。

### 5.4 `drawFromBank` 过滤器（T1）

| 维度 | 规则 |
| --- | --- |
| 证书 | `certificate_id = session.certId` |
| 状态 | `status = 'online'` |
| KP | **优先** `kp_ids && sessionKps` 非空交集；实现钉死：候选集 = 有交集的行；若交集候选不足再**不得**放宽到「同证书任意 KP」本刀（宁可 AI 补）——与「同会话 KP 优先」一致且避免偏题 |
| 题型 | `type_code ∈ settings.types` |
| 难度 | **软匹配**：若行有 `difficulty` 则优先等于 `settings.difficulty` 的行；不足则忽略难度继续抽（不得因难度硬匹配抽空） |
| 避复窗口 | 排除 `content_key`（或 `bank.id`）落在用户 **避复集合** 内的行（§5.5） |
| 本卷去重 | 不得与已选 `wrong_carry` / 已抽 bank 的 stem / content_key 重复 |
| 配比 | **不做**强制题型/难度配比 |
| 排序 | 在过滤后集合内伪随机（实现可选 `ORDER BY random()` 或应用层 shuffle）；可稳定盐=`sessionId` 便于测 |

返回 ≤ `need` 条；每条写入 `paper_questions` 时 `source='bank'`，`bank_question_id=id`，题面从 bank 行拷贝（或 join 投影）。

### 5.5 避复集合（T1 钉死）

对当前用户 `userId`：

```text
seen = content_key/bank_id 出现在以下并集：
  A) 近 30 天内：该用户 status=submitted 会话的 paper_questions
     （通过 quiz_answers 已作答或仅入卷均算「做过」——钉死：以 paper_questions 入卷为准，含未答）
  B) 该用户最近 3 场 status=submitted 会话（按 submitted_at DESC）中的 paper_questions
```

- 窗口内**禁止**同 `content_key`；窗口外允许。
- 实现可用 SQL 子查询或物化 `user_question_seen`（可选优化表，**非必须**；若建表须同迁移说明，且不改变并集语义）。

### 5.6 `isFreeUser`（T5）

```ts
function isFreeUser(_user: { id: string }): boolean {
  // TB-17：现网无会员字段 → 恒 true。
  // 商业化落地后：return !entitlement.isMemberActive(user);
  return true;
}
```

- 组卷：`freeFirst = freeUserBankFirstEnabled && isFreeUser(user)`。
- **单测锁定**：存在「当 isFreeUser=false 时即使开关开也不抽库」的用例（可用依赖注入/测试替身模拟未来会员）。
- **禁止**本刀读取或写入任何 VIP/SKU/日免账本。

### 5.7 入库时机与幂等（§6 摘要）

见下一节。

---

## 6. Worker / AI 成功后入库契约

### 6.1 写入时机

| 事件 | 行为 |
| --- | --- |
| AI / `ai_variant` 单题结构校验通过并准备入卷 | **同步** `INSERT question_bank`（与 `INSERT paper_questions` 同事务**优先**；或紧随且失败则该题视为生成失败） |
| `wrong_carry` | **不**作为新 AI 入库；若能用 content_key 反查 bank 可回填 `wrong_items.bank_question_id`（非必须，P2） |
| `bank` 抽题 | 只写 `paper_questions`（source=`bank` + `bank_question_id`），不复制新 bank 行 |
| 会话 cancel / LLM 失败清卷 | **不删** `question_bank`；只删本会话 `paper_questions`（及级联 answers） |
| 幂等冲突 | `UNIQUE (certificate_id, content_key)` 冲突 → **保留首条**；本卷 `paper_questions.bank_question_id` 引用已有 id；不报错（入卷继续） |
| 历史回填 | **禁止**本切片脚本/迁移回填旧题（T3） |

### 6.2 归属四维填充

| 字段 | 来源 |
| --- | --- |
| `domain_id` / `certificate_id` | `loadContext` |
| `kp_ids` | AI 返回 `knowledgePointId` → `[id]`；须 ∈ 会话 KP |
| `textbook_id` | `SELECT textbook_id FROM knowledge_points WHERE id = kp`；独立 KP → **NULL** |
| `source` | `ai` / `ai_variant` |
| `difficulty` | `context.difficulty` |
| `origin_session_id` / `origin_user_id` | 当前 session / user |

### 6.3 可观测

- Worker / 会话进度旁路至少可测：`wrongCarried`、`bankDrawn`、`aiGenerated`（日志字段或 `quiz_sessions` 旁注 jsonb；二选一，PR 说明）。
- 后管题库浏览 UI：**本刀不做**。

---

## 7. 后管 `freeUserBankFirst` 配置 API

### 7.1 路径与契约

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/system-settings/freeUserBankFirst` | 读当前值 |
| PUT | `/api/admin/system-settings/freeUserBankFirst` | 写 + 审计（更新 `updated_at` / `updated_by`） |

**鉴权**：后管 Bearer；微信 token → `401 UNAUTHORIZED`。

**GET 200**

```json
{
  "key": "freeUserBankFirst",
  "enabled": false,
  "updatedAt": "2026-11-07T06:00:00.000Z",
  "updatedBy": "admin"
}
```

- 无行时仍 200，`enabled=false`（T4），`updatedAt`/`updatedBy` 可为 `null`。

**PUT 请求体**

```json
{ "enabled": true }
```

- 缺字段 / 非 boolean → `400 VALIDATION_ERROR`。
- **PUT 200**：同 GET 响应形（写后值）。
- **禁止** query/body 接受其它 key 的批量写入本路径（单键资源）。

### 7.2 缓存

| 项 | 钉死 |
| --- | --- |
| 读者 | Generation / Worker 经 `SettingReader.getFreeUserBankFirst(): Promise<boolean>` |
| 缓存 | Redis（推荐）TTL **60s**，或进程内存 + PUT 后主动失效；**可接受短缓存** |
| PUT 后 | **必须**主动失效缓存键（不得只靠 TTL）；键名例 `sysset:freeUserBankFirst` |
| C 端 | **不**下发该开关；小程序无相关 API |

### 7.3 错误码矩阵

| 条件 | HTTP | code |
| --- | --- | --- |
| 无/错后管 token | 401 | `UNAUTHORIZED` |
| body 非法 | 400 | `VALIDATION_ERROR` |
| Redis 读写失败（若实现强依赖） | 现网 | `REDIS_UNAVAILABLE` 或降级直读 DB（PR 选一种并测） |
| DB 不可用 | 现网 | `DATABASE_UNAVAILABLE` |

### 7.4 默认值（T4）

- 上线默认 **`enabled=false`**。
- 迁移种子或首读回落均须保证「未配置 ≡ 关」。

---

## 8. 会员旁路（本刀）

```text
assemblePaper(...):
  freeFirst = SettingReader.getFreeUserBankFirst() && isFreeUser(user)
  // isFreeUser ≡ true（现网）；商业化后 bypass 会员
```

- AI 入库对会员/免费**一视同仁**。
- 仅「是否优先抽库」分叉。
- **不**改商业化架构文扣场 / 日免；本刀文档交叉引用一句即可。

---

## 9. 既有 C 端 API 行为增量说明

| 方法 | 路径 | 本切片 |
| --- | --- | --- |
| POST | `/api/quiz/sessions` | 请求体**不变**；生成结果可能含 `source:'bank'` 的题目 |
| GET | `/api/quiz/sessions/:id` | `paper.questions[].source` 可出现 `bank`；无答案未交卷规则不变 |
| 其它 quiz / wrong-book | | **路径不变**；错题详情可不下发 `bankQuestionId`（可选增发，旧客户端忽略） |

- **不**把 `freeUserBankFirst` 暴露给 C 端 create-session。
- 状态机不变。

### 9.1 可选：`WrongBookItem.bankQuestionId`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `bankQuestionId` | `string \| null` | 否 | 来自 `wrong_items.bank_question_id`；本刀可后置，不挡 AC |

---

## 10. 文档与 shared 落地清单（全栈）

1. `packages/shared`：`QUESTION_SOURCES` + `bank`；可选 `BANK_INGEST_SOURCES` / `questionContentKey`；`Setting` 类型若共享则放 admin-shared 或 api DTO。
2. 迁移：`question_bank` + `system_settings` + `paper_questions.source/bank_question_id` + `wrong_items.bank_question_id`。
3. `packages/shared` `quiz-run` / `quiz-engine`：`buildDrafts` 插入 bank 分支；variant 入库；`isFreeUser` 缝。
4. API：admin system-settings 模块 + Guard；Worker 读 SettingReader。
5. 后管：`/settings` 路由 + 导航「系统」+ 开关页（占位或过 UI 评审后像素）。
6. 文档：`docs/quiz.md` 组卷步骤与枚举；`docs/admin-system-settings.md`（新）或 `admin-login.md` 旁注；契约进仓路径见文首。
7. 单测：入库幂等；开关开库足零 AI；开关开库不足 AI 补且入库；开关关仍入库；避复窗口；会员 bypass 替身；cancel 不删 bank；错题重练不退化；variant 入库不抽库。
8. 复练契约：仓内 `docs/contracts/retrain-C-contracts-v0.1.0-C.md` 可加一句交叉引用「题目 source 另见 TB-17 增 `bank`」——**非必须同 PR**，但枚举冲突时以**本文件 + shared 常量**为准。

---

## 11. 全栈不得私改不申报声明

以下变更 **必须**先经架构师书面修订本契约（或辉当面改口）再合入：

- 路径、方法、请求/响应字段名与必填性（含后管 settings）
- `QUESTION_SOURCES` / `BANK_INGEST_SOURCES` / `BANK_STATUSES` 枚举成员
- 错误码与 HTTP 映射语义
- 避复窗口（30 天 / 近 3 场）与「窗口内禁同题」
- `isFreeUser` 旁路语义；对会员生效开关
- 扩展 `wrong_items` 当全量题库；历史回填；哨兵教材 / RAG
- `freeUserBankFirst` 默认改为开
- 新建生成队列名；variant 先抽库
- 分页语义（本刀无列表则禁止偷偷加未申报的题库列表契约当本切片必做）

实现细节（是否物化 `user_question_seen`、缓存用 Redis 或内存）可在 PR 说明，但不得改变对外语义。

---

## 12. 验收要点（架构侧 · 可测）

1. AI / ai_variant 成功题可在 `question_bank` 按证书+KP 查到，含四维（教材可 NULL）。
2. 开关**关**：免费用户组卷无 `source=bank`；新 AI 题仍入库。
3. 开关**开** + 库足：`bankDrawn=count-wrongCarried`，`aiGenerated=0`（同 KP/题型/避复可满足时）。
4. 开关**开** + 库不足：缺口 AI 补且入库；整卷题量正确。
5. 近 30 天 ∪ 近 3 场内同 content_key 不被再抽。
6. cancel / LLM 失败：paper 无半卷；bank 行仍在。
7. 错题重练 / wrong_carry / 指纹消灭行为与现网一致（不退化）。
8. variant：1 题、不抽库、入库 `ai_variant`；grep 变异路径无 embedding/RAG。
9. `isFreeUser=false` 替身：开关开也不抽库。
10. 后管 GET/PUT 开关；PUT 后短缓存内 Worker 读到新值（主动失效）；默认关。
11. CI 绿；合码仅辉当面「合」。

---

## 13. 进仓文件名说明

| 位置 | 路径 |
| --- | --- |
| 本任务 workspace 正本 | `/workspace/tishuashua-tb17-bank-persist-C-contracts-20261107.md` |
| 拟进仓（合码 PR 时） | `docs/contracts/tb17-bank-persist-C-contracts-v0.1.0-C.md` |
| 外盘 arch 副本 | `/Volumes/My PSSD/notion_files/题刷刷/arch/C 契约 · AI出题落库与题库优先开关（2026-11-07）.md` |
| 同步修订（实施 PR） | `docs/quiz.md`；`docs/admin-system-settings.md`（建议新）；可选复练契约交叉引用一句 |

正文以 workspace / 外盘为准；**进仓时机 = 辉授权合码的实施 PR**（或单独 docs PR），本任务不 push。

---

## 14. UI 约束（后管开关页 · 三行留痕级）

| 项 | 内容 |
| --- | --- |
| **结论** | 后管新增「系统」导航 + `/settings`（或等价）单页：只读展示并切换「免费用户题库优先」；调 §7 API；**样式源 = Bridge 导出 HTML**（本机 `Figma-Bridge-main/output/`），**禁** `get_design_context` / `design/dev-cache` / `cache_rev`。 |
| **必改** | 缺 Bridge 导出稿时：**允许 API + 占位 UI 先合后端**，正式像素须另过 UI 技术评审三行留痕通过后再开工像素；不得阻塞 Worker/入库。开关文案须含「仅影响免费用户；默认关」。 |
| **建议** | 勿塞进 Catalog；与保留周期同类「系统」分组；无题库浏览表；Cloud brief 若仍写读缓存/在线 Dev → 点名打回。 |

前端正式像素开工闸门：**UI 技术评审三行留痕通过**。后端不受此闸。

---

## 15. 落地顺序（实施参考 · 已授权开工，非授权合码）

1. 迁移 008（名可变）+ shared 枚举  
2. generation：AI/variant 入库 + `drawFromBank` + `isFreeUser`  
3. 后管 settings API + 缓存失效 + 占位/评审后 UI  
4. 文档进仓 + 单测 / CI  
5. 辉 UAT → 当面「合」

---

## 三行留痕

| 项 | 内容 |
| --- | --- |
| **结论** | **C 契约就绪（已放行）**：T1–T6 全采；独立 `question_bank` + 组卷「错题→题库→AI」+ 后管 `freeUserBankFirst`（默认关）+ 会员旁路；题目 source 增 `bank`。后端/shared/Worker 可按本文开工。 |
| **必改** | ① 勿扩 `wrong_items` 当全量库。② 避复 = 近 30 天 ∪ 近 3 场；KP 不放宽到整证书。③ 后管正式像素须 UI 评审三行通过；全栈不得私改契约不申报。④ 合码仅辉当面「合」。 |
| **建议** | 迁移种子默认关；PUT 主动失效缓存；variant 只入库不抽库；题库浏览/编辑另切片；`docs/contracts/tb17-bank-persist-C-contracts-v0.1.0-C.md` 随实施 PR 进仓。 |

---

*完 · C 接口契约 v0.1.0-C · TB-17 · 2026-11-07（Asia/Shanghai）· 未写业务生产代码 · 未 merge · 未拉 Cloud 实施 · 未广播业务组*
