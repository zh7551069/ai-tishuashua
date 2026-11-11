# 后管用户

登录后的管理后台可以只读查看全站用户摘要。接口在 `admin-gateway` 下，和帐密登录、目录维护、出题会话只读、错题只读、课件只读、证书与成绩只读共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。后管 token 也不能调用 `GET /api/users/me`。

这一页只读展示用户摘要，不能封禁、解封、改昵称或改手机号。`banned` 如果要改，只能改数据库，列表里只读展示。小程序设置页（`/pages/settings/index`）展示脱敏手机号，并用微信授权把 `code` 交给 `POST /api/users/me/phone`。「退出登录」只清除本机 token。见 [微信登录](wechat-login.md)。

已登录的 `/api/admin/users` 走后管额度。见 [限流](rate-limit.md)。

## 假设

- 一行是 `users` 里的一个用户。`id` 是用户 id。
- 默认 `status=all`，包含 `active` 和 `banned`。可以只看其中一种。
- 排序按 `created_at` 从新到旧，相同时间再按用户 id。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。超出是 `400` / `VALIDATION_ERROR`。
- 昵称按 Unicode 码位脱敏：空昵称是 `null`；一个字写成 `*`；两个字留第一个；更长的留头尾，中间最多三个 `*`。响应里没有 `users.nick` 原文。
- `phoneMasked` 只在 `users.phone_masked` 已经是脱敏号码时返回，例如 `138****8000`。没绑定，或库里的值不是这种格式，就返回 `null`，`phoneBound` 为 `false`。不返回完整号码。
- 不返回微信 openId、`unionId` 和头像。
- 详情和列表是同一份摘要。用户不存在是 `404` / `NOT_FOUND`。

## 接口

都需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS "http://127.0.0.1:3000/api/admin/users?status=all&page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/users?status=banned" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/users/用户uuid" \
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

没有符合条件的用户时 `items` 为空，`total` 为 0。`POST /api/admin/users/:id/ban` 没有这条路由。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「用户」。

1. 有用户时看到表格。没有记录，或筛选后没有记录，显示「没有符合条件的用户。」
2. 列表只显示脱敏昵称和脱敏手机。没有封禁列、没有导出、没有关键字检索。点昵称可以打开同一份摘要，状态只在详情里只读展示。页面上没有封禁按钮。接口仍接受 `status`，这一页不再放状态下拉。
3. 请求失败时留在页面上，可以重试。会话失效会回到登录页。

出题会话只读见 [后管出题会话](admin-quiz-sessions.md)。已交卷成绩见 [后管证书与成绩](admin-certificates.md)。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖查询参数和昵称脱敏。PostgreSQL 与 Redis 都能连上时，集成测试会插入一名正常用户和一名已封禁用户，并检查：无会话和微信 token 被拒绝、后管 token 不能读 `GET /api/users/me`、按状态筛选、昵称和手机号已脱敏、完整号码和 openId 不出现、没有封禁路由所以状态不变。连不上就跳过，不把测试标成失败。
