# 题刷刷

AI 刷题微信小程序与管理后台的 monorepo。微信登录已经接通（`code` → 用户 upsert → Redis 会话）。目录和刷题包也可以用：选领域、证书、知识点后保存，首页显示当前包。出题、交卷判分、解析、错题本和课件提炼已经接通。登录见 [docs/wechat-login.md](docs/wechat-login.md)，刷题包见 [docs/packs.md](docs/packs.md)，出题与交卷见 [docs/quiz.md](docs/quiz.md)，课件见 [docs/courseware.md](docs/courseware.md)。

技术栈按架构 v0.2：Taro 微信小程序、无状态 NestJS API、BullMQ Worker、PostgreSQL、Redis、对象存储（COS/OSS）、国内 LLM（DeepSeek / 通义）。本期不是微信云开发，小程序通过 HTTP 访问自建 API。

## 系统职责

| 目录              | 职责                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mini`       | 微信小程序。Taro + React + TypeScript。落地页用 `Taro.login` 的 `code` 换会话并进入首页；协议和隐私是可打开的正文。首页按有无刷题包进入选领域或当前包，证书下架时包置灰且不能开始刷题。出题、答题交卷、成绩解析、错题本和课件提炼已接通。证书查询仍是页面壳。 |
| `apps/api`        | 无状态 NestJS API。微信登录、当前用户、目录、刷题包、出题、交卷判分、错题本和课件提炼已实现，会话在 Redis，数据在 PostgreSQL。后管登录仍是壳。`GET /api/health` 做存活检查，`GET /api/health/ready` 检查 PostgreSQL 与 Redis。                                |
| `apps/worker`     | 独立部署的队列消费者。`quiz.generate` 会读会话、调用 mock 或国内 LLM，并写入试卷。`courseware.extract` 读取课件并提炼知识点草稿。                                                                                                                             |
| `apps/admin`      | 管理后台 SPA。Vite + React + TypeScript。选它是因为小程序已经是 React，后台不必再换一套视图库；这是独立 Web，不需要 SSR。登录页是帐密表单占位，和微信登录分开。                                                                                               |
| `packages/shared` | 出题设置、错题配额、分值归一化、Prompt 选择、mock 题目、课件 50MB 上限、API 错误码、登录与刷题包类型、队列名。成卷在 `@tishuashua/shared/generation`，提炼在 `@tishuashua/shared/courseware`，避免小程序打进 Node 依赖。                                      |
| `packages/config` | 共享 `tsconfig`。ESLint / Prettier 放在仓库根目录。                                                                                                                                                                                                           |

管理后台不放数据库和微信密钥。微信 `AppSecret`、对象存储密钥和 LLM Key 只属于 API / Worker。

## 目录

```text
.
├── apps
│   ├── admin          管理后台
│   ├── api            NestJS API
│   ├── mini           Taro 微信小程序
│   └── worker         BullMQ 消费者
├── packages
│   ├── config         共享 tsconfig
│   └── shared         类型、常量、队列契约
├── docker-compose.yml 本地 PostgreSQL 16 + Redis 7
├── .env.example
└── package.json       pnpm workspace + Turborepo
```

## 环境

- Node.js 20 或以上（本仓库用 22 验证）
- pnpm 10.33.4（`packageManager` 字段已写明，可用 Corepack）
- Docker，用来起 PostgreSQL 和 Redis
- 微信开发者工具，只在跑小程序时需要。CI 不包含开发者工具

## 安装

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install
```

首次编译共享包并检查各应用：

```bash
pnpm typecheck
pnpm build
```

`pnpm build` 会构建 shared、api、worker、admin，并执行小程序的 `taro build --type weapp`。微信开发者工具本身不参与这条命令。

## 环境变量

仓库里只有示例，没有真实密钥。`.env` 已被 gitignore。

```bash
cp .env.example .env
```

也可以只复制某个应用自己的示例：

- `apps/api/.env.example`
- `apps/worker/.env.example`
- `apps/admin/.env.example`
- `apps/mini/.env.example` → 复制成 `apps/mini/.env.development`

未提供应用目录 `.env` 时，API 和 Worker 会再读仓库根目录 `.env`。

`docker-compose.yml` 与示例里的数据库口令 `tishuashua` 只给本机开发用，不要带到生产。

小程序环境只保留 `TARO_APP_API_BASE` 和可选的 `TARO_APP_ID`。不要把 `WECHAT_APP_SECRET` 或 `WECHAT_LOGIN_MOCK` 写进 `apps/mini`。

没有真实小程序密钥时，在 API 环境显式设置 `WECHAT_LOGIN_MOCK=true`（默认 `false`）。只有 `true` 或 `1` 会启用，启用后不请求微信。生产不要打开。详见 [docs/wechat-login.md](docs/wechat-login.md)。

