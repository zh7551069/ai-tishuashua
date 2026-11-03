# 后管证书与成绩

登录后的管理后台可以只读查看全站「用户与证书的关联」，以及全站已交卷成绩。接口在 `admin-gateway` 下，和帐密登录、目录维护、错题只读、课件只读共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。后管 token 也不能调用小程序的 `GET /api/certificates` 或 `GET /api/quiz/sessions`。

小程序证书查询仍然只看当前用户，见 [证书查询](certificates.md)。小程序成绩列表仍然只看当前用户已交卷、且快照能读出的摘要，最多 50 条，见 [出题与交卷](quiz.md)。`GET /api/certificates/scores` 仍是占位，不是这两份列表。

后管这一页不改成绩、不删会话、不改证书关联、不改及格线。仓库里没有这些写操作的要求，所以没有写接口。官方目录的增删改仍在「目录」，见 [后管改目录](admin-catalog.md)。

已登录的 `/api/admin/certificate-links` 和 `/api/admin/scores` 走后管额度，见 [限流](rate-limit.md)。

## 假设

- 页面有两个列表。「证书关联」是默认页。一行是一名用户和一张证书，不是目录里的证书主数据。
- 关联来源和小程序证书卡相同：该用户的刷题包、错题（未消灭和已消灭都算）、`certificate_id` 不为空的课件，以及 `status = submitted` 且能对上现存证书的会话。会话优先用 `pack_snapshot.certId`；快照里的证书已经不存在时，再用还在的刷题包。对不上任何证书的会话不会造出关联行。
- 关联字段对齐证书卡，并加上 `userId`、`userNick` 和 `touchedAt`。`touchedAt` 是四类来源时间里较晚的那个，排序也用它，然后是领域和证书的 `sort_order`、证书名、用户 id。详情再补上每个来源自己的最近时间。四个计数都是 0 时，这一行只可能来自已消灭错题，页面写成「已消灭错题」。
- 下架证书仍出现。`unavailable` 只看证书自己是不是 `online`。领域下架不把行藏起来。
- `latestScore` 用证书卡的读法：最近一次已交卷只要能读出得分和总分就显示，不按现在的及格线重算。这和成绩列表「是否可读」不是同一条规则。
- 成绩一行是一次 `quiz_sessions.status = submitted`。未交卷不出现。不设 50 条上限，改为分页。小程序列表的 50 条上限不变。
- 成绩的 `certName`、`packName`、分数、正确率、得分率、及格和交卷原因对齐 `QuizScoreSummary`。证书名和刷题包名只读交卷快照，不改成现在的名称。`submit_reason` 是 `manual` 或 `timeout` 时用这一列，否则用快照里的原因。
- `certId`、`domainId`、`resolvedCertName` 用和关联相同的对证书方法。快照对不上现存证书时这些字段为空，但只要快照里有名字，`certName` 仍在。按证书或领域筛选时不包括对不上的会话；不筛选时它们仍在列表里。
- 快照读不出成绩摘要时，小程序成绩列表会丢掉这一行。后管保留它，`readable` 为 false，数字为 null。页面显示「成绩无法读取」。
- 筛选只有表上和关联规则里已经有的字段：`userId`、`certId`、`domainId`。成绩还可以按 `mode`（`practice`、`exam`、`all`）。时间是闭区间，关联用 `touchedFrom` / `touchedTo`，成绩用 `submittedFrom` / `submittedTo`，传 ISO 8601。没有单独的下拉接口，页面用输入框。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。超出是 `400` / `VALIDATION_ERROR`。
- 成绩详情补上错题、未作答、少选，以及开考和创建时间。不含题目、选项和解析。那是出题会话页，这一期不做。
- 昵称来自 `users.nick`，可能为空。不返回微信 openId。

## 接口

都需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS "http://127.0.0.1:3000/api/admin/certificate-links?page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/certificate-links?userId=用户uuid&certId=证书uuid&domainId=领域uuid" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/certificate-links/用户uuid/证书uuid" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/scores?mode=exam&page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/scores/会话uuid" \
  -H "authorization: Bearer $TOKEN"
```

两个列表的响应形状一样：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

没有符合条件的记录时 `items` 为空，`total` 为 0。页码超出已有记录时 `items` 为空，`total` 仍是符合筛选的条数。关联不存在或成绩不存在（含未交卷）返回 `404` / `NOT_FOUND`。

没有修改成绩、删除会话或修改关联的路由。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「证书与成绩」。

1. 默认是「证书关联」。有记录时看到表格。没有记录，或筛选后没有记录，显示「没有符合条件的证书关联。」
2. 「已交卷成绩」同样有表格、空态和失败重试。
3. 可以按用户 ID、证书 ID、领域 ID 和时间查询，成绩还可以按练习或考试。也可以重置。详情里可以改成只看该用户、该证书或该领域，也可以跳到另一栏并带上这组筛选。
4. 点「查看」打开详情。关闭后回到列表。
5. 请求失败时留在页面上，可以重试。会话失效会回到登录页。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖查询参数：默认分页、空白筛选、UUID、时间区间、模式、页码。也覆盖成绩快照：完整快照、缺原因或分数时读不出、证书名和刷题包名只取快照。

PostgreSQL 与 Redis 都能连上时，集成测试会插入两名用户的刷题包、错题、课件和已交卷会话，并检查：无会话和微信 token 被拒绝、后管 token 不能读小程序证书或成绩、成绩占位仍是 `implemented: false`、按用户 / 证书 / 领域 / 时间筛选、分页、下架证书仍在、空结果、关联详情与小程序证书卡字段一致、读不出的快照仍留在后管成绩里但小程序成绩列表没有它、未交卷不出现、快照证书名和现存证书名分开、对不上证书的会话没有 `certId`、刷题包已经删掉时仍能靠快照对上、空快照靠还在的刷题包对上、交卷原因优先用会话上的 `submit_reason`、后管没有写路由所以及格线和成绩快照不变、小程序成绩列表仍然只能看自己的。连不上就跳过，不把测试标成失败。
