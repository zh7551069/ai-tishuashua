# 微信登录切片

小程序只用微信登录。流程是：`Taro.login` 拿到 `code` → `POST /api/auth/wechat/login` → 服务端调用微信 `jscode2session` → 按 `openId` 注册或登录 → 签发不透明 token，会话写入 Redis。带 `Authorization: Bearer <token>` 可以访问 `GET /api/users/me`。

本期没有短信登录、游客、其他 OAuth。后管帐密不走这条链路，见 [admin-login.md](admin-login.md)。手机号不是登录方式，也不能用短信验证码登录。已登录用户在设置页做微信手机号授权，API 用 `getPhoneNumber` 的 `code` 向微信换号，只把脱敏值写入 `phone_masked`。未授权时 `phoneMasked` 为 `null`，`phoneBound` 为 `false`。刷题包见 [packs.md](packs.md)。

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

值为 `true` 或 `1` 才生效，`yes` / `false` 都不会打开。mock 不请求微信，登录和手机号授权都走它。同一个 `code` 会得到稳定的 `openId`（`mock_` + SHA-256 前 24 位十六进制），因此重复登录会命中同一个用户。

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

预期：`200`，响应含 `token`、`expiresAt`、`user`。`user` 含 `id`、`wxOpenId`、`unionId`、`nick`、`phoneMasked`、`phoneBound`、`avatar`、`status`。新用户的 `phoneBound` 为 `false`，`phoneMasked` 为 `null`。响应里没有 `session_key`，也没有 `implemented: false`。

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
| `WECHAT_AUTH_FAILED`    | 登录 code 或手机号授权 code 无效、已使用                     |
| `WECHAT_UNAVAILABLE`    | 微信超时、非 JSON 或其它上游错误                             |
| `DATABASE_UNAVAILABLE`  | 数据库未配置或不可用                                         |
| `REDIS_UNAVAILABLE`     | Redis 未配置或不可用                                         |
| `UNAUTHORIZED`          | 没有 token，或 token 已失效                                  |
| `FORBIDDEN`             | 用户 `status` 为 `banned`                                    |
| `RATE_LIMITED`          | 登录或已登录请求超过窗口。见 [rate-limit.md](rate-limit.md)  |

## 设置里绑定手机号

这不是登录，也不是短信验证码。调用前必须已经有微信会话。小程序按钮使用 `open-type="getPhoneNumber"`（Taro 写作 `openType="getPhoneNumber"`），把回调里的 `detail.code` 交给：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/users/me/phone \
  -H 'content-type: application/json' \
  -H "authorization: Bearer 登录得到的 token" \
  -d '{"code":"mock-phone-13800138000"}'
```

`WECHAT_LOGIN_MOCK=true` 时不会请求微信。手机号 mock 约定：

| code                            | 结果                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `mock-fail`                     | `401` `WECHAT_AUTH_FAILED`，不改已保存的号码               |
| `mock-upstream`                 | `502` `WECHAT_UNAVAILABLE`                                 |
| `mock-phone-` 加 7 到 15 位数字 | 绑定这个号码。响应里只有脱敏值，例如 `138****8000`         |
| `mock-phone-` 加不合法数字      | `401` `WECHAT_AUTH_FAILED`                                 |
| 其他非空字符串                  | 按 code 得到稳定的 11 位测试号，开发者工具里可以直接点授权 |

成功时 `200`，响应就是用户摘要：`phoneBound` 为 `true`，`phoneMasked` 形如 `138****8000`。响应和 `users.phone_masked` 都不含完整手机号。同一用户再次授权会覆盖脱敏值。没有 token，或 token 不是微信会话，返回 `401` `UNAUTHORIZED`。`code` 为空，或带了未声明字段，返回 `400` `VALIDATION_ERROR`（要先通过会话校验才会看到 body 错误）。

真实微信（mock 关闭且已配置 AppId/Secret）时，服务端先用 `client_credential` 取 `access_token`（只缓存在当前进程），再 `POST https://api.weixin.qq.com/wxa/business/getuserphonenumber`。`access_token`、AppSecret 和完整手机号都不进日志，也不进响应。

`GET /api/users/me` 同样返回 `phoneBound` 和 `phoneMasked`。

## 小程序

```bash
pnpm dev:mini
```

用微信开发者工具打开 `apps/mini`（`miniprogramRoot` 为 `dist/`）。未登录时第一页是落地页：

1. 可选填昵称。不填会显示为「微信用户」。昵称只在这次登录提交，设置页不能改；要填写或更换需退出后重新登录并在登录页填写，留空会保留已有昵称。小程序不上传头像。
2. 点「微信一键登录」。开发者工具里 `Taro.login` 会给出 code；API 需已打开 mock 或配好微信密钥。
3. 成功后看到昵称和手机号是否已绑定，不展示头像同步状态。点「开始备考」进入首页。手机号可稍后在「我」里的设置页补全，退出登录也在设置页。没有刷题包时从首页去选领域。
4. 取消或失败留在落地页，可以重试。
5. 《用户协议》和《隐私政策》打开的是小程序里的正文页，按当前已保存的数据说明用途，不是空占位。

已有有效 token 时，再次进入登录页会直接到首页。首页在 token 失效时会回到落地页。首页头像「我」和选领域页的「我」进入 `/pages/me/index`，个人中心再进 `/pages/settings/index`。设置页展示只读昵称、说明不上传头像、脱敏手机号和是否已绑定，并用微信手机号按钮把授权 `code` 交给 `POST /api/users/me/phone`。用户拒绝授权时留在设置页。手机号凭证无效不会清掉当前登录。「退出登录」只执行 `clearToken()` 并回到落地页，不调用服务端注销接口（微信用户没有 logout API），也不删除账号、刷题记录、错题、课件、成绩或脱敏手机号。服务端会话仍要等到 Redis TTL 到期。账号注销尚未开放。

## 测试

```bash
pnpm test
```

单元测试不访问微信、Postgres 或 Redis：mock 开关、`jscode2session` 的 HTTP 替身（断言丢弃 `session_key` 且错误信息不含 AppSecret）、手机号 mock 与 `getuserphonenumber` 替身（断言不回传完整号码和 AppSecret）、脱敏、绑定成功与坏凭证、用户 upsert 语义、鉴权守卫。

集成测试在 `DATABASE_URL` 和 `REDIS_URL` 可连接时跑完整链路：`code` → `users` upsert → Redis 会话 → `GET /api/users/me`，以及未登录不能绑定、mock 绑定成功、坏凭证不改已保存的脱敏号。连不上就跳过，不把测试标成失败。CI 会起 PostgreSQL 16 和 Redis 7，因此这条会在 CI 里执行。未登录绑定不依赖数据库，会一直执行。

## 和架构 v0.2 的差异

- 会话是 Redis 里的不透明 token，不是 JWT。任务要求会话落 Redis；JWT 本身不需要把会话写进 Redis。
- 用户表用已有的 `pg` 执行 SQL 迁移，没有引入 ORM。用户表在 `001_users.sql`；目录、刷题包、出题、错题和课件在 `002` 及之后的迁移，不改登录这条链路。
- 仓库使用 Taro 4.3，架构文本写的是 Taro 3。这里沿用仓库里的 Taro 4，没有降级。
- `code2session` 不返回昵称、头像、手机号。接口仍接受可选 `nick` 和 `avatar`。当前小程序只在登录时提交昵称，不上传头像。手机号用设置页的 `getPhoneNumber` 单独授权，登录不强制，也不是短信登录。微信用户没有服务端 logout；设置页退出只清本机 token。
