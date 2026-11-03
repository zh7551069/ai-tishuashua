# 后管出题会话

登录后的管理后台可以只读查看全站未交卷的出题会话。接口在 `admin-gateway` 下，和帐密登录共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。后管 token 也不能调用小程序的 `GET /api/quiz/sessions`。

这一页不是下面任何一条：

| 想做的事                 | 用哪个接口                                                    |
| ------------------------ | ------------------------------------------------------------- |
| 小程序看自己每一次交卷   | `GET /api/quiz/sessions`，见 [出题与交卷](quiz.md)            |
| 后管只读看全站已交卷成绩 | `GET /api/admin/certificates`，见 [后管证书与成绩](admin-certificates.md) |
| 后管只读看未交卷会话     | `GET /api/admin/quiz-sessions`                                |

这里不显示题目、答案和分数，不取消出题，也不改状态。已交卷的成绩留在「证书与成绩」。

已登录的 `/api/admin/quiz-sessions` 走后管额度。见 [限流](rate-limit.md)。

## 假设

- 一行是一场未交卷的 `quiz_sessions`。状态只有 `pending`、`generating`、`ready`、`in_progress`、`cancelled`、`failed`。`submitted` 不出现。
- 默认 `status=all`，表示上面这六种。传 `submitted` 是 `400` / `VALIDATION_ERROR`，提示去证书与成绩。
- 还可以按 `userId`、`mode`（`practice`、`exam`、`all`）筛选。没有单独的下拉接口。
- 排序按 `created_at` 从新到旧，相同时间再按会话 id。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。超出是 `400` / `VALIDATION_ERROR`。
- 列表是摘要：用户 id、脱敏昵称、刷题包和证书快照名、模式、状态、来源、进度、错误、创建和开始时间。不带题目。
- 刷题包名称和证书名来自 `pack_snapshot`，不对照现在的目录。快照没有名称时是「刷题包信息无法读取」。
- 详情补上能读出的出题设置（题量、难度、题型、计时、模式）和考试截止时间。设置缺字段或计时不合法时 `settingsReadable` 为 `false`，`settings` 为 `null`，不回传原始 JSON。
- 不返回 `run_token`、分数、`pass_snapshot`、题目、答案和解析。
- 拿已交卷的 id 查详情是 `404` / `NOT_FOUND`，说明这场已经交卷。会话不存在是另一句「出题会话不存在」。两种都不带分数。

## 接口

都需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS "http://127.0.0.1:3000/api/admin/quiz-sessions?status=all&mode=all&page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/quiz-sessions?userId=用户uuid&status=in_progress&mode=exam" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/quiz-sessions/会话uuid" \
  -H "authorization: Bearer $TOKEN"
```

列表响应：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

没有符合条件的会话时 `items` 为空，`total` 为 0。`POST /api/admin/quiz-sessions/:id/cancel` 没有这条路由。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「出题会话」。

1. 有未交卷会话时看到表格。没有记录，或筛选后没有记录，显示「没有符合条件的出题会话。」
2. 可以按用户 ID、练习或考试、未交卷状态查询，也可以重置。详情里可以改成只看该用户。
3. 点「查看」打开进度、错误和出题设置。关闭后回到列表。页面上没有取消按钮。
4. 请求失败时留在页面上，可以重试。会话失效会回到登录页。

已交卷成绩见 [后管证书与成绩](admin-certificates.md)。用户摘要见 [后管用户](admin-users.md)。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖查询参数，以及设置、快照、进度、错误和截止时间的读法。PostgreSQL 与 Redis 都能连上时，集成测试会插入未交卷和一场已交卷，并检查：无会话和微信 token 被拒绝、后管 token 不能读小程序成绩或试卷、已交卷不进列表、按用户 / 模式 / 状态筛选、分页、坏设置不回传原文、详情里没有题目和 `run_token`、已交卷详情是 404 且不带分数、没有取消路由所以状态不变、小程序成绩列表仍然只能看自己的已交卷。连不上就跳过，不把测试标成失败。
