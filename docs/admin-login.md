# 管理后台登录

管理后台是独立 Web，用帐密登录，不走微信。`POST /api/admin/login` 校验 API 环境里的帐号，成功后在 Redis 写入不透明 token。浏览器把它放在 `Authorization: Bearer`，API 本身不保存登录态。

这不是 JWT。微信用户 token 打不开后管接口，后管 token 也打不开 `GET /api/users/me`。

登录成功返回不透明 token、签发时的到期时间和用户名。响应里没有 `implemented`。字段如下。

## 配置

帐号只放在 API 环境：仓库根目录 `.env`，或 `apps/api/.env`。不要写进 `apps/admin` 的 `VITE_` 变量，也不要写进小程序。

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tishuashua-admin
```

示例口令和数据库口令一样，只给本机。生产换成强口令，不要把 `.env` 提交进仓库。

两项都留空，或只填了一项，登录返回 `503` / `ADMIN_NOT_CONFIGURED`。代码里没有默认帐号。

环境变量会去掉首尾空白。请求里的用户名也会去掉首尾空白，口令按原样比对，大小写敏感。用户名最长 64，口令最长 128。

## 会话

|      | 微信用户                      | 后管                               |
| ---- | ----------------------------- | ---------------------------------- |
| 键   | `tishuashua:session:<token>`  | `tishuashua:admin-session:<token>` |
| 载荷 | `userId`                      | `kind: "admin"` 和 `username`      |
| 来源 | `POST /api/auth/wechat/login` | `POST /api/admin/login`            |

TTL 7 天。带对应 token 的请求会把 TTL 重新设为 7 天。响应里的 `expiresAt` 是签发时的到期时间，不会在每次请求后改写。

改 `ADMIN_USERNAME` 或 `ADMIN_PASSWORD` 不会作废已经签发的 token。`POST /api/admin/logout` 只删除当前这一个后管 token。

浏览器把 token、`expiresAt` 和用户名放在 `localStorage` 键 `tishuashua.admin.session`。口令不进浏览器存储。

## 接口

`POST /api/admin/login`

```json
{ "username": "admin", "password": "tishuashua-admin" }
```

成功 `200`：

```json
{
  "token": "不透明 token",
  "expiresAt": "2026-11-10T00:00:00.000Z",
  "admin": { "username": "admin" }
}
```

响应里没有口令，也没有 `implemented`。

`GET /api/admin/ping` 需要 `Authorization: Bearer <后管 token>`。成功：

```json
{ "ok": true, "admin": { "username": "admin" } }
```

`POST /api/admin/logout` 同样需要后管 token。成功是 `{ "ok": true }`，随后这个 token 不能再访问 ping。

`admin-gateway` 上除登录以外的路由都要后管会话。新的后管接口沿用这个控制器上的守卫即可。

## 错误码

| code                   | 何时                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`     | 缺少用户名或口令，类型不对，超长，或多传了未声明字段              |
| `ADMIN_NOT_CONFIGURED` | 没有配齐 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`                     |
| `UNAUTHORIZED`         | 用户名或口令不正确；没有后管会话；会话失效；拿微信 token 访问后管 |
| `REDIS_UNAVAILABLE`    | 帐号正确，但 Redis 未配置或不可用                                 |
| `RATE_LIMITED`         | 登录或已登录请求超过窗口。见 [rate-limit.md](rate-limit.md)       |

错误的用户名和错误的口令返回同一句「用户名或密码不正确」。微信 token 访问后管时也是 `UNAUTHORIZED`，因为后管键里没有它，不会把它当成已识别的用户再拒绝。

## 本地验证

先起 Redis。Postgres 不是后管登录的依赖。

```bash
pnpm deps:up
pnpm dev:api
```

错误口令：

```bash
curl -sS -D - -o /tmp/admin-login.json -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"wrong"}'
```

预期：`401`，`code` 为 `UNAUTHORIZED`。响应里没有 token，也没有口令。

正确口令（与 `.env` 里的值一致）：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}'
```

预期：`200`，含 `token`、`expiresAt`、`admin.username`。Redis 键是 `tishuashua:admin-session:<token>`。

带会话访问 ping：

```bash
curl -sS http://127.0.0.1:3000/api/admin/ping \
  -H "authorization: Bearer 上一步的 token"
```

预期：`200`，`ok` 为 `true`。

不带会话：

```bash
curl -sS -D - -o /tmp/admin-ping.json http://127.0.0.1:3000/api/admin/ping
```

预期：`401` / `UNAUTHORIZED`。

用微信登录拿到的 token 调用同一个 ping，也是 `401`。把后管 token 拿去调用 `GET /api/users/me`，同样是 `401`。

退出：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/admin/logout \
  -H "authorization: Bearer 上一步的 token"
```

预期：`200`，`{ "ok": true }`。再用这个 token 访问 ping 会 `401`。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>。没有会话时停在登录页。

1. 输入错误帐密，留在登录页，并看到接口返回的说明。
2. 输入 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，进入概览。概览会带会话请求 `GET /api/admin/ping`。
3. 刷新后仍停留在后台。
4. 点「退出」后回到登录页，原来的 token 失效。

登录后可以打开「目录」，维护领域、证书和知识点，见 [后管改目录](admin-catalog.md)。「用户」只读查看脱敏摘要，见 [后管用户](admin-users.md)。「错题」只读查看全站记录，见 [后管错题](admin-wrong-book.md)。「课件」只读查看全站上传和提炼任务，见 [后管课件](admin-courseware.md)。「出题会话」只读查看未交卷会话，见 [后管出题会话](admin-quiz-sessions.md)。「证书与成绩」只读查看全站已交卷，见 [后管证书与成绩](admin-certificates.md)。「题库（只读）」只读查看 AI 落库题目，见 [后管题库](admin-question-bank.md)。小程序证书查询见 [证书查询](certificates.md)。

## 测试

```bash
pnpm test
```

单元测试不连接 Redis：帐号是否配齐、错误帐密不签发会话、后管载荷和微信载荷的区分、守卫拒绝空 token。

集成测试在 `REDIS_URL` 可连接时跑完整链路：错误口令、正确口令写入 `tishuashua:admin-session:`、ping、无会话、微信会话 token 不能访问后管也不能被后管退出删掉、后管 token 不能访问 `/api/users/me`、退出后 ping 失败。连不上就跳过，不把测试标成失败。这条不需要 Postgres。

## 相关页面

用户只读见 [admin-users.md](admin-users.md)，出题会话只读见 [admin-quiz-sessions.md](admin-quiz-sessions.md)。目录维护见 [admin-catalog.md](admin-catalog.md)，错题只读见 [admin-wrong-book.md](admin-wrong-book.md)，课件上传只读见 [admin-courseware.md](admin-courseware.md)，证书与成绩只读见 [admin-certificates.md](admin-certificates.md)，免费用户题库优先见 [admin-system-settings.md](admin-system-settings.md)，题库只读见 [admin-question-bank.md](admin-question-bank.md)，限流见 [rate-limit.md](rate-limit.md)。
