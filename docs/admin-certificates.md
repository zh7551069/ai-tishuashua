# 后管证书与成绩

登录后的管理后台可以只读查看全站已交卷成绩。接口在 `admin-gateway` 下，和帐密登录、目录维护、用户只读、出题会话只读、错题只读、课件只读共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。后管 token 也不能调用小程序的 `GET /api/quiz/sessions` 或 `GET /api/certificates`。

这一页不是下面任何一条：

| 想做的事                   | 用哪个接口                                                |
| -------------------------- | --------------------------------------------------------- |
| 小程序看自己关联过哪些证书 | `GET /api/certificates`，见 [证书查询](certificates.md)   |
| 小程序看自己每一次交卷     | `GET /api/quiz/sessions`，见 [出题与交卷](quiz.md)        |
| 后管维护领域、证书和知识点 | `/api/admin/catalog/*`，见 [后管改目录](admin-catalog.md) |
| 后管只读看全站已交卷       | `GET /api/admin/certificates`                             |

后管这一页不改分数、不删证书、不消灭错题、不取消出题。仓库里没有这些写操作的要求，所以没有写接口。未交卷的出题会话不在这一页，见 [后管出题会话](admin-quiz-sessions.md)。没有 `GET /api/certificates/scores`。

已登录的 `/api/admin/certificates` 走后管额度。见 [限流](rate-limit.md)。

## 假设

- 一行是一场已交卷（`quiz_sessions.status = submitted`）。`id` 是会话 id。未交卷、已取消或失败的会话不出现；拿它们的 id 查详情是 `404` / `NOT_FOUND`。
- 证书对法与小程序证书查询相同：优先用 `pack_snapshot.certId` 能对上的证书；快照对不上时，再用仍属于该用户的刷题包上的证书。两边同时存在时，快照优先。
- 对不上任何证书的已交卷仍列出。证书名称为空、快照里也没有证书名时，页面显示「未关联证书」。快照里还有证书名、但证书行已经不在时，页面显示快照名，并注明「证书已不在目录」。按某张证书筛选时不包括它们。
- 证书下架仍然列出。这一页不看 `online`。
- 默认 `mode=all`。筛选只有会话上已经有的字段：`userId`、`certId`（按上面的对法）、`mode`（`practice`、`exam`、`all`）。没有单独的下拉接口。这里的模式不是错题页的消灭状态，也不是出题会话的生成状态。
- 排序按 `submitted_at` 从新到旧，相同时间再按会话 id。没有交卷时间的排在后面。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。超出是 `400` / `VALIDATION_ERROR`，不是会员配额。
- 分数只读当时写入的 `pass_snapshot`，不重新判分，也不用 `quiz_sessions.score` 顶替。字段和交卷原因的读法与小程序成绩列表相同。读不出来时这一行仍在，`scoreReadable` 为 `false`，数字字段为 `null`，页面显示「成绩无法读取」。小程序成绩列表会丢掉这种行，后管保留，方便看到坏数据。
- 交卷原因优先用 `submit_reason`。这一列不合法时才用快照里的 `reason`。
- 列表是摘要：用户 id、昵称、领域、证书、快照证书名、刷题包、模式、来源、分数、及格、交卷原因和交卷时间。不带题目。
- 详情补上开始时间、错题 / 未答 / 少选计数，以及每题的题干、选项、当时的选择、答案、解析、分值和 `kpIds`。题目不重新判分，所以没有「正确 / 答错」这种现算结果。知识点只返回 id，不解析名称。
- 刷题包名称来自 `pack_snapshot.name`。快照读不出来或没有名称时，是「刷题包信息无法读取」。
- 昵称来自 `users.nick`，可能为空。不返回微信 openId、`run_token` 或出题设置。

## 接口

都需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS "http://127.0.0.1:3000/api/admin/certificates?mode=exam&page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/certificates?userId=用户uuid&certId=证书uuid&mode=all" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/certificates/会话uuid" \
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

没有符合条件的记录时 `items` 为空，`total` 为 0。页码超出已有记录时 `items` 为空，`total` 仍是符合筛选的条数。成绩不存在，或会话还没交卷，返回 `404` / `NOT_FOUND`。

`POST /api/admin/certificates/:id/score` 没有这条路由。`GET /api/certificates/scores` 也没有。小程序逐次成绩是 `GET /api/quiz/sessions`。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「证书与成绩」。

1. 有记录时看到表格。没有记录，或筛选后没有记录，显示「没有符合条件的成绩。」
2. 可以按用户 ID、证书 ID、练习或考试查询，也可以重置。详情里可以改成只看该用户或该证书。
3. 点「查看」打开当时的分数、选择和答案。关闭后回到列表。
4. 请求失败时留在页面上，可以重试。会话失效会回到登录页。

用户页只读查看脱敏摘要，见 [后管用户](admin-users.md)。未交卷的出题会话只读查看，见 [后管出题会话](admin-quiz-sessions.md)。错题页只读查看全站记录，见 [后管错题](admin-wrong-book.md)。课件页只读查看全站上传，见 [后管课件](admin-courseware.md)。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖查询参数：默认全部模式和分页、空白筛选、非法模式、UUID、页码，以及练习和考试。PostgreSQL 与 Redis 都能连上时，集成测试会插入两名用户的已交卷和一场未交卷，并检查：无会话和微信 token 被拒绝、后管 token 不能读小程序成绩或试卷、按用户 / 证书 / 模式筛选、快照证书优先于刷题包、对不上的证书不进筛选、分页、坏快照仍列出且分数为空、详情里的选择和答案、响应里没有 openId 和设置里的标记、后管没有改分路由所以分数不变、未交卷详情是 404 且状态不变、小程序成绩列表仍然只能看自己的、并且丢掉读不出的快照。连不上就跳过，不把测试标成失败。
