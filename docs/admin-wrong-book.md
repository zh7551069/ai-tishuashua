# 后管错题

登录后的管理后台可以只读查看全站错题。接口在 `admin-gateway` 下，和帐密登录、目录维护共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。后管 token 也不能调用小程序的 `/api/wrong-book`。

小程序错题本仍然只看当前用户，默认 `pending`，最多 100 条，消灭走 `POST /api/wrong-book/:id/clear`。见 [出题与交卷](quiz.md)。后管这一页不消灭、不删除。仓库里没有后管改错题的要求，所以没有写接口。

已登录的 `/api/admin/wrong-book` 走后管额度，见 [限流](rate-limit.md)。

## 假设

- 默认 `status=all`。运营要同时看到未消灭和已消灭。这和小程序默认只看未消灭不同。
- 筛选只有错题表上已经有的字段：`userId`、`certId`、`status`（`pending`、`cleared`、`all`）。用户按用户 id，证书按证书 id。没有单独的「有错题的用户 / 证书」接口，页面用输入框，不从目录再拉一份下拉。
- 排序与小程序列表相同：`updated_at` 从新到旧，相同时间再按 `id`。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。超出是 `400` / `VALIDATION_ERROR`，不是运营配额。
- 列表是摘要：用户 id、昵称、领域、证书、状态、错过次数、题型、题干、写入时间和更新时间。不带选项、答案和解析。
- 详情补上选项、答案、解析、分值和 `kpIds`。知识点只返回 `wrong_items.kp_ids`，不解析名称，避免把已经删掉或改名的知识点说成仍在树上。
- 昵称来自 `users.nick`，可能为空。不返回微信 openId。
- 快照读不出来时，题干是「题目内容无法读取」。读法和小程序错题本一致，实现是分开的，避免改动小程序接口。

## 接口

都需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS "http://127.0.0.1:3000/api/admin/wrong-book?status=pending&page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/wrong-book?userId=用户uuid&certId=证书uuid&status=all" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/wrong-book/错题uuid" \
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

没有符合条件的记录时 `items` 为空，`total` 为 0。页码超出已有记录时 `items` 为空，`total` 仍是符合筛选的条数。错题不存在返回 `404` / `NOT_FOUND`。

`POST /api/admin/wrong-book/:id/clear` 没有这条路由。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「错题」。

1. 有记录时看到表格。没有记录，或筛选后没有记录，显示「没有符合条件的错题。」
2. 可以按用户 ID、证书 ID、是否已消灭查询，也可以重置。详情里可以改成只看该用户或该证书。
3. 点「查看」打开题干、选项、答案和解析。关闭后回到列表。
4. 请求失败时留在页面上，可以重试。会话失效会回到登录页。

课件列表和证书与成绩页仍是空壳。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖查询参数：默认全部状态和分页、空白筛选、非法状态、UUID、页码。PostgreSQL 与 Redis 都能连上时，集成测试会插入两名用户的错题，并检查：无会话和微信 token 被拒绝、后管 token 不能读小程序错题本、按用户 / 证书 / 状态筛选、分页、坏快照的题干、详情里的答案和知识点 id、后管没有消灭路由所以状态不变、小程序错题本仍然只能看自己的。连不上就跳过，不把测试标成失败。