没有 LLM Key 时，出题同样要显式设置 `LLM_MOCK=true`（默认 `false`）。只有 `true` 或 `1` 会启用，启用后 Worker 不请求 DeepSeek 或通义。生产不要打开。详见 [docs/quiz.md](docs/quiz.md)。

## 本地依赖

```bash
pnpm deps:up
```

等价于 `docker compose up -d`。PostgreSQL 在 `127.0.0.1:5432`，Redis 在 `127.0.0.1:6379`，库名、用户名、密码都是 `tishuashua`。

停止：

```bash
pnpm deps:down
```

## 启动 API

```bash
pnpm dev:api
```

- 存活：<http://127.0.0.1:3000/api/health>
- 就绪（需先起 Docker）：<http://127.0.0.1:3000/api/health/ready>
- OpenAPI 壳：<http://127.0.0.1:3000/api/docs>

健康检查、微信登录、当前用户、目录、刷题包、出题、交卷、错题本和课件提炼会返回真实结果。`GET /api/certificates` 仍返回 `implemented: false`。例如：

```bash
curl http://127.0.0.1:3000/api/health
curl -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"demo"}'
```

上面这条登录请求在未配置微信、且 `WECHAT_LOGIN_MOCK` 不是 `true` 时返回 `503` / `WECHAT_NOT_CONFIGURED`。打开 mock 并且 Postgres、Redis 可用时返回 `token` 和用户摘要。完整命令见 [docs/wechat-login.md](docs/wechat-login.md)。

路由：

| 方法               | 路径                                                      | 模块                         |
| ------------------ | --------------------------------------------------------- | ---------------------------- |
| POST               | `/api/auth/wechat/login`                                  | 微信登录（已实现）           |
| GET                | `/api/users/me`                                           | 当前用户（需 Bearer token）  |
| GET                | `/api/catalog/domains`                                    | 上架领域（需登录）           |
| GET                | `/api/catalog/domains/:domainId/certificates`             | 上架证书（需登录）           |
| GET                | `/api/catalog/certificates/:certificateId/knowledge-tree` | 教材 / 知识点树（需登录）    |
| GET / POST         | `/api/packs`                                              | 刷题包列表、创建（需登录）   |
| GET / PUT / DELETE | `/api/packs/:id`                                          | 读取、重命名或换知识点、删除 |
| POST               | `/api/packs/:id/activate`                                 | 设为当前包                   |
| POST               | `/api/quiz/sessions`                                      | 创建出题任务（需登录）       |
| GET                | `/api/quiz/sessions/:id`                                  | 进度或试卷（需登录）         |
| POST               | `/api/quiz/sessions/:id/cancel`                           | 取消出题并丢弃半卷           |
| POST               | `/api/quiz/sessions/:id/start`                            | 进入答题                     |
| POST               | `/api/quiz/sessions/:id/answers`                          | 保存选择，不判分             |
| POST               | `/api/quiz/sessions/:id/submit`                           | 交卷、判分、写错题           |
| GET                | `/api/quiz/sessions`                                      | 已交卷成绩列表               |
| GET                | `/api/wrong-book`                                         | 错题本列表（需登录）         |
| GET                | `/api/wrong-book/:id`                                     | 错题详情                     |
| POST               | `/api/wrong-book/:id/clear`                               | 消灭错题                     |
| GET                | `/api/certificates`                                       | 证书占位，不是目录接口       |
| GET                | `/api/certificates/scores`                                | 成绩占位，不是交卷成绩       |
| POST               | `/api/courseware/uploads`                                 | 上传课件并登记提炼           |
| GET                | `/api/courseware/jobs/:id`                                | 提炼进度                     |
| POST               | `/api/courseware/jobs/:id/cancel`                         | 取消提炼                     |
| POST               | `/api/courseware/jobs/:id/commit`                         | 勾选知识点回树，可并进刷题包 |
| POST               | `/api/admin/login`                                        | 后台帐密登录（占位）         |
| GET                | `/api/admin/ping`                                         | 后台连通性（占位）           |

没有 Redis 时 API 仍能启动，登录、出题和课件提炼入队会返回 `REDIS_UNAVAILABLE`。出题创建成功后投递 `quiz.generate`，课件上传成功后投递 `courseware.extract`。迁移在 API 启动时执行。失败只记日志，不阻止进程监听。目录种子见 [docs/packs.md](docs/packs.md)，出题见 [docs/quiz.md](docs/quiz.md)，课件见 [docs/courseware.md](docs/courseware.md)。

## 启动 Worker

另开终端：

```bash
pnpm dev:worker
```

- 存活：<http://127.0.0.1:3001/health>
- 就绪：<http://127.0.0.1:3001/health/ready>（只检查 Redis）

没有 `REDIS_URL` 时进程仍会起来，但不会注册消费者，就绪检查失败。队列名：

- `quiz.generate`
- `courseware.extract`

