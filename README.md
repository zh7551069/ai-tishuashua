# 题刷刷

AI 刷题微信小程序与管理后台的 monorepo **脚手架**。这里只有目录边界、空模块、路由占位、健康检查和共享类型，没有出题、登录会话、上传或证书等业务实现。

技术栈按架构 v0.2：Taro 微信小程序、无状态 NestJS API、BullMQ Worker、PostgreSQL、Redis、对象存储（COS/OSS）、国内 LLM（DeepSeek / 通义）。本期不是微信云开发，小程序通过 HTTP 访问自建 API。

## 系统职责

| 目录              | 职责                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mini`       | 微信小程序。Taro + React + TypeScript。页面壳：首页、微信登录、刷题、错题、证书、成绩。登录适配层只向微信要 `code`。                                                                                           |
| `apps/api`        | 无状态 NestJS API。模块壳：`auth/wechat`、`user`、`quiz/session`、`wrong-book`、`certificate`、`courseware`、`admin-gateway`。`GET /api/health` 做存活检查，`GET /api/health/ready` 检查 PostgreSQL 与 Redis。 |
| `apps/worker`     | 独立部署的队列消费者。监听 `quiz.generate`（出题）和 `courseware.extract`（课件提炼）。处理函数只打日志并返回占位结果。                                                                                        |
| `apps/admin`      | 管理后台 SPA。Vite + React + TypeScript。选它是因为小程序已经是 React，后台不必再换一套视图库；这是独立 Web，不需要 SSR。登录页是帐密表单占位，和微信登录分开。                                                |
| `packages/shared` | 卷结构、错题入卷比例上限、课件 50MB 上限、API 错误码、队列名和任务载荷。                                                                                                                                       |
| `packages/config` | 共享 `tsconfig`。ESLint / Prettier 放在仓库根目录。                                                                                                                                                            |

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

小程序环境只保留 `TARO_APP_API_BASE` 和可选的 `TARO_APP_ID`。不要把 `WECHAT_APP_SECRET` 写进 `apps/mini`。

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

除健康检查外，接口返回 `implemented: false`。例如：

```bash
curl http://127.0.0.1:3000/api/health
curl -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"demo"}'
```

占位路由：

| 方法       | 路径                       | 模块         |
| ---------- | -------------------------- | ------------ |
| POST       | `/api/auth/wechat/login`   | 微信登录     |
| GET        | `/api/users/me`            | 当前用户     |
| POST       | `/api/quiz/sessions`       | 创建刷题会话 |
| GET        | `/api/quiz/sessions/:id`   | 读取会话     |
| GET        | `/api/wrong-book`          | 错题本       |
| GET        | `/api/certificates`        | 证书         |
| GET        | `/api/certificates/scores` | 成绩         |
| GET / POST | `/api/courseware`          | 课件         |
| POST       | `/api/admin/login`         | 后台帐密登录 |
| GET        | `/api/admin/ping`          | 后台连通性   |

API 进程不连接 BullMQ，这样没有 Redis 时服务仍能启动。入队留到实现期，队列名以 `packages/shared` 为准。

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
5. 开发者工具里编译预览。登录页按钮只调用 `Taro.login()` 取得 `code`，不上传密钥。
6. 上线前在微信公众平台配置 request 合法域名，并把 `urlCheck` 改回开启。本机 `http://127.0.0.1` 不能作为线上合法域名。

只做一次生产构建：

```bash
pnpm --filter @tishuashua/mini build:weapp
```

## 常用脚本

| 命令                              | 作用                                          |
| --------------------------------- | --------------------------------------------- |
| `pnpm deps:up` / `pnpm deps:down` | 起停 PostgreSQL 与 Redis                      |
| `pnpm dev:api`                    | API 热重载，端口 3000                         |
| `pnpm dev:worker`                 | Worker 热重载，端口 3001                      |
| `pnpm dev:admin`                  | 管理后台，端口 5173                           |
| `pnpm dev:mini`                   | 监听编译微信小程序                            |
| `pnpm typecheck`                  | 各包 TypeScript 检查                          |
| `pnpm lint`                       | ESLint（不含小程序目录，小程序以 `tsc` 为准） |
| `pnpm build`                      | 构建 shared、api、worker、admin，并编译小程序 |

根脚本走 Turborepo，会先构建 `@tishuashua/shared`。

## 架构对应

- 客户端鉴权只有微信登录。短信登录不在本期。
- API 无状态。会话、进度、限流、队列打算用 Redis，脚手架只把 Redis 用在健康检查和 Worker 连接上。
- 学习数据和配置打算进 PostgreSQL。脚手架没有建表，也没有 ORM。
- 课件、封面、导出走对象存储。共享常量 `COURSEWARE_MAX_BYTES` 为 50MB。上传未实现。
- 出题走 Worker，按需调用国内 LLM，不是静态题库。`WRONG_QUESTION_RATIO_MAX` 为 `0.5`。组卷算法未实现。
- 管理后台是独立 Web，帐密登录，不走微信。
- 明确不做：短信登录、RAG / 向量库、计费大盘、K8s 多副本、微信云开发。

## 后续实现优先级

1. 打通微信登录：小程序 `code` → API 换会话 → Redis。
2. PostgreSQL 中的用户、学习数据、课件元数据。
3. 课件上传对象存储（遵守 50MB）并真正投递 `courseware.extract`。
4. `quiz.generate`：按需出题，错题占比不超过 50%。
5. 刷题会话与错题本读写。
6. 证书与成绩查询。
7. 管理后台帐密登录，以及 admin-gateway 的访问控制。
8. Redis 限流。

上述各项都还没有业务规则落地，接口返回值不能当成契约冻结。
