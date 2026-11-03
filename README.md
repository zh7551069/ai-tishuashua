# 题刷刷

AI 刷题微信小程序与管理后台的 monorepo。微信登录已经接通（`code` → 用户 upsert → Redis 会话）。设置页可以在已有会话下授权微信手机号，只保存脱敏号码；这不是短信登录。目录和刷题包也可以用：选领域、证书、知识点后保存，首页显示当前包。出题、交卷判分、解析、错题本、成绩列表、证书查询和课件提炼已经接通。管理后台用独立帐密登录，登录后可以维护上架领域、证书和教材知识点树，并只读查看全站错题、课件上传和已交卷成绩。登录见 [docs/wechat-login.md](docs/wechat-login.md)，后管登录见 [docs/admin-login.md](docs/admin-login.md)，目录维护见 [docs/admin-catalog.md](docs/admin-catalog.md)，后管错题见 [docs/admin-wrong-book.md](docs/admin-wrong-book.md)，后管课件见 [docs/admin-courseware.md](docs/admin-courseware.md)，后管证书与成绩见 [docs/admin-certificates.md](docs/admin-certificates.md)，刷题包见 [docs/packs.md](docs/packs.md)，出题与交卷见 [docs/quiz.md](docs/quiz.md)，证书查询见 [docs/certificates.md](docs/certificates.md)，课件见 [docs/courseware.md](docs/courseware.md)。

技术栈按架构 v0.2：Taro 微信小程序、无状态 NestJS API、BullMQ Worker、PostgreSQL、Redis、对象存储（COS/OSS）、国内 LLM（DeepSeek / 通义）。本期不是微信云开发，小程序通过 HTTP 访问自建 API。

## 系统职责

