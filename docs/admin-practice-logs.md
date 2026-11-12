# 后管练习记录与出题日志

登录后的管理后台可以只读查看已交卷练习记录，以及出题尝试日志。接口在 `admin-gateway` 下，和帐密登录共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。

这一页不是下面任何一条：

| 想做的事 | 用哪个接口 |
| --- | --- |
| 小程序看自己每一次交卷 | `GET /api/quiz/sessions`，见 [出题与交卷](quiz.md) |
| 后管只读看全站已交卷成绩，含 wrongSet 和题目快照 | `GET /api/admin/certificates`，见 [后管证书与成绩](admin-certificates.md) |
| 后管只读看未交卷会话 | `GET /api/admin/quiz-sessions`。`status=submitted` 仍是 `400` / `VALIDATION_ERROR`，文案仍是「已交卷不在出题会话里，请查看证书与成绩」 |
| 后管练习记录 | `GET /api/admin/practice-records` |
| 后管出题日志 | `GET /api/admin/quiz-generation-logs` |

没有改分接口。`/users`、`/wrong-book`、`/courseware` 仍然没有封禁、导出或关键字检索。

合码后要跑迁移 `016_admin_followup_tb12_logs.sql`。本文件不部署线上。

## 练习记录

数据源是 `quiz_sessions WHERE status='submitted'`。排序 `submitted_at DESC, id DESC`。

- 默认排除 `source=wrongSet`。`includeWrongSet=true` 时列表和详情才看得见 wrongSet。详情在默认规则下对 wrongSet 返回 `404` / `NOT_FOUND`。
- 可按 `userId`、`mode`（`practice` / `exam` / `all`）、`from` / `to`（按 `submitted_at`，可以只给一个）筛选。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。`pageSize=101` 是 `400` / `VALIDATION_ERROR`。
- 列表不返回题目快照，也不返回完整 `pack_snapshot` / `settings`。昵称走 `maskAdminNick`。
- `durationSeconds` 是 `submitted_at - started_at` 的整秒。任一为空，或结果为负，则为 `null`。
- 分数只读 `pass_snapshot`。读不出来时 `scoreReadable` 为 `false`，`score` / `totalScore` 为空。不拿 `quiz_sessions.score` 另算，也不改分。
- 详情在列表字段上补 `correctCount`、`wrongCount`、`partialCount`、`unansweredCount`、`accuracy`、`scoreRate`、`submitReason`。题目快照仍只在证书与成绩详情。

### 导出

`GET /api/admin/practice-records/export` 必须同时带 `from` 和 `to`。跨度按 Asia/Shanghai 自然日计算，含首尾，最多 31 日。缺时间、结束早于开始、跨度 32 日，都是 `400` / `VALIDATION_ERROR`。

`YYYY-MM-DD` 表示上海日历日：`from` 取当天 00:00，`to` 取当天 23:59:59.999。其它 ISO-8601 按瞬时。

命中超过 10000 行时 `400` / `VALIDATION_ERROR`，文案是「导出超过 10000 行，请缩小时间窗」。成功时 `Content-Type: text/csv; charset=utf-8`。列含会话 id、用户 id、脱敏昵称、模式、来源、得分、总分、是否通过、用时秒、包名、证书名、交卷时间。不导出手机、openId 和题目。

筛选与列表相同，默认仍排除 wrongSet。路由注册在 `/:id` 之前。

## 出题日志

表是 `quiz_generation_logs`。`runQuizGeneration` 在认领成功之后，于成功（`status=ready`）和失败出口另开 try/catch 追加一行。写失败只打服务端日志，不改原来的 `GenerationOutcome`。一次尝试一行。重试追加，不覆盖。不回填上线前的历史场次。取消或被其它 run 接走（`cancelled` / `skipped`）不记。

`usedBuiltin` 在选取模板时就算好：走 `BUILTIN_QUIZ_PROMPT` / `BUILTIN_QUIZ_VARIANT_PROMPT` 则为 `true`，`templateId` / `templateVersion` 为空，`templateCode` 为 `builtin`。之后模型失败也不把这一位改回 false。回落内置且组卷成功时 `success=true`，不算失败。

`error_message` 写入时截到 500 字。`request_summary` 只有 `count`、`types`、`difficulty`、`mode`、`source`、`generationStats`，不放 Prompt 正文或密钥。

wrongSet 真链路不走 `runQuizGeneration`。误入队失败时可以有一行失败日志。

列表：`GET /api/admin/quiz-generation-logs`。可按 `userId`、`success`（`true` / `false` / `all`，默认 `all`）、`usedBuiltin`（同样三态，默认 `all`）、`errorCode`（精确）、`from` / `to`（按 `created_at`）筛选。分页 20 / 100。排序 `created_at DESC, id DESC`。列表里的 `errorMessage` 再截到 120 字。

详情：`GET /api/admin/quiz-generation-logs/:id`。补上 `requestSummary` 和已截断的 `errorMessage`。不附 Prompt 正文。

导出：`GET /api/admin/quiz-generation-logs/export`。时间窗和 10000 行上限与练习记录相同。CSV 含会话 id、用户 id、脱敏昵称、证书名、templateCode、templateVersion、usedBuiltin、success、errorCode、durationMs、createdAt。不含 Prompt 正文。路由在 `/:id` 之前。

### 近 7 日失败率

`GET /api/admin/quiz-generation-logs/stats?days=7`。`days` 默认 7，只允许 1 到 31。

窗口起点是含今天在内的 N 个 Asia/Shanghai 自然日的 00:00。`days=7` 且此刻落在 2026-11-11 时，`since` 为 `2026-11-04T16:00:00.000Z`（2026-11-05 00:00 +08）。

| 字段 | 口径 |
| --- | --- |
| `attemptCount` | 窗口内的尝试行数，分母 |
| `failureCount` | `success=false` 的行数，分子 |
| `failureRate` | `failureCount / attemptCount`。没有尝试时为 `null`，工作台显示「—」。有尝试且没有失败时为 `0` |
| `builtinFallbackCount` | `used_builtin=true` 的行数，不论成败 |

纯回落内置且出题成功会计入 `attemptCount` 和 `builtinFallbackCount`，不计入 `failureCount`。

## 管理后台

```bash
pnpm --filter @tishuashua/shared build
pnpm dev:api
pnpm dev:admin
```

API 进程启动时会自己跑未执行的迁移，其中包含 `016_admin_followup_tb12_logs.sql`。不要在这台机器上对线上库执行迁移。

打开 <http://127.0.0.1:5173>。

1. 练习记录默认看不到 wrongSet。勾选「包含 wrongSet」后再查询，列表和详情才出现。
2. 点「导出 CSV」前必须填开始和结束日期。超过 31 个自然日会停在页面上，不会拉全表。
3. 出题日志可以按成败和「回落内置」筛选。回落且成功显示成功，不写成出题失败。
4. 工作台「近 7 日出题失败率」读 stats。没有日志时是「—」。
5. 用户、错题库、用户上传教材仍是只读，没有封禁和导出。
6. 请求失败可以重试。会话失效回到登录页。

## 测试

```bash
pnpm --filter @tishuashua/shared build
pnpm --filter @tishuashua/api exec node --import tsx --test --test-reporter=spec \
  src/admin-practice-records/*.test.ts \
  src/admin-quiz-generation-logs/*.test.ts \
  src/admin-quiz-sessions/*.test.ts
```

覆盖默认排除 wrongSet、日志 INSERT 失败不改写出题结果、导出时间窗、分页上限，以及失败率口径。
