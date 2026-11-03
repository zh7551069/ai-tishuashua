# 后管课件

登录后的管理后台可以只读查看全站课件上传和提炼任务。接口在 `admin-gateway` 下，和帐密登录、目录维护、错题只读共用 `AdminSessionGuard`。微信用户 token 返回 `401` / `UNAUTHORIZED`。后管 token 也不能调用小程序的 `/api/courseware/jobs/:id`。

小程序上传、进度、取消和勾选回树不变，见 [课件](courseware.md)。后管这一页不重新上传、不取消别人的任务、不改提炼次数。仓库里没有这些写操作的要求，所以没有写接口。「免费终身 1 次提炼」配额仍然不做，上传接口不拦次数。

已登录的 `/api/admin/courseware` 走后管额度，不占用 `POST /api/courseware/uploads` 那一档。见 [限流](rate-limit.md)。

## 假设

- 一行是一次上传（`user_uploads.id`）。提炼任务按 `extract_jobs.upload_id` 左连接。表上有每个上传最多一条任务的唯一索引，创建上传时会同时写入任务。没有任务的上传仍会出现，`jobId` 为空。
- 详情按上传 id 查，不按任务 id。任务 id 在字段 `jobId` 里，方便和用户端 `GET /api/courseware/jobs/:id` 对照。
- 状态优先用提炼任务。任务和上传状态不一致时，跟用户端轮询到的任务状态走。没有任务时用上传自己的状态。
- 阶段、进度、预计分钟只在有任务时给出。`uploading` 表示文件已入库、等待学习，和用户端进度字段一致。后管文案是「已入库，等待学习」，不照搬小程序步骤条上的「上传文件」。没有任务时阶段为空，预计分钟为空，进度为 0。
- 默认 `status=all`。筛选只有表上已经有的字段：`userId`、`certId`、`status`（`pending`、`running`、`succeeded`、`failed`、`cancelled`、`all`）。用户按用户 id，证书按证书 id。没有单独的下拉接口。
- 排序按 `COALESCE(任务.updated_at, 上传.updated_at)` 从新到旧，相同时间再按上传 id。用户端没有全站列表，后管错题页也是按更新时间。
- 分页默认第 1 页、每页 20 条，每页最多 100 条，页码最大 10000。超出是 `400` / `VALIDATION_ERROR`，不是提炼配额。
- 列表是摘要：用户 id、昵称、领域、证书、文件名、扩展名、大小、状态、阶段、进度、预计分钟、是否已回树、草稿条数、错误码、上传时间和更新时间。不带草稿正文。
- 详情补上能读出来的草稿（名称、摘录、出题提示、id）、`extracted_kp_ids`、勾选过的草稿 id，以及错误码和说明。草稿不按状态隐藏。知识点只返回 id，不解析名称。
- `draftCount` 是库里 jsonb 数组的长度。详情里的 `drafts` 会丢掉缺 id 或缺名称的项，所以两者可能不一样。
- 文件元数据读不出来时，这一行仍在，文件名是「文件信息无法读取」。对象存储键和 `run_token` 不返回。
- 昵称来自 `users.nick`，可能为空。不返回微信 openId。
- `certificate_id` 为空的上传仍列出。证书名称为空时，页面显示「未关联证书」。按某张证书筛选时不包括它们。证书被删时上传会跟着删，正常数据走得到证书名。
- 错误码和说明优先用任务上成对的字段；任务没有成对错误时才用上传上的。只有一边有值时，摘要里的 `errorCode` 为空，和用户端进度一样。

## 接口

都需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

curl -sS "http://127.0.0.1:3000/api/admin/courseware?status=failed&page=1&pageSize=20" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/courseware?userId=用户uuid&certId=证书uuid&status=all" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3000/api/admin/courseware/上传uuid" \
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

没有符合条件的记录时 `items` 为空，`total` 为 0。页码超出已有记录时 `items` 为空，`total` 仍是符合筛选的条数。上传不存在返回 `404` / `NOT_FOUND`。

`POST /api/admin/courseware/:id/cancel` 没有这条路由。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「课件」。

1. 有记录时看到表格。没有记录，或筛选后没有记录，显示「没有符合条件的课件。」
2. 可以按用户 ID、证书 ID、提炼状态查询，也可以重置。详情里可以改成只看该用户或该证书。
3. 点「查看」打开进度、错误和提炼草稿。关闭后回到列表。
4. 请求失败时留在页面上，可以重试。会话失效会回到登录页。

证书与成绩页只读查看全站已交卷，见 [后管证书与成绩](admin-certificates.md)。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖查询参数：默认全部状态和分页、空白筛选、非法状态、UUID、页码，以及五种提炼状态。PostgreSQL 与 Redis 都能连上时，集成测试会插入两名用户的上传和任务，并检查：无会话和微信 token 被拒绝、后管 token 不能读小程序进度、按用户 / 证书 / 状态筛选、分页、任务状态优先于上传状态、没有任务的上传、坏文件元数据的文件名、详情里的草稿和知识点 id、响应里没有对象键、后管没有取消路由所以状态不变、小程序进度仍然只能看自己的。连不上就跳过，不把测试标成失败。