| 目录              | 职责                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mini`       | 微信小程序。Taro + React + TypeScript。落地页用 `Taro.login` 的 `code` 换会话并进入首页；协议和隐私是可打开的正文。首页或登录成功页可以进设置，用微信手机号授权补全脱敏号码，不是短信登录。首页按有无刷题包进入选领域或当前包，证书下架时包置灰且不能开始刷题。出题、答题交卷、成绩解析、成绩列表、错题本、证书查询和课件提炼已接通。        |
| `apps/api`        | 无状态 NestJS API。微信登录、当前用户、设置页手机号绑定、目录、刷题包、出题、交卷判分、错题本、证书查询和课件提炼已实现，会话在 Redis，数据在 PostgreSQL。手机号绑定不是短信登录。后管帐密登录、官方目录维护、错题只读、课件上传只读和证书与成绩只读已实现。`GET /api/health` 做存活检查，`GET /api/health/ready` 检查 PostgreSQL 与 Redis。 |
| `apps/worker`     | 独立部署的队列消费者。`quiz.generate` 会读会话、调用 mock 或国内 LLM，并写入试卷。`courseware.extract` 读取课件并提炼知识点草稿。                                                                                                                                                                                                            |
| `apps/admin`      | 管理后台 SPA。Vite + React + TypeScript。选它是因为小程序已经是 React，后台不必再换一套视图库；这是独立 Web，不需要 SSR。登录页用帐密换 Redis 会话后进入后台，和微信登录分开。目录页可维护领域、证书和知识点树。错题页、课件页和证书与成绩页只读查看全站记录。                                                                               |
| `packages/shared` | 出题设置、错题配额、分值归一化、Prompt 选择、mock 题目、课件 50MB 上限、API 错误码、登录与刷题包类型、队列名。成卷在 `@tishuashua/shared/generation`，提炼在 `@tishuashua/shared/courseware`，避免小程序打进 Node 依赖。                                                                                                                     |
| `packages/config` | 共享 `tsconfig`。ESLint / Prettier 放在仓库根目录。                                                                                                                                                                                                                                                                                          |

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

`docker-compose.yml` 与示例里的数据库口令 `tishuashua` 只给本机开发用，不要带到生产。示例里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 也只给本机。生产要换成强口令。两项都空着时后管登录返回 `ADMIN_NOT_CONFIGURED`，代码里没有默认帐号。详见 [docs/admin-login.md](docs/admin-login.md)。

小程序环境只保留 `TARO_APP_API_BASE` 和可选的 `TARO_APP_ID`。不要把 `WECHAT_APP_SECRET` 或 `WECHAT_LOGIN_MOCK` 写进 `apps/mini`。

没有真实小程序密钥时，在 API 环境显式设置 `WECHAT_LOGIN_MOCK=true`（默认 `false`）。只有 `true` 或 `1` 会启用，启用后登录和手机号授权都不请求微信。生产不要打开。详见 [docs/wechat-login.md](docs/wechat-login.md)。

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
- OpenAPI 壳：<http://127.0.0.1:3000/api/docs>。`pnpm dev:api` 使用 tsx，不会写出装饰器类型元数据，文档生成失败时只打警告，接口仍会监听。`pnpm build` 后的 `node dist/main.js` 会挂上这份文档。

健康检查、微信登录、当前用户、目录、刷题包、出题、交卷、错题本、证书查询、课件提炼和后管登录会返回真实结果。例如：

```bash
curl http://127.0.0.1:3000/api/health
curl -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"demo"}'
```

上面这条登录请求在未配置微信、且 `WECHAT_LOGIN_MOCK` 不是 `true` 时返回 `503` / `WECHAT_NOT_CONFIGURED`。打开 mock 并且 Postgres、Redis 可用时返回 `token` 和用户摘要。完整命令见 [docs/wechat-login.md](docs/wechat-login.md)。

后管登录需要 API 环境里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，以及 Redis。未配置帐号时返回 `503` / `ADMIN_NOT_CONFIGURED`。完整命令见 [docs/admin-login.md](docs/admin-login.md)。

路由：

| 方法               | 路径                                                        | 模块                                   |
| ------------------ | ----------------------------------------------------------- | -------------------------------------- |
| POST               | `/api/auth/wechat/login`                                    | 微信登录（已实现）                     |
| GET                | `/api/users/me`                                             | 当前用户（需 Bearer token）            |
| POST               | `/api/users/me/phone`                                       | 绑定微信手机号（需会话，不是短信登录） |
| GET                | `/api/catalog/domains`                                      | 上架领域（需登录）                     |
| GET                | `/api/catalog/domains/:domainId/certificates`               | 上架证书（需登录）                     |
| GET                | `/api/catalog/certificates/:certificateId/knowledge-tree`   | 教材 / 知识点树（需登录）              |
| GET / POST         | `/api/packs`                                                | 刷题包列表、创建（需登录）             |
| GET / PUT / DELETE | `/api/packs/:id`                                            | 读取、重命名或换知识点、删除           |
| POST               | `/api/packs/:id/activate`                                   | 设为当前包                             |
| POST               | `/api/quiz/sessions`                                        | 创建出题任务（需登录）                 |
| GET                | `/api/quiz/sessions/:id`                                    | 进度或试卷（需登录）                   |
| POST               | `/api/quiz/sessions/:id/cancel`                             | 取消出题并丢弃半卷                     |
| POST               | `/api/quiz/sessions/:id/start`                              | 进入答题                               |
| POST               | `/api/quiz/sessions/:id/answers`                            | 保存选择，不判分                       |
| POST               | `/api/quiz/sessions/:id/submit`                             | 交卷、判分、写错题                     |
| GET                | `/api/quiz/sessions`                                        | 已交卷成绩列表                         |
| GET                | `/api/wrong-book`                                           | 错题本列表（需登录）                   |
| GET                | `/api/wrong-book/:id`                                       | 错题详情                               |
| POST               | `/api/wrong-book/:id/clear`                                 | 消灭错题                               |
| GET                | `/api/certificates`                                         | 当前用户的证书查询（需登录）           |
| POST               | `/api/courseware/uploads`                                   | 上传课件并登记提炼                     |
| GET                | `/api/courseware/jobs/:id`                                  | 提炼进度                               |
| POST               | `/api/courseware/jobs/:id/cancel`                           | 取消提炼                               |
| POST               | `/api/courseware/jobs/:id/commit`                           | 勾选知识点回树，可并进刷题包           |
| POST               | `/api/admin/login`                                          | 后台帐密登录（已实现）                 |
| POST               | `/api/admin/logout`                                         | 注销后管会话（需后管会话）             |
| GET                | `/api/admin/ping`                                           | 后管连通性（需后管会话）               |
| GET / POST         | `/api/admin/catalog/domains`                                | 后管领域，含下架                       |
| PUT / DELETE       | `/api/admin/catalog/domains/:id`                            | 修改或删除领域                         |
| GET / POST         | `/api/admin/catalog/domains/:domainId/certificates`         | 后管证书，含下架                       |
| PUT / DELETE       | `/api/admin/catalog/certificates/:id`                       | 修改或删除证书                         |
| GET                | `/api/admin/catalog/certificates/:id/tree`                  | 官方教材 / 知识点树                    |
| POST               | `/api/admin/catalog/certificates/:id/textbooks`             | 新建并挂上教材                         |
| POST               | `/api/admin/catalog/certificates/:id/textbooks/link`        | 挂已有官方教材                         |
| DELETE             | `/api/admin/catalog/certificates/:id/textbooks/:textbookId` | 从证书卸下教材                         |
| PUT / DELETE       | `/api/admin/catalog/textbooks/:id`                          | 修改或删除教材                         |
| POST               | `/api/admin/catalog/textbooks/:id/nodes`                    | 教材下新建知识点或分组                 |
| POST               | `/api/admin/catalog/certificates/:id/knowledge-points`      | 不挂教材的独立知识点                   |
| PUT / DELETE       | `/api/admin/catalog/knowledge-points/:id`                   | 修改或删除知识点                       |
| GET                | `/api/admin/wrong-book`                                     | 后管错题列表（需后管会话）             |
| GET                | `/api/admin/wrong-book/:id`                                 | 后管错题详情（需后管会话）             |
| GET                | `/api/admin/courseware`                                     | 后管课件上传列表（需后管会话）         |
| GET                | `/api/admin/courseware/:id`                                 | 后管课件上传详情（需后管会话）         |
| GET                | `/api/admin/certificates`                                   | 后管已交卷成绩列表（需后管会话）       |
| GET                | `/api/admin/certificates/:id`                               | 后管已交卷成绩详情（需后管会话）       |

没有 Redis 时 API 仍能启动。微信登录、帐号正确的后管登录、出题和课件提炼入队会返回 `REDIS_UNAVAILABLE`。限流在 Redis 不可用时不拦截，因此这些错误码保持不变；规则见 [docs/rate-limit.md](docs/rate-limit.md)。出题创建成功后投递 `quiz.generate`，课件上传成功后投递 `courseware.extract`。迁移在 API 启动时执行。失败只记日志，不阻止进程监听。目录种子见 [docs/packs.md](docs/packs.md)，后管改目录见 [docs/admin-catalog.md](docs/admin-catalog.md)，后管错题见 [docs/admin-wrong-book.md](docs/admin-wrong-book.md)，后管课件见 [docs/admin-courseware.md](docs/admin-courseware.md)，后管证书与成绩见 [docs/admin-certificates.md](docs/admin-certificates.md)，出题见 [docs/quiz.md](docs/quiz.md)，证书查询见 [docs/certificates.md](docs/certificates.md)，课件见 [docs/courseware.md](docs/courseware.md)，后管登录见 [docs/admin-login.md](docs/admin-login.md)。

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

打开 <http://127.0.0.1:5173>。没有会话时停在登录页。错误帐密留在页面上并提示；正确帐密进入概览，并带着会话访问 `GET /api/admin/ping`。进入「目录」后可以维护领域、证书和知识点树。进入「错题」后可以只读查看全站错题。进入「课件」后可以只读查看全站上传和提炼任务。进入「证书与成绩」后可以只读查看全站已交卷成绩。小程序证书查询和成绩列表不在后管这一页。步骤见 [docs/admin-login.md](docs/admin-login.md)、[docs/admin-catalog.md](docs/admin-catalog.md)、[docs/admin-wrong-book.md](docs/admin-wrong-book.md)、[docs/admin-courseware.md](docs/admin-courseware.md) 和 [docs/admin-certificates.md](docs/admin-certificates.md)。

## 启动小程序

CI 和本机都可以编出微信小程序产物，但预览和真机调试要用微信开发者工具：

1. `pnpm dev:mini`，等 `apps/mini/dist` 生成。这条命令会持续监听。
2. 打开微信开发者工具，导入目录 `apps/mini`（不要导入成云开发项目）。
3. `project.config.json` 里 `miniprogramRoot` 是 `dist/`，默认 `appid` 是 `touristappid`，`urlCheck` 为 `false`，方便连本机 API。
4. 有真实小程序后，在 `apps/mini/.env.development` 设置 `TARO_APP_ID`。Taro 会在构建时写入 AppId。`AppSecret` 仍然只放在 API。
5. 开发者工具里编译预览。登录页调用 `Taro.login()` 取得 `code`，再 POST 到 API。请求体里没有 AppSecret。协议和隐私从登录页打开。登录后可从首页或登录成功页进入设置，授权微信手机号；这不是短信登录。无刷题包会去选领域；保存后回到首页。路径见 [docs/packs.md](docs/packs.md) 和 [docs/wechat-login.md](docs/wechat-login.md)。
6. 上线前在微信公众平台配置 request 合法域名，并把 `urlCheck` 改回开启。本机 `http://127.0.0.1` 不能作为线上合法域名。