## 启动管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>。布局可以直接看。登录页会把帐密 POST 到 API 的占位接口，并显示返回 JSON，不会创建会话。

## 启动小程序

CI 和本机都可以编出微信小程序产物，但预览和真机调试要用微信开发者工具：

1. `pnpm dev:mini`，等 `apps/mini/dist` 生成。这条命令会持续监听。
2. 打开微信开发者工具，导入目录 `apps/mini`（不要导入成云开发项目）。
3. `project.config.json` 里 `miniprogramRoot` 是 `dist/`，默认 `appid` 是 `touristappid`，`urlCheck` 为 `false`，方便连本机 API。
4. 有真实小程序后，在 `apps/mini/.env.development` 设置 `TARO_APP_ID`。Taro 会在构建时写入 AppId。`AppSecret` 仍然只放在 API。
5. 开发者工具里编译预览。登录页调用 `Taro.login()` 取得 `code`，再 POST 到 API。请求体里没有 AppSecret。协议和隐私从登录页打开。登录后无刷题包会去选领域；保存后回到首页。路径见 [docs/packs.md](docs/packs.md)。
6. 上线前在微信公众平台配置 request 合法域名，并把 `urlCheck` 改回开启。本机 `http://127.0.0.1` 不能作为线上合法域名。

只做一次生产构建：

```bash
pnpm --filter @tishuashua/mini build:weapp
```

## 常用脚本

| 命令                              | 作用                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `pnpm deps:up` / `pnpm deps:down` | 起停 PostgreSQL 与 Redis                               |
| `pnpm dev:api`                    | API 热重载，端口 3000                                  |
| `pnpm dev:worker`                 | Worker 热重载，端口 3001                               |
| `pnpm dev:admin`                  | 管理后台，端口 5173                                    |
| `pnpm dev:mini`                   | 监听编译微信小程序                                     |
| `pnpm typecheck`                  | 各包 TypeScript 检查                                   |
| `pnpm lint`                       | ESLint（不含小程序目录，小程序以 `tsc` 为准）          |
| `pnpm test`                       | API 单元测试；Postgres 与 Redis 可连接时跑登录集成测试 |
| `pnpm build`                      | 构建 shared、api、worker、admin，并编译小程序          |

根脚本走 Turborepo，会先构建 `@tishuashua/shared`。

## 架构对应

- 客户端鉴权只有微信登录。短信登录不在本期。登录态是 Redis 里的不透明 token，不是 JWT。
- API 无状态。登录会话已经写入 Redis。进度、限流还没有做。健康检查和 Worker 仍使用 Redis。
- 用户、目录、刷题包、出题会话和课件提炼用 `pg` 迁移，没有 ORM。知识点没有 weight。用户提炼的知识点带 `owner_user_id`，只出现在本人的证书树里。
- 课件走对象存储。未配齐 `OSS_ENDPOINT`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` 时写本地目录，不访问云厂商。配齐后走 S3 兼容接口，默认 path-style，可接 MinIO。共享常量 `COURSEWARE_MAX_BYTES` 为 50MB。
- 出题和课件提炼走 Worker，按需调用国内 LLM。`WRONG_QUESTION_RATIO_MAX` 为 `0.5`。没有 Key 且未打开 `LLM_MOCK` 时拒绝出题和上传提炼。免费终身 1 次提炼配额本期不做门禁。
- 管理后台是独立 Web，帐密登录，不走微信。
- 明确不做：短信登录、RAG / 向量库、计费大盘、K8s 多副本、微信云开发。

## 后续实现优先级

1. 微信登录已接通：小程序 `code` → API 换会话 → Redis，并 upsert 用户表。手机号授权仍留到设置补全。
2. 目录和刷题包已接通：上架领域 / 证书 / 教材知识点树，以及建包、切换、重命名、删除。证书下架后包只可删除。后管改目录还没有做，本地用种子数据。
3. 课件上传和提炼已接通：直传登记、进度、取消、mock 或真模型提炼，勾选后进入当前证书的「我的课件」。后管上传列表和会员提炼配额还没有做。
4. `quiz.generate` 已接通：设置页、进度、取消、mock 或真模型成卷、拉卷、保存选择、交卷判分和解析。
5. 错题本已接通：交卷写入、列表、详情和消灭。出题时仍只带未消灭错题。后管错题页仍是壳。
6. 小程序成绩列表读已交卷会话。后管证书维护和 `GET /api/certificates` 仍是占位，和小程序用的 `/api/catalog` 不是同一个接口。
7. 管理后台帐密登录，以及 admin-gateway 的访问控制。
8. Redis 限流。

后管登录的返回值还不能当成契约冻结。登录字段见 [docs/wechat-login.md](docs/wechat-login.md)，刷题包字段见 [docs/packs.md](docs/packs.md)，出题、交卷和错题本字段见 [docs/quiz.md](docs/quiz.md)，课件字段见 [docs/courseware.md](docs/courseware.md)。
