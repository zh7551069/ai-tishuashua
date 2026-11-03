# 证书查询

小程序首页「证书」打开 `/pages/certificate/index`，读取 `GET /api/certificates`。这里看的是当前微信账号已经关联过的证书，不是选领域建刷题包时的目录，也不是后管维护的官方目录。

| 想做的事                   | 用哪个接口                                                                |
| -------------------------- | ------------------------------------------------------------------------- |
| 选领域后挑一张上架证书建包 | `GET /api/catalog/domains/:domainId/certificates`                         |
| 后管维护证书，含下架       | `/api/admin/catalog/*`，见 [后管改目录](admin-catalog.md)                 |
| 看每一次交卷的分数         | `GET /api/quiz/sessions`，小程序 `/pages/score`，见 [出题](quiz.md)       |
| 看自己关联过哪些证书       | `GET /api/certificates`                                                   |
| 后管只读看全站已交卷成绩   | `GET /api/admin/certificates`，见 [后管证书与成绩](admin-certificates.md) |

没有 `GET /api/certificates/scores`。逐次成绩用上面的 `GET /api/quiz/sessions`，不在证书路径下再挂一份，也不按证书把成绩汇总成另一套接口。后管「证书与成绩」用 `GET /api/admin/certificates`，见 [后管证书与成绩](admin-certificates.md)。证书页上的「最近一次」只是这一行里的摘要，点进去仍打开已有的试卷解析页。

## 哪些证书会出现

需要微信登录，`Authorization: Bearer <token>`。没有会话或会话失效是 `401` / `UNAUTHORIZED`。只返回这个用户自己的记录。下面四类只要占一类，这张证书就会出现，包括已下架的证书：

| 来源   | 表                            | 说明                                                                                         |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------- |
| 刷题包 | `packs.cert_id`               | 和后管判断「证书仍被引用」时认的包是同一类                                                   |
| 错题   | `wrong_items.cert_id`         | 未消灭和已消灭都算关联。`pendingWrongCount` 只数未消灭                                       |
| 课件   | `user_uploads.certificate_id` | 上传过课件就算，不要求提炼成功                                                               |
| 已交卷 | `quiz_sessions`               | 只认 `status = submitted`。优先用 `pack_snapshot.certId`；快照里没有证书时，再用还在的刷题包 |

后管删除证书时，刷题包、错题和课件会挡住删除。已交卷会话的证书写在快照里，没有外键，所以删包之后成绩仍可能对得上这张证书。对不上任何证书的快照（空对象、非法 id、已经不存在的证书）不会凭空造出一行。

没有刷题包、没有错题、没有课件、也没有能对上的交卷时，`items` 是空数组。种子里的证书不会因此全部出现。领域下架不把这些行藏起来。`unavailable` 只看证书自己是不是 `online`，和刷题包的算法一样，不另存一列。

排序按最近一次关联从新到旧：刷题包 `updated_at`、错题 `updated_at`、课件 `updated_at`、交卷 `submitted_at` 里较晚的那个。时间相同再按领域和证书的 `sort_order`、名称。

## 字段

`items` 里每一项：

| 字段                       | 含义                                                     |
| -------------------------- | -------------------------------------------------------- |
| `id`、`code`、`name`       | 证书                                                     |
| `domainId`、`domainName`   | 所属领域                                                 |
| `status`                   | `online` 或 `offline`                                    |
| `unavailable`              | `status !== online`                                      |
| `totalScore`、`passScore`  | 证书上的总分和及格线。及格线可以是 `null`                |
| `enabledQuestionTypeCodes` | 这张证书开放的题型                                       |
| `extraConstraint`          | 出题附加约束，没有时为 `null`                            |
| `packCount`                | 本人指向这张证书的刷题包数量                             |
| `activePackId`             | 本人当前包如果属于这张证书，就是那个包的 id，否则 `null` |
| `submittedCount`           | 能对上这张证书的已交卷次数                               |
| `pendingWrongCount`        | 本人这张证书下还未消灭的错题                             |
| `uploadCount`              | 本人挂在这张证书上的课件                                 |
| `latestScore`              | 最近一次已交卷的分数摘要；快照里没有数字分数时为 `null`  |

`latestScore` 有 `sessionId`、`earnedScore`、`totalScore`、`passed`、`submittedAt`。数字和 `passed` 都读当时写入的 `pass_snapshot`，不会按现在的及格线重算。`passed` 不是布尔值时记为 `null`。这不是 `QuizScoreSummary`，没有题目、模式、刷题包名和正确率。要看每一次交卷，用成绩列表。

## 调用

先按 [微信登录](wechat-login.md) 拿 token。下面假设 mock 已打开，Postgres 和 Redis 可用。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"cert-user","nick":"查证书"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS http://127.0.0.1:3000/api/certificates \
  -H "authorization: Bearer $TOKEN"
```

还没建过包、交过卷、留过错题或传过课件时，结果是 `{ "items": [] }`。响应里没有 `implemented`。

## 小程序

首页在刷题包加载完成后有「证书」，进入 `/pages/certificate/index`。

- 没有 token，或会话失效：停在本页，说明登录后才能看，并提供「去登录」
- 加载中、请求失败、空列表是分开的状态。失败可以重试
- 有数据时每张卡片显示领域、总分、及格线、题型、附加约束、刷题包数、交卷次数、未消灭错题、课件份数
- 证书已下架时卡片置灰，Badge 为「已下架」。还有刷题包时说明这些包只能删除
- 最近一次能读出分数时，点卡片进入 `/pages/quiz/paper/index?sessionId=`
- 当前包属于这张且未下架的证书时，可以「继续刷这张证书」
- 「查看成绩明细」进入已有的成绩页，不在这里重做逐次列表

## 限流

`GET /api/certificates` 和其它已登录小程序接口一样，按来源 IP 和 `userId` 计数。没有会话时先返回 401，这次不计数。见 [限流](rate-limit.md)。
