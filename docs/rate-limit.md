# API 限流

API 用 Redis 固定窗口计数。超限返回 `429`，响应体是 `{ "code": "RATE_LIMITED", "message": "请求过于频繁，请稍后再试" }`，并带 `Retry-After`（秒）。这和现有错误体一样，只有 `code` 和 `message`。

窗口内最多 N 次。第 N+1 次才拒绝。计数键是 `tishuashua:ratelimit:<scope>:<subject>`，和微信会话 `tishuashua:session:`、后管会话 `tishuashua:admin-session:` 分开。

出题判分、交卷、错题本、成绩列表和课件提炼的业务规则没有改。下面的次数只决定这一次请求会不会在进业务之前被拒绝。

## 谁被计数

鉴权守卫先于限流。没有会话、会话失效时仍是 `401` / `UNAUTHORIZED`，这次失败不计数。登录接口和证书占位没有这层守卫，每次都会计数。

`OPTIONS` 预检、`GET /api/health`、`GET /api/health/ready` 和 `/api/docs` 不计。

| 请求                                                             | 钥匙                              | 默认 / 60 秒     |
| ---------------------------------------------------------------- | --------------------------------- | ---------------- |
| `POST /api/auth/wechat/login`                                    | 来源 IP                           | 60               |
| `POST /api/admin/login`                                          | 来源 IP，以及用户名哈希，各算一份 | 各 30            |
| 已登录的小程序接口                                               | 来源 IP，以及 `userId`，各算一份  | IP 600，用户 300 |
| `POST /api/quiz/sessions`                                        | 在上面之外，再按 `userId` 计一档  | 60               |
| `POST /api/courseware/uploads`                                   | 在上面之外，再按 `userId` 计一档  | 40               |
| 已登录的 `/api/admin/*`（不含登录）                              | 来源 IP，以及后管用户名，各算一份 | IP 240，用户 120 |
| `GET /api/certificates`、`/scores`，以及其他未单列的 `/api` 路径 | 来源 IP                           | 120              |

微信路径和后管路径的钥匙不同。刷微信登录不会占后管登录的额度，反过来也一样。

后管登录的帐号钥匙是用户名去掉首尾空白、取前 64 个字符之后的 SHA-256 前 24 位十六进制，键里没有用户名原文，也没有口令。空用户名只按 IP 计。

`POST /api/quiz/sessions` 只包括创建出题。`GET /api/quiz/sessions`（成绩列表）、保存答案、交卷、取消都不在这档，只走已登录小程序的通用额度。课件的进度、取消和勾选同样只走通用额度。

任一档超限即拒绝。`Retry-After` 取已超限的那些档里剩余时间最长的一秒，至少为 1。

来源 IP 来自连接地址。只有 `TRUST_PROXY=true` 或 `1` 时才采用 `X-Forwarded-For` 的第一跳。不打开时，伪造这个头不会换钥匙。IP 只保留数字、点、冒号，最长 64；对不上就记成 `unknown`，共用一档。

## 没有 Redis

限流和会话用的是同一份 `REDIS_URL`，连接方式和会话存储相同：连不上就放弃这一路，进程继续听端口。

| 情况                              | 限流怎么做                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `RATE_LIMIT_ENABLED=false` 或 `0` | 不计数、不拦截                                                                        |
| 未配置 `REDIS_URL`，或连不上      | 不计数、不拦截。日志是 `[api] rate limit skipped: REDIS_URL 未配置` 或 `Redis 不可用` |
| 单次计数命令失败                  | 这一次不拦截，并记下错误摘要                                                          |
| Redis 可用且未超限                | 放行，后面的错误码保持原样                                                            |
| Redis 可用且超限                  | `429` / `RATE_LIMITED`                                                                |

不在这里返回 `REDIS_UNAVAILABLE`。否则 Redis 不在时，参数错误、微信未配置、错误口令、证书占位都会变成同一个 503。需要 Redis 才能做完的事仍按原来的码返回：签发或读取会话、出题入队、课件入队是 `503` / `REDIS_UNAVAILABLE`。健康检查的存活接口仍然不访问 Redis。

