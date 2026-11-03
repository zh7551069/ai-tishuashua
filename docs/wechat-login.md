# 微信登录切片

小程序只用微信登录。流程是：`Taro.login` 拿到 `code` → `POST /api/auth/wechat/login` → 服务端调用微信 `jscode2session` → 按 `openId` 注册或登录 → 签发不透明 token，会话写入 Redis。带 `Authorization: Bearer <token>` 可以访问 `GET /api/users/me`。

本期没有短信登录、游客、其他 OAuth。后管帐密不走这条链路，见 [admin-login.md](admin-login.md)。手机号不是登录必填项；用户表有 `phone_masked`，未授权时为 `null`。刷题包见 [packs.md](packs.md)。

## 本地依赖

```bash
pnpm deps:up
```

PostgreSQL `127.0.0.1:5432`，Redis `127.0.0.1:6379`，库名、用户名、密码都是 `tishuashua`。API 启动时会执行 `apps/api/migrations`。用户表之外的目录和刷题包见 [packs.md](packs.md)。

没有 Docker 时，API 仍能启动；登录会返回 `DATABASE_UNAVAILABLE` 或 `REDIS_UNAVAILABLE`。`GET /api/health` 不依赖它们。

## 配置

复制 `.env.example` 为仓库根目录 `.env`，或复制 `apps/api/.env.example` 为 `apps/api/.env`。不要提交 `.env`，不要写入真实密钥。

真实小程序：

```bash
WECHAT_APP_ID=你的小程序 AppId
WECHAT_APP_SECRET=你的小程序 AppSecret
WECHAT_LOGIN_MOCK=false
```

`AppSecret` 只放在 API。小程序环境只有 `TARO_APP_API_BASE` 和可选的 `TARO_APP_ID`。

没有真实密钥时，显式打开 mock（默认关闭）：

```bash
WECHAT_LOGIN_MOCK=true
```

值为 `true` 或 `1` 才生效，`yes` / `false` 都不会打开。mock 不请求微信。同一个 `code` 会得到稳定的 `openId`（`mock_` + SHA-256 前 24 位十六进制），因此重复登录会命中同一个用户。

约定的失败码只在 mock 打开时生效：

| code            | 结果                       |
| --------------- | -------------------------- |
| `mock-fail`     | `401` `WECHAT_AUTH_FAILED` |
| `mock-upstream` | `502` `WECHAT_UNAVAILABLE` |
| 其他非空字符串  | 按 openId 注册或登录       |

生产环境不要设置 `WECHAT_LOGIN_MOCK`。mock 优先于已填写的 AppId/Secret，打开后不会调用微信。

## 验证

```bash
pnpm dev:api
```

未配置且未开 mock：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"demo"}'
```

预期：`503`，`code` 为 `WECHAT_NOT_CONFIGURED`。

打开 mock 且 Postgres、Redis 可用：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"dev-user-1","nick":"备考同学"}'
```

预期：`200`，响应含 `token`、`expiresAt`、`user`。`user` 含 `id`、`wxOpenId`、`unionId`、`nick`、`phoneMasked`、`avatar`、`status`。响应里没有 `session_key`，也没有 `implemented: false`。

再用 token：

```bash
curl -sS http://127.0.0.1:3000/api/users/me \
  -H "authorization: Bearer 上一步的 token"
```

同一 `code` 再登录一次，`user.id` 不变；不传 `nick` 时保留已有昵称。会话键是 `tishuashua:session:<token>`，TTL 7 天，带 token 的请求会顺延。`expiresAt` 是签发时的到期时间。

错误码：

| code                    | 何时                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `VALIDATION_ERROR`      | 缺少 `code`，或多传了未声明字段（例如手机号）                |
| `WECHAT_NOT_CONFIGURED` | 没有 AppId/Secret 且 mock 关闭，或微信返回 AppId/Secret 无效 |
| `WECHAT_AUTH_FAILED`    | code 无效或已使用                                            |
| `WECHAT_UNAVAILABLE`    | 微信超时、非 JSON 或其它上游错误                             |
| `DATABASE_UNAVAILABLE`  | 数据库未配置或不可用                                         |
| `REDIS_UNAVAILABLE`     | Redis 未配置或不可用                                         |
| `UNAUTHORIZED`          | 没有 token，或 token 已失效                                  |
| `FORBIDDEN`             | 用户 `status` 为 `banned`                                    |
| `RATE_LIMITED`          | 登录或已登录请求超过窗口。见 [rate-limit.md](rate-limit.md)  |

## 小程序

```bash
pnpm dev:mini
```

用微信开发者工具打开 `apps/mini`（`miniprogramRoot` 为 `dist/`）。未登录时第一页是落地页：

1. 可选填昵称。
2. 点「微信一键登录」。开发者工具里 `Taro.login` 会给出 code；API 需已打开 mock 或配好微信密钥。
3. 成功后看到昵称、头像是否同步、手机号「未授权，稍后在设置中补全」，再点「开始备考」进入首页。没有刷题包时从首页去选领域。
4. 取消或失败留在落地页，可以重试。
5. 《用户协议》和《隐私政策》打开的是小程序里的正文页，不是空占位。

已有有效 token 时，再次进入登录页会直接到首页。首页在 token 失效时会回到落地页。

## 测试

```bash
pnpm test
```

单元测试不访问微信、Postgres 或 Redis：mock 开关、`jscode2session` 的 HTTP 替身（断言丢弃 `session_key` 且错误信息不含 AppSecret）、用户 upsert 语义、鉴权守卫。

集成测试在 `DATABASE_URL` 和 `REDIS_URL` 可连接时跑完整链路：`code` → `users` upsert → Redis 会话 → `GET /api/users/me`。连不上就跳过，不把测试标成失败。CI 会起 PostgreSQL 16 和 Redis 7，因此这条会在 CI 里执行。

## 和架构 v0.2 的差异

- 会话是 Redis 里的不透明 token，不是 JWT。任务要求会话落 Redis；JWT 本身不需要把会话写进 Redis。
- 用户表用已有的 `pg` 执行 SQL 迁移，没有引入 ORM。目录和刷题包在后续迁移里，不改登录这条链路。
- 脚手架里的 Taro 是 4.3，架构文本写的是 Taro 3。这里沿用仓库里的 Taro 4，没有降级。
- `code2session` 不返回昵称、头像、手机号。昵称和头像由客户端可选上送。手机号授权（`getPhoneNumber`）留到设置补全，登录不强制。