只做一次生产构建：

```bash
pnpm --filter @tishuashua/mini build:weapp
```

## 常用脚本

| 命令                              | 作用                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm deps:up` / `pnpm deps:down` | 起停 PostgreSQL 与 Redis                                                                                                                                       |
| `pnpm dev:api`                    | API 热重载，端口 3000                                                                                                                                          |
| `pnpm dev:worker`                 | Worker 热重载，端口 3001                                                                                                                                       |
| `pnpm dev:admin`                  | 管理后台，端口 5173                                                                                                                                            |
| `pnpm dev:mini`                   | 监听编译微信小程序                                                                                                                                             |
| `pnpm typecheck`                  | 各包 TypeScript 检查                                                                                                                                           |
| `pnpm lint`                       | ESLint（不含小程序目录，小程序以 `tsc` 为准）                                                                                                                  |
| `pnpm test`                       | API 单元测试；Postgres 与 Redis 可连接时跑微信、刷题包、证书查询、后管目录、后管错题、后管课件和后管证书与成绩集成测试，Redis 可连接时跑后管登录和限流集成测试 |
| `pnpm build`                      | 构建 shared、api、worker、admin，并编译小程序                                                                                                                  |

根脚本走 Turborepo，会先构建 `@tishuashua/shared`。

## 架构对应

- 小程序鉴权只有微信登录。短信登录不在本期。设置页的手机号授权只补全资料，不能用来登录。登录态是 Redis 里的不透明 token，不是 JWT。后管使用另一套不透明 token，键前缀不同。
- API 无状态。微信登录和后管登录的会话已经写入 Redis，限流计数也在 Redis。健康检查和 Worker 仍使用 Redis。
- 用户、目录、刷题包、出题会话和课件提炼用 `pg` 迁移，没有 ORM。知识点没有 weight。用户提炼的知识点带 `owner_user_id`，只出现在本人的证书树里。
- 课件走对象存储。未配齐 `OSS_ENDPOINT`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` 时写本地目录，不访问云厂商。配齐后走 S3 兼容接口，默认 path-style，可接 MinIO。共享常量 `COURSEWARE_MAX_BYTES` 为 50MB。
- 出题和课件提炼走 Worker，按需调用国内 LLM。`WRONG_QUESTION_RATIO_MAX` 为 `0.5`。没有 Key 且未打开 `LLM_MOCK` 时拒绝出题和上传提炼。免费终身 1 次提炼配额本期不做门禁。
- 管理后台是独立 Web，帐密登录，不走微信。
- 明确不做：短信登录、RAG / 向量库、计费大盘、K8s 多副本、微信云开发。