超限发生在控制器之前。已经超限时，不会先返回 `VALIDATION_ERROR` 再返回限流。还没超限时，参数、帐号和微信的错误码不变。

## 环境变量

写在仓库根目录 `.env` 或 `apps/api/.env`。非法数字（空、小数、0、负数、超过上限）回落到默认值，不阻止启动。

| 变量                               | 默认                    | 作用                                         |
| ---------------------------------- | ----------------------- | -------------------------------------------- |
| `RATE_LIMIT_ENABLED`               | 开启                    | 只有 `false` 或 `0` 关闭                     |
| `RATE_LIMIT_WINDOW_SECONDS`        | 60                      | 固定窗口，1 到 86400                         |
| `RATE_LIMIT_WECHAT_LOGIN_MAX`      | 60                      | 微信登录，按 IP                              |
| `RATE_LIMIT_ADMIN_LOGIN_MAX`       | 30                      | 后管登录，IP 和帐号各用这个数                |
| `RATE_LIMIT_WECHAT_API_MAX`        | 300                     | 已登录小程序接口，按 `userId`                |
| `RATE_LIMIT_WECHAT_IP_MAX`         | 600                     | 已登录小程序接口，按 IP                      |
| `RATE_LIMIT_ADMIN_API_MAX`         | 120                     | 已登录后管接口，按用户名                     |
| `RATE_LIMIT_ADMIN_IP_MAX`          | 240                     | 已登录后管接口，按 IP                        |
| `RATE_LIMIT_PUBLIC_MAX`            | 120                     | 证书占位和其他未单列路径，按 IP              |
| `RATE_LIMIT_QUIZ_CREATE_MAX`       | 60                      | 创建出题，按 `userId`                        |
| `RATE_LIMIT_COURSEWARE_UPLOAD_MAX` | 40                      | 课件上传，按 `userId`                        |
| `RATE_LIMIT_KEY_PREFIX`            | `tishuashua:ratelimit:` | 可选。只接受字母、数字、冒号、下划线和连字符 |
| `TRUST_PROXY`                      | 关闭                    | 只有 `true` 或 `1` 信任反向代理              |

本机不想限流时设 `RATE_LIMIT_ENABLED=false`。共享出口 IP 太挤时，调大 `RATE_LIMIT_WECHAT_IP_MAX`，不要关掉整个限流。

## 本地验证

先起 Redis，再启动 API。默认阈值比较宽，要看超限就把对应变量改小后重启。

```bash
pnpm deps:up
RATE_LIMIT_PUBLIC_MAX=2 RATE_LIMIT_WECHAT_LOGIN_MAX=2 pnpm dev:api
```

证书占位，第 3 次应是 429：

```bash
curl -sS -D - http://127.0.0.1:3000/api/certificates -o /tmp/rate-body.txt
curl -sS -D - http://127.0.0.1:3000/api/certificates -o /tmp/rate-body.txt
curl -sS -D - http://127.0.0.1:3000/api/certificates -o /tmp/rate-body.txt
```

第三次的状态是 `429`，正文是 `RATE_LIMITED`，响应头有 `Retry-After`。同一时刻健康检查仍是 200：

```bash
curl -sS -D - http://127.0.0.1:3000/api/health -o /tmp/health-body.txt
```

微信登录单独计数。下面这条在未配置微信时，前两次仍是原来的 `WECHAT_NOT_CONFIGURED` 或参数错误，第三次才是 `RATE_LIMITED`：

```bash
curl -sS -D - -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"demo"}'
```

后管登录用另一把钥匙。微信登录已经超限时，后管登录不会因此变成 429。

## 测试

```bash
pnpm test
```

路由分类、阈值解析和「第 N 次放行」不访问 Redis。计数和 HTTP `429` 只在 Redis 可连接时跑；连不上就跳过，不算失败。
