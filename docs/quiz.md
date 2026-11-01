# 出题设置与 AI 出题

有刷题包之后，可以从首页进入出题设置，创建一次出题任务，看进度或取消，成功后进入答题页看卷。题目是按知识点原创的，不是从静态题库里捞。未消灭的错题最多占 `floor(题量 × 50%)`，其余名额交给模型。没有 Key 时不会偷偷出题，必须显式打开 `LLM_MOCK`。

交卷、判分、解析展示、到时强制收卷、错题写入错题本都不在这一刀。答题页可以看题并保存选择。

## 开关

`LLM_MOCK` 和 `WECHAT_LOGIN_MOCK` 一样，只有 `true` 或 `1` 才生效，默认关闭。API 和 Worker 都读这个变量。

| 状态                                                            | 行为                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `LLM_MOCK` 未开，且没有 `LLM_API_KEY`                           | 创建任务直接 `503` / `LLM_NOT_CONFIGURED`，不落会话            |
| `LLM_MOCK=true`                                                 | Worker 用内置题目成卷，不访问外网                              |
| 配了 `LLM_API_KEY`，且 `LLM_PROVIDER` 为 `deepseek` 或 `tongyi` | Worker 调国内模型。可选 `LLM_BASE_URL`，不填则用供应商默认地址 |

模型超时或非 2xx 记为 `LLM_UNAVAILABLE`。返回内容过不了题目结构校验记为 `LLM_INVALID_OUTPUT`。这两类失败都会删掉已写入的题目，会话变成 `failed`。证书下架是配置类错误 `PACK_UNAVAILABLE`。

本地没有 Key 时：

```bash
# .env
LLM_MOCK=true
LLM_PROVIDER=deepseek
LLM_API_KEY=
```

要打真模型时把 mock 关掉，并只在本机 `.env` 里填 Key。不要把 Key 提交进仓库。

```bash
LLM_MOCK=false
LLM_PROVIDER=deepseek
LLM_API_KEY=你的密钥
# 可选。DeepSeek 默认 https://api.deepseek.com/chat/completions
# 通义默认 https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
LLM_BASE_URL=
```

`tongyi` 走通义兼容模式，模型名是 `qwen-plus`。DeepSeek 用 `deepseek-chat`。

## 启动

先起数据库和 Redis，再起 API（它会跑迁移，包括已发布 Prompt 种子），最后起 Worker。只开 API 时任务会停在 `pending`。

```bash
pnpm deps:up
pnpm dev:api
pnpm dev:worker
```

迁移 `004_quiz_generation.sql` 给 `quiz_sessions` 增加进度、错误码和运行令牌，并写入两条 `published` Prompt：一条全局，一条挂在中学教师资格上。出题时证书 Prompt 优先于领域，领域优先于全局。都没有可用的已发布模板时，用代码里的内置模板。中学教师资格的总分仍是种子里的 120，用来核对归一化。

## 设置

首页「开始刷题」进入 `/pages/quiz/index`。下架包的按钮保持不可用，设置页如果被直接打开也会拒绝。

- 只读展示当前包、证书、领域、知识点和总分
- 题量 10 / 20 / 30 / 50，默认 20
- 难度简单 / 中等 / 困难，默认中等
- 题型单选 / 多选 / 判断，至少一种。都关掉时红字提示，按钮不可点。证书没开放的题型不会出现
- 计时默认关。打开后可选「整卷倒计时」或「每题限时」。整卷默认 30 分钟。每题限时的单位是秒，字段名 `perQuestionSeconds`
- 模式默认练习，可改考试
- 「AI 开始出题」提交 `{ packId, count, difficulty, types, timer, mode }`

## API

都要 `Authorization: Bearer <token>`。先按 [微信登录](wechat-login.md) 拿 token。下面假设 mock 登录和 `LLM_MOCK=true` 已打开，Postgres、Redis 可用，并且 Worker 在跑。不跑 Worker 时，可以用同一套接口看 `pending`，但卷不会自己变成 `ready`。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"quiz-user","nick":"出题同学"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

创建任务。HTTP 201。`paper` 这时是 `null`。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "packId": "刷题包id",
    "count": 20,
    "difficulty": "medium",
    "types": ["single", "multi", "judge"],
    "timer": { "enabled": true, "kind": "paper", "paperMinutes": 30 },
    "mode": "practice"
  }'
```

每题限时：

```bash
"timer": { "enabled": true, "kind": "per_question", "perQuestionSeconds": 60 }
```

不限时：`"timer": { "enabled": false }`。

轮询进度。生成中看 `progress.generated` 和 `progress.total`。

```bash
curl -sS http://127.0.0.1:3000/api/quiz/sessions/会话id \
  -H "authorization: Bearer $TOKEN"
```

取消。只接受 `pending` 或 `generating`。已写入的 `paper_questions` 会被删掉。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions/会话id/cancel \
  -H "authorization: Bearer $TOKEN"
```

成卷后 `status` 为 `ready`，`paper.questions` 有题干、选项、分值和来源（`ai` 或 `wrong_carry`）。响应里没有标准答案和解析。分值之和等于出题时的证书总分；模型给的分值不一致时，在落库前做整数归一化。

进入答题会把状态改成 `in_progress`：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions/会话id/start \
  -H "authorization: Bearer $TOKEN"
```

保存选择。不判分。空数组表示清除。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions/会话id/answers \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"questionId":"题目id","selected":["A"]}'
```

小程序路径：

| 页面                          | 路径                                    |
| ----------------------------- | --------------------------------------- |
| 出题设置                      | `/pages/quiz/index?packId=`             |
| 出题中，约 1.5 秒轮询，可取消 | `/pages/quiz/progress/index?sessionId=` |
| 答题                          | `/pages/quiz/paper/index?sessionId=`    |

## 还没做

- 交卷、判分、成绩写入
- 把正确答案和解析展示给练习模式
- 考试时间到了强制收卷。整卷倒计时只在答题页倒计时，到点仍可继续选择
- 答错后写入错题本，以及错题本页面
- 后管发布 Prompt。本地靠迁移种子
- 课件上传和提炼