## 后续实现优先级

1. 微信登录已接通：小程序 `code` → API 换会话 → Redis，并 upsert 用户表。设置页已可用 `getPhoneNumber` 的 `code` 绑定手机号，只保存脱敏号码。这不是短信登录。
2. 目录和刷题包已接通：上架领域 / 证书 / 教材知识点树，以及建包、切换、重命名、删除。证书下架后包只可删除。后管可以改官方目录，变更对 `/api/catalog/*` 可见。种子仍会写入，但不会覆盖已有 `code`。
3. 课件上传和提炼已接通：直传登记、进度、取消、mock 或真模型提炼，勾选后进入当前证书的「我的课件」。后管可以只读分页查看全站上传和提炼任务，见 [docs/admin-courseware.md](docs/admin-courseware.md)。会员提炼配额还没有做。
4. `quiz.generate` 已接通：设置页、进度、取消、mock 或真模型成卷、拉卷、保存选择、交卷判分和解析。
5. 错题本已接通：交卷写入、列表、详情和消灭。出题时仍只带未消灭错题。后管可以只读分页查看全站错题，见 [docs/admin-wrong-book.md](docs/admin-wrong-book.md)。后管不能消灭或删除。
6. 小程序成绩列表已接通：首页「成绩」打开 `/pages/score/index`，读取 `GET /api/quiz/sessions` 的已交卷摘要（分数、时间、证书、刷题包等），再进入 `/pages/quiz/paper/index` 看解析。没有 `GET /api/certificates/scores`。后管全站已交卷见 [docs/admin-certificates.md](docs/admin-certificates.md)。
7. 小程序证书查询已接通：首页「证书」打开 `/pages/certificate/index`，读取 `GET /api/certificates`。只列出当前用户有刷题包、错题、课件或能对上的已交卷记录的证书，含下架。它和小程序目录 `/api/catalog`、后管目录 `/api/admin/catalog`、成绩列表、后管「证书与成绩」都不是同一个接口。后管那一页只读查看全站已交卷，不改目录、不删证书、不改成绩，见 [docs/admin-certificates.md](docs/admin-certificates.md)。
8. 管理后台帐密登录已接通：API 用环境变量里的帐号签发 Redis 不透明 token，admin-gateway 拒绝缺少会话、失效会话和微信用户 token。后管目录维护、错题只读、课件上传只读和证书与成绩只读已接通。
9. Redis 限流已接通：登录，以及已登录的小程序和后管接口按 IP 与身份在 Redis 里分开计数。没有单独归类的 `/api` 路径按来源 IP 走公开额度。证书查询走已登录小程序额度。超限返回 `429` / `RATE_LIMITED`。开关、阈值，以及没有 Redis 时不拦截的原因见 [docs/rate-limit.md](docs/rate-limit.md)。

后管登录字段见 [docs/admin-login.md](docs/admin-login.md)，目录维护见 [docs/admin-catalog.md](docs/admin-catalog.md)，后管错题见 [docs/admin-wrong-book.md](docs/admin-wrong-book.md)，后管课件见 [docs/admin-courseware.md](docs/admin-courseware.md)，后管证书与成绩见 [docs/admin-certificates.md](docs/admin-certificates.md)。微信登录字段见 [docs/wechat-login.md](docs/wechat-login.md)，刷题包字段见 [docs/packs.md](docs/packs.md)，出题、交卷、成绩列表和错题本字段见 [docs/quiz.md](docs/quiz.md)，证书查询字段见 [docs/certificates.md](docs/certificates.md)，课件字段见 [docs/courseware.md](docs/courseware.md)。
