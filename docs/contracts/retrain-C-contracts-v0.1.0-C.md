> 仓内正式副本。契约版本 **v0.1.0-C**（2026-11-04）。字段、枚举、错误码与落库规则以本文为准，实现不得私改。Notion：https://app.notion.com/p/40ef544e9e7b81b7aa7fe58a3a9346f0

# 题刷刷 · 复练同类 / 题型变异 · C 接口契约（v0.1.0-C）

| 项           | 值                                                                                                                                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 性质         | **C 契约已放行**（辉本人当面「确认进入完整交付」）                                                                                                                                                                                                              |
| 放行         | **2026-11-04**（Asia/Shanghai）· 架构师对话当面确认                                                                                                                                                                                                             |
| 架构版本旁注 | **v0.1.0-C**（复练切片；相对现网 `docs/quiz.md` 的增量契约）                                                                                                                                                                                                    |
| 依据         | B 评估 [/workspace/tishuashua-retrain-B-arch-eval-20261104.md](./tishuashua-retrain-B-arch-eval-20261104.md) · Notion [评估](https://app.notion.com/p/40ef544e9e7b81ca853ee1c3c1e8c7e2) · [业务需求](https://app.notion.com/p/40ef544e9e7b813580dbc3bfadf168fa) |
| 已拍板并入   | **U1–U8 全采**（不可改，见 §0）                                                                                                                                                                                                                                 |
| 仓           | https://github.com/zh7551069/ai-tishuashua                                                                                                                                                                                                                      |
| 进仓约定     | 合入后应落到 `docs/contracts/retrain-C-contracts-v0.1.0-C.md`（或等价路径）并同步 `docs/quiz.md` 增量节；**本任务未 push**                                                                                                                                      |
| 契约归属     | 架构师；**全栈不得私改路径 / 字段 / 错误码 / 分页 / 枚举 / 落库规则而不申报**                                                                                                                                                                                   |
| 业务对接     | 题刷刷 · 业务组                                                                                                                                                                                                                                                 |
| 合码         | **仅辉授权**                                                                                                                                                                                                                                                    |

> **放行范围**：本文件 + 同日 UI 约束为正式 C。**后端 / shared / Worker 可按本契约开工**。前端须另过 UI 技术评审三行留痕（见 UI 约束文）；**未通过禁前端开工**。不做业务代码以外的合码动作由本文件授权。

---

## 0. U1–U8 硬拍板（不可改）

| #      | 拍板                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **U1** | 复练同类 = **会话级 `knowledgePointIds` 覆盖**；禁止临时建包写回 `pack_knowledge_points` / 改用户 activePack                        |
| **U2** | 空 KP / KP 全部不可用 = **禁用 + 明确文案**；**禁止**静默回退整包 KP                                                                |
| **U3** | 题型变异 **`count=1`**；证书题型白名单内随机，**优先异于原题型**                                                                    |
| **U4** | 答对变异题 **不**消灭原错题；用户仍可「标记已消灭」                                                                                 |
| **U5** | 变异会话交卷后 **计入** `GET /quiz/sessions` 成绩列表                                                                               |
| **U6** | 变异 **默认仅练习**（`mode=practice`）；本切片禁考试模式发起变异                                                                    |
| **U7** | Prompt = **全局内置 + 证书可覆盖**（沿用现网 `pickPublishedPrompt` 优先级：证书 > 领域 > 全局 > 代码内置）；变异用独立模板键，见 §5 |
| **U8** | 会话 **`source` 枚举一次定全**：`normal` \| `retrain_similar` \| `variant` \| `wrongSet`（`wrongSet` **仅预留**，本切片实现须拒绝） |

---

## 1. 范围与硬约束

### 1.1 做

1. `WrongBookItem` / 错题详情 **下发 `kpIds`**（表字段已有；与后管 `AdminWrongBookDetail.kpIds` 对齐）。
2. 复练同类：详情 → 出题设置预填同 KP → `POST /api/quiz/sessions` 带 `knowledgePointIds` + `source=retrain_similar` → 既有 progress / paper。
3. 题型变异：详情 → `POST /api/quiz/sessions`（`source=variant` + `wrongItemId`）→ 同队列 `quiz.generate` 分支 → progress → paper；**≠ RAG**。
4. 失败可重试（再开新 session；旧 `failed` 不复活，与现网一致）。
5. 落库规则对齐 U4/U5/U6。

### 1.2 不做（本切片）

- 短信 / 计费 / 会员 / 配额 / **教材向量库 RAG**
- Me / 签到 / 主题色；练习记录 AI 点评；弱项临时包
- **`wrongSet`「再练这 N 道」真链路**（枚举预留；请求带 `source=wrongSet` → `400 VALIDATION_ERROR`）
- 后管写能力扩权；后管列表本期可不改（只读可后续展示 `source`）
- 临时建包；改 `WRONG_QUESTION_RATIO_MAX` / 先手式配额逻辑
- 复活 failed session；同步阻塞调 LLM（必须异步 session 机）

### 1.3 相对 #24

恢复 Figma `85:*` 底栏两入口 + 补后端契约；**非**新信息架构。答题/出题设置复用既有路由。

---

## 2. 认证、Base、错误外壳

- Base：现网 API，前缀 `/api`。
- 均需 `Authorization: Bearer <token>`（微信登录，见 `docs/wechat-login.md`）。
- 错误体：现网 `{ "code": ApiErrorCode, "message": string }`（`packages/shared/src/errors.ts`）。
- 本切片**不新增**错误码枚举值，复用：
  - `VALIDATION_ERROR`（400）
  - `NOT_FOUND`（404）
  - `UNAUTHORIZED`（401）
  - `PACK_UNAVAILABLE`（关联证书下架 / 包不可用）
  - `LLM_NOT_CONFIGURED`（503）
  - `LLM_UNAVAILABLE` / `LLM_INVALID_OUTPUT` / `QUIZ_GENERATION_FAILED`（会话 `failed` 时写入 `error.code`）
- 分页：错题列表仍最多 **100**；成绩列表仍 **`QUIZ_SCORE_LIST_LIMIT=50`** + `total`/`limit`/`hasMore`。本切片不改分页语义。

---

## 3. 枚举一次定全（U8）

### 3.1 会话来源 `QuizSessionSource`（新）

```ts
export const QUIZ_SESSION_SOURCES = [
  'normal',
  'retrain_similar',
  'variant',
  'wrongSet', // 预留：本切片创建时必须 400
] as const;
export type QuizSessionSource = (typeof QUIZ_SESSION_SOURCES)[number];
```

- 落库：`quiz_sessions.source`（新建列或写入 `settings`/`pack_snapshot` 旁路字段二选一；**推荐独立列** `text not null default 'normal'`，便于成绩筛选；迁移须向后兼容旧行 = `normal`）。
- `QuizSessionView` / `QuizScoreSummary` **增发** `source: QuizSessionSource`（旧客户端可忽略）。
- 成绩角标「变异」为 **P1 可选展示**，契约不强制 UI 文案；字段必须有。

### 3.2 题目来源 `QuestionSource`（扩展）

```ts
export const QUESTION_SOURCES = ['ai', 'wrong_carry', 'ai_variant'] as const;
```

- 普通 AI 出题 / 复练同类 AI 部分：`ai`
- 组卷带入未消灭错题：`wrong_carry`（复练同类仍可走既有 `takeWrongCarry`；变异卷 **禁止** wrong_carry，见 §5）
- 题型变异生成题：`ai_variant`

### 3.3 意图字段

- 请求体使用 **`source`**（与 U8 一致），**不再另造**并行 `intent` 枚举。
- 若客户端误传历史草案字段 `intent`：服务端 **忽略或映射**（若映射须与 `source` 一致；冲突 → `400 VALIDATION_ERROR`）。契约正典只认 `source`。

---

## 4. 错题本读模型补齐

### 4.1 `WrongBookItem`（列表 + 详情）

在现网字段上增加：

| 字段      | 类型       | 必填 | 说明                                                                      |
| --------- | ---------- | ---- | ------------------------------------------------------------------------- |
| `kpIds`   | `string[]` | 是   | 来自 `wrong_items.kp_ids`；无则 `[]`                                      |
| `kpNames` | `string[]` | 否   | 与 `kpIds` 等长优先；缺失名时该项可省略整字段或对应位置用空串；**仅展示** |

兼容：旧客户端忽略新字段。

### 4.2 接口

| 方法 | 路径                        | 变更                                                                                               |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| GET  | `/api/wrong-book`           | `items[]` 含 `kpIds`（及可选 `kpNames`）；query `status=pending\|cleared\|all` 不变；上限 100 不变 |
| GET  | `/api/wrong-book/:id`       | 同上；404 非本人 / 不存在                                                                          |
| POST | `/api/wrong-book/:id/clear` | **不变**；本切片不改消灭语义                                                                       |

列表/详情 SELECT **必须**取 `kp_ids`（现网用户侧 repository 缺口，本切片必修）。

---

## 5. `POST /api/quiz/sessions` 扩展

### 5.1 请求体（正典）

```ts
interface CreateQuizSessionRequest {
  packId: string;
  count: QuizCount; // 10|20|30|50；variant 时强制按 §5.3
  difficulty: QuizDifficulty;
  types: QuizTypeCode[]; // 至少一种；须 ⊆ 证书开放题型
  timer: QuizTimer;
  mode: QuizMode; // practice|exam；variant 见 §5.3
  source?: QuizSessionSource; // 缺省 = 'normal'
  knowledgePointIds?: string[]; // 会话级 KP 覆盖（U1）；仅 normal/retrain_similar 有意义
  wrongItemId?: string; // source=variant 时必填
}
```

HTTP **201** → `QuizSessionView`（`status=pending`，`paper=null`），并入队 `JOB_GENERATE_QUIZ`（`quiz.generate`），payload 仍 `{ userId, sessionId }`（Worker 从 session 读扩展字段）。

### 5.2 `source=normal`（现网默认）

- 行为与现网一致。
- 若带 `knowledgePointIds`：按 §5.4 会话覆盖校验；可观测性建议仍允许（产品入口主要用 `retrain_similar`）。
- 若带 `wrongItemId`：`400 VALIDATION_ERROR`（「wrongItemId 仅用于 variant」）。

### 5.3 `source=retrain_similar`（复练同类）

| 规则                                       | 值                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `knowledgePointIds`                        | **必填且非空**                                                                         |
| `wrongItemId`                              | 禁止                                                                                   |
| `mode`                                     | `practice` 或 `exam`（出题设置页用户可选；默认练习）                                   |
| `count` / `difficulty` / `types` / `timer` | 同现网校验                                                                             |
| Worker KP 集                               | **仅** `knowledgePointIds`（覆盖），**禁止**读整包 `pack_knowledge_points` 作为出题 KP |
| wrong_carry                                | **允许**（仍按现网比例，且 carry 的 KP 须与会话 KP 集有交）                            |

空/非法 KP → 创建期失败，见 §5.4 / §7（**禁止**静默整包）。

### 5.4 会话级 `knowledgePointIds` 校验（U1/U2）

1. 去重后长度 ≥ 1。
2. 每个 id：`knowledge_points.kind = 'knowledge_point'` 且 `status = 'online'`。
3. 每个 id 属于该 `packId` 对应证书树（与包同 `cert_id` 的上架 KP）；**推荐**进一步要求 id ∈ 该 pack 已绑 KP（更严、实现更简单）——**本契约钉死：须 ∈ 该 `packId` 的 `pack_knowledge_points`**。
4. 任一失败 → **不创建会话**，`400 VALIDATION_ERROR`，`message` 可展示（例：「没有可用的知识点，无法复练同类」）。
5. **禁止**失败时改用整包 KP 继续出题。
6. **禁止**写回 `packs` / `pack_knowledge_points` / 用户 activePack。

持久化建议：写入 `quiz_sessions` 旁路（独立列 `knowledge_point_ids uuid[]` 或 `settings.knowledgePointIds`）；Worker `loadContext` **优先**读此覆盖集。

### 5.5 `source=variant`（题型变异）

| 规则                   | 值                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `wrongItemId`          | **必填**；须本人、存在；建议允许 `pending`（已消灭也可变异练习，不强制）                                       |
| `packId`               | **必填**；须与错题 `certId` 同证书且包可用（未删、证书 online）                                                |
| `count`                | **强制 1**；请求其它值 → `400` 或静默夹紧为 1（**钉死：400 VALIDATION_ERROR**，避免客户端误解）                |
| `mode`                 | **强制 `practice`**；`exam` → `400`（U6）                                                                      |
| `types`                | 可选；若省略 = 证书白名单全开，Worker **优先异于原题型**（U3）；若传入则 ⊆ 白名单，Worker 在传入集合内优先异型 |
| `difficulty` / `timer` | 同现网；可默认 medium / 不计时                                                                                 |
| `knowledgePointIds`    | **忽略**；KP 集 = 错题快照 `kp_ids`（过滤 online 且 ∈ 该 pack）；若过滤后为空 → `400`（U2，创建期拒绝）        |
| wrong_carry            | **禁止**（变异卷仅 1 道 `ai_variant`）                                                                         |
| 题目 `source`          | `ai_variant`                                                                                                   |

**不提供**独立 `POST /api/wrong-book/:id/variant`（本切片统一走 create-session，减少双入口）。

### 5.6 `source=wrongSet`

- 本切片：**一律** `400 VALIDATION_ERROR`，`message` 含「暂未开放」类文案。
- 枚举与类型仍进 shared，供后续切片。

### 5.7 其它创建错误

| 条件                     | HTTP               | code                                             |
| ------------------------ | ------------------ | ------------------------------------------------ |
| body 校验失败 / 互斥字段 | 400                | `VALIDATION_ERROR`                               |
| pack 不存在 / 非本人     | 404 / 403 按现网   | 现网一致                                         |
| 证书下架                 | 现网创建期或生成期 | `PACK_UNAVAILABLE`                               |
| 无 LLM 且未 mock         | 503                | `LLM_NOT_CONFIGURED`（**不落会话**，与现网一致） |
| Redis 不可用             | 现网               | `REDIS_UNAVAILABLE`                              |

---

## 6. 既有会话 API（行为增量说明）

| 方法 | 路径                             | 本切片                                                                                   |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| GET  | `/api/quiz/sessions/:id`         | 响应含 `source`；progress/failed 语义不变                                                |
| POST | `/api/quiz/sessions/:id/cancel`  | 不变                                                                                     |
| POST | `/api/quiz/sessions/:id/start`   | 不变；`ready`→`in_progress`                                                              |
| POST | `/api/quiz/sessions/:id/answers` | 不变                                                                                     |
| POST | `/api/quiz/sessions/:id/submit`  | 见 §8 落库                                                                               |
| GET  | `/api/quiz/sessions`             | 成绩列表：**含** `retrain_similar` / `variant` 已交卷（U5）；每条增发 `source`；分页不变 |

状态机 **不变**：

`pending → generating → ready → in_progress → submitted`；旁路 `failed` / `cancelled`。

---

## 7. Worker 边界（≠ RAG）

### 7.1 队列

- 仍仅 `JOB_GENERATE_QUIZ` = `quiz.generate`。
- **禁止**为本切片新建 `quiz.variant` 队列（B 选项 C 否决）。
- Payload 不变；分支键 = session.`source`。

### 7.2 `normal` / `retrain_similar`

- 复用 `runQuizGeneration`；`retrain_similar` 时 KP 集 = 会话覆盖（§5.4）。
- Prompt：现网出题模板（U7 优先级）。
- 可含 wrong_carry（§5.3）。

### 7.3 `variant` 分支

1. 加载错题快照：`type/stem/options`（**用户 prompt 不得包含标准答案 `answer`**；`analysis` 默认不进 user，避免泄答）。
2. KP：错题 `kp_ids` ∩ online ∩ pack 绑定；空则 fail `QUIZ_GENERATION_FAILED` 或创建期已拦。
3. 目标题型：证书白名单（∩ 请求 types）；**优先 ≠ 原 `type`**；若白名单仅原题型一种，则允许同型但须换语境。
4. LLM：独立变异模板（U7）：
   - 代码内置 `BUILTIN_QUIZ_VARIANT_PROMPT`；
   - 可选 DB：`prompt_templates` 增加变异用途（建议 `templates.variant` 或 `scope` 旁注 `kind=variant`——实现选定一种并在 PR 说明；**证书覆盖优先于全局**）。
5. 指令硬约束（写入 system）：改写语境 / 可改题型；**不得**检索或引用教材全文 / 向量库 / 外部语料；题干不得与原题干相同；结构仍走 `parseAiQuestions`（count=1）。
6. 校验失败 → `LLM_INVALID_OUTPUT`；供应商失败 → `LLM_UNAVAILABLE`；均删题并 `failed`（与现网一致）。
7. 落库题目 `source='ai_variant'`；`kp_ids` = 所用 KP。
8. `LLM_MOCK=true`：mock 生成器须能产出 1 道合法变异题（题干含 session 盐，≠ 原 stem）。

### 7.4 重试

- 客户端「重试」= **再次** `POST /api/quiz/sessions`（新 id）；**禁止**对 `failed` 会话重新 claim 复活（与现网 `claimSession` 一致）。
- 取消：`POST .../cancel` 仅 `pending|generating`。

### 7.5 ≠ RAG 审计声明

本切片变异输入 **仅** 错题快照字段 + KP 名称/hint + 证书约束；**无**课件全文、**无**向量检索、**无**外部知识库。验收可 grep Worker 变异路径无 embedding / 课件表 join。

---

## 8. 作答落库规则（U4 / U5 / U6）

| 流                | 计入成绩列表          | 错题本写入（错/少选/未答）     | 全对消灭规则                                                                                               |
| ----------------- | --------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `normal`          | 是                    | 是（现规则）                   | 题干指纹消灭（现规则）                                                                                     |
| `retrain_similar` | 是                    | 是（现规则）                   | 同现规则                                                                                                   |
| `variant`         | **是（U5）**          | **是**（变异题自身可进错题本） | **答对变异题不得按原错题 id 清除**（U4）；仅当变异题题干指纹与某条错题完全一致时走现网指纹逻辑（通常不会） |
| `wrongSet`        | N/A（本切片不可创建） | —                              | —                                                                                                          |

- U4 钉死：**禁止**「同源清除」——即禁止 `UPDATE wrong_items SET status=cleared WHERE id = session.wrong_item_id` 仅因变异题答对。
- 用户仍可用详情「标记已消灭」手动 clear。
- `mode`：变异仅为 practice，无超时强制收卷义务之外的考试语义。

---

## 9. 客户端导航契约（非 HTTP，但属 C）

### 9.1 复练同类

```
/pages/wrong-book/detail → navigateTo
/pages/quiz/index?from=retrainSimilar&wrongItemId={id}&packId={packId}&kpIds={comma-separated}
```

- 设置页读取 query 预填 KP 展示；用户可改 count/difficulty/types/timer/mode 后点「AI 开始出题」。
- 提交 body：`source: 'retrain_similar'` + `knowledgePointIds`（来自预填，用户若在 UI 删光 KP → 按钮禁用，U2）。
- `packId`：优先用户当前同证书可用包；无包 → 引导选包/建包（不在本切片做弱项临时包）。

### 9.2 题型变异

```
详情 CTA → POST create session (source=variant)
→ navigateTo /pages/quiz/progress/index?sessionId=
→ ready 后 start → /pages/quiz/paper/index?sessionId=
```

- **禁止**在详情页内嵌答题。
- 失败态：progress 展示 `error.message` + 重试（重试回详情或直接再 POST）。

---

## 10. 文档与 shared 落地清单（全栈）

1. `packages/shared`：`WrongBookItem.kpIds`；`QUIZ_SESSION_SOURCES`；`QUESTION_SOURCES`+`ai_variant`；扩展 `CreateQuizSessionRequest` / `QuizSessionView` / `QuizScoreSummary`。
2. `docs/quiz.md`：增「复练同类 / 题型变异」两节；链到 `docs/contracts/...`。
3. API repository：wrong-book SELECT `kp_ids`；sessions 持久化 `source` / 覆盖 KP / `wrong_item_id`。
4. Worker：`runQuizGeneration` 分支；变异 Prompt；单测锁定「不写 pack」「空 KP 不静默」「答对变异不 clear 原 id」。
5. 契约测试：创建校验矩阵（§5）+ 变异 mock 成卷 + 成绩列表含 variant。

---

## 11. 全栈不得私改不申报声明

以下变更 **必须**先经架构师书面修订本契约（或辉当面改口）再合入：

- 路径、方法、请求/响应字段名与必填性
- `QuizSessionSource` / `QuestionSource` 枚举成员
- 错误码与 HTTP 映射语义
- 分页上限与 `hasMore` 语义
- 会话 KP 覆盖写回 pack 的任何行为
- 变异 count≠1、允许 exam、答对清除原错、引入 RAG/新队列
- 成绩列表排除 variant

实现细节（列名、是否独立 variant prompt 行）可在 PR 说明，但不得改变对外语义。

---

## 12. 验收要点（架构侧）

1. 详情两入口真链路（非 Toast）。
2. 复练：预填 KP 与错题一致；练习/试卷均可发。
3. 变异：1 题、practice、progress→paper；失败可再开；grep 无 RAG。
4. 空 KP：按钮禁用 + 文案；API 不静默整包。
5. 答对变异后原错题仍 `pending`（除非手动消灭）。
6. 成绩列表出现该 variant 会话且带 `source`。
7. CI 绿；合码仅辉。

---

_完 · C 接口契约 v0.1.0-C · 2026-11-04（Asia/Shanghai）· 未写业务代码 · 未 push GitHub_
