# 出题设置与 AI 出题

有刷题包之后，可以从首页进入出题设置，创建一次出题任务，看进度或取消，成功后进入答题页看卷。题目是按知识点原创的，不是从静态题库里捞。未消灭的错题最多占 `floor(题量 × 50%)`，其余名额交给模型。没有 Key 时不会偷偷出题，必须显式打开 `LLM_MOCK`。

答题页可以保存选择。练习和考试都可以主动交卷。交卷后才下发正确答案和解析，并写入成绩。考试到点会由服务端强制收卷。答错、少选和未作答写入错题本，完全答对会消灭同一题。首页「成绩」可以回看自己已交卷的会话。

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

## 出题设置

首页「开始刷题」进入 `/pages/quiz/index`。下架包的按钮保持不可用，出题设置页如果被直接打开也会拒绝。账号、脱敏手机号和退出登录在 `/pages/settings/index`，见 [微信登录](wechat-login.md)。

- 只读展示当前包、证书、领域、知识点和总分
- 题量 10 / 20 / 30 / 50，默认 20
- 难度简单 / 中等 / 困难，默认中等
- 题型单选 / 多选 / 判断，至少一种。都关掉时红字提示，按钮不可点。证书没开放的题型不会出现
- 计时默认关。打开后可选「整卷倒计时」或「每题限时」。整卷默认 30 分钟。每题限时的单位是秒，字段名 `perQuestionSeconds`
- 模式默认练习，可改考试
- 「AI 开始出题」提交 `{ packId, count, difficulty, types, timer, mode }`。可选 `source`，缺省 `normal`

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

成卷后 `status` 为 `ready`，`paper.questions` 有题干、选项、分值和来源（`ai`、`wrong_carry`、`ai_variant` 或 `bank`）。响应里没有标准答案和解析。分值之和等于出题时的证书总分；模型给的分值不一致时，在落库前做整数归一化。会话响应带 `source`。`quiz_sessions.generation_stats` 记下本场 `wrongCarried`、`bankDrawn`、`aiGenerated`。

进入答题会把状态改成 `in_progress`：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions/会话id/start \
  -H "authorization: Bearer $TOKEN"
```

保存选择。不判分。空数组表示清除。交卷后不能再改。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions/会话id/answers \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"questionId":"题目id","selected":["A"]}'
```

## 交卷与判分

练习和考试都用同一个交卷接口。未交卷的拉卷响应里没有 `answer`、`analysis`，题目的 `review` 为 `null`。交卷后 `status` 变成 `submitted`，`result` 带总分、得分、正确率、得分率、及格与否，每题的 `review` 带正确答案、解析、得分和 `outcome`。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/quiz/sessions/会话id/submit \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{}'
```

重复交卷返回同一份成绩，不会把错题次数再加一次。

判分规则：

| 情况                               | 得分              | outcome      |
| ---------------------------------- | ----------------- | ------------ |
| 未作答                             | 0                 | `unanswered` |
| 单选、判断与标准答案完全一致       | 满分              | `correct`    |
| 单选、判断不一致                   | 0                 | `wrong`      |
| 多选与标准答案完全一致（顺序无关） | 满分              | `correct`    |
| 多选少选，且没有选到错误选项       | `floor(满分 / 2)` | `partial`    |
| 多选多选了或选错                   | 0                 | `wrong`      |

正确率是完全答对的题数除以题量，少选不算正确。得分率是得分除以总分。题目分值沿用成卷时已经归一化到证书总分的整数。及格线来自证书的 `pass_score`；没有及格线时 `passed` 为 `null`。

成绩列表只含已交卷摘要，不含题目。一次最多 50 条。小程序这一页已经接通，读的就是下面这个接口：

```bash
curl -sS http://127.0.0.1:3000/api/quiz/sessions \
  -H "authorization: Bearer $TOKEN"
```

响应除了 `items`，还有 `total`、`limit` 和 `hasMore`。`items` 每条是 `QuizScoreSummary`：`id`、`mode`、`source`、`certName`、`packName`、`earnedScore`、`totalScore`、`accuracy`、`scoreRate`、`correctCount`、`questionCount`、`passed`、`passScore`、`reason`、`submittedAt`。`source` 为 `normal`、`retrain_similar`、`variant` 或预留的 `wrongSet`。按交卷时间从新到旧，最多 `limit` 条（50）。`total` 是当前用户已交卷会话数，快照读不出来、因此不会出现在 `items` 里的记录也算进去。`hasMore` 在 `total` 大于 `limit` 时为 true，表示更早的成绩被截掉了。未交卷不计入。复练同类和题型变异的已交卷会话都在这张表里。未登录返回 401。打开列表时，已到点但还没交卷的考试会先被收卷，再出现在结果里。

小程序首页「成绩」进入 `/pages/score/index`。列表展示证书、刷题包、模式、得分、正确率、得分率、对题数、及格与及格线、交卷原因和交卷时间。`hasMore` 为 true 时，列表上方显示「只显示最近 50 条」。没有 token 或会话失效时停在本页，引导去登录。加载中、还没有交卷记录、请求失败是分开的状态，失败可以重试。点一条进入已有的 `/pages/quiz/paper/index?sessionId=`。已交卷会话不会再次开考，沿用交卷结果页看正确答案和解析。

没有 `GET /api/certificates/scores`。这份成绩就是上面的 `GET /api/quiz/sessions`。证书查询见 [证书查询](certificates.md)，它只在证书一行上附最近一次已落库的分数，不替代这里的列表。后管「证书与成绩」是全站已交卷的只读列表，见 [后管证书与成绩](admin-certificates.md)，也不在这一页。后管「出题会话」只读未交卷会话，不含分数和题目，见 [后管出题会话](admin-quiz-sessions.md)。

## 考试到时收卷

倒计时从进入答题开始。`POST /start` 或第一次保存选择会写下 `started_at`，之后不再改。考试模式才有 `deadlineAt`：

- 整卷倒计时：`started_at + paperMinutes`
- 每题限时：没有逐题开始时间，用 `perQuestionSeconds × 题量` 作为整卷截止

到点之后，读取会话、保存选择、交卷或打开成绩列表，都会先把这场考试收成 `submit_reason = timeout`。保存选择会得到 `409`。未到点时，即使请求体写 `"reason": "timeout"`，也记为 `manual`。客户端若在截止前 1.5 秒内因为钟差交卷，仍记为到时收卷。

练习模式可以开计时，到点不收卷，也不下发答案。练习和考试都是交卷后才看解析。

## 错题本

交卷时：

- `wrong`、`partial`、`unanswered` 写入 `wrong_items`，状态 `pending`
- 同一用户、同一证书下，题型、题干、选项和答案都相同的记录会累加 `wrong_count`，不会另起一条
- `correct` 会把题干指纹相同的未消灭错题标为 `cleared`。已消灭的记录不会被 `wrong_carry` 再带进新试卷
- 答对题型变异题不会按 `wrong_item_id` 清除原错题。只有变异题和某条错题的题型、题干、选项、答案完全一致时，才走上面的指纹规则
- 列表和详情都带 `kpIds`。有名称时带等长的 `kpNames`，对不上名称则为空串

快照字段和出题时解析错题的格式一致：`type`、`stem`、`options`、`answer`、`analysis`、`score`。

```bash
curl -sS http://127.0.0.1:3000/api/wrong-book \
  -H "authorization: Bearer $TOKEN"

curl -sS http://127.0.0.1:3000/api/wrong-book/错题id \
  -H "authorization: Bearer $TOKEN"

curl -sS -X POST http://127.0.0.1:3000/api/wrong-book/错题id/clear \
  -H "authorization: Bearer $TOKEN"
```

列表默认 `pending`。`?status=cleared` 或 `?status=all` 可以看已消灭和全部，最多 100 条。只能看自己的错题。

后管另有只读列表和详情，见 [后管错题](admin-wrong-book.md)。它使用后管会话，默认看全部状态，并可按用户和证书分页。不能调用上面的消灭接口，后管也没有删除。

小程序路径：

| 页面                          | 路径                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| 出题设置                      | `/pages/quiz/index?packId=`                                         |
| 复练同类出题设置              | `/pages/quiz/index?from=retrainSimilar&wrongItemId=&packId=&kpIds=` |
| 出题中，约 1.5 秒轮询，可取消 | `/pages/quiz/progress/index?sessionId=`                             |
| 答题、交卷后的成绩和解析      | `/pages/quiz/paper/index?sessionId=`                                |
| 错题本                        | `/pages/wrong-book/index`                                           |
| 错题详情                      | `/pages/wrong-book/detail/index?id=`                                |
| 成绩列表                      | `/pages/score/index`                                                |

## 复练同类

正式规则见 [复练同类 / 题型变异契约](contracts/retrain-C-contracts-v0.1.0-C.md)（v0.1.0-C）。这里只记已接通的行为。

`POST /api/quiz/sessions` 增加可选字段：

| 字段                | 说明                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `source`            | `normal`（缺省）、`retrain_similar`、`variant`。`wrongSet` 预留，请求会 `400` / `VALIDATION_ERROR`，文案含「暂未开放」 |
| `knowledgePointIds` | 会话级知识点覆盖。不写回 `pack_knowledge_points`，也不改用户当前包                                                     |
| `wrongItemId`       | 仅 `variant` 可传                                                                                                      |
| `intent`            | 历史草案。没传 `source` 时映射成 `source`；两者不一致则 `400`                                                          |

`source=retrain_similar` 时 `knowledgePointIds` 必填、去重后非空。每个 id 必须是该包里已绑定、`kind=knowledge_point` 且 `online` 的知识点。有一个不满足就不创建会话，`400` / `VALIDATION_ERROR`，不会改用整包知识点继续出题。练习和考试都可以。未消灭错题仍可按现网比例带入，但只带和这次知识点有交集的错题。

普通出题如果自己带了 `knowledgePointIds`，用同一套校验，通过后也只覆盖这一场。不传则仍用整包上架知识点。

迁移 `007_quiz_retrain.sql` 放宽 `quiz_sessions.source`，并增加可空列 `knowledge_point_ids`、`wrong_item_id`。旧会话没有这两列里的值，按 `normal`、整包知识点处理。

## 题型变异

`source=variant` 仍走 `quiz.generate`，不新开队列。请求必须带本人的 `wrongItemId`，`count` 只能是 `1`，`mode` 只能是 `practice`，否则 `400`。`types` 可省略，省略时用证书已开放的题型。刷题包必须和错题同一证书，且证书仍上架。知识点取错题 `kp_ids` 里仍然上架、并且属于这个包的部分；过滤后一个不剩就 `400`，不回退整包。请求里的 `knowledgePointIds` 忽略。

Worker 只把错题的题型、题干和选项交给模型，不放标准答案和解析，不读课件，不做向量检索。目标题型在证书白名单（以及请求里给出的题型）内，优先和原题型不同；白名单只剩原题型时允许同型，但题干不能和原题相同。生成题的 `source` 是 `ai_variant`。变异卷不带 `wrong_carry`。

Prompt 沿用证书 > 领域 > 全局 > 代码内置。变异读 `prompt_templates.templates.variant` 的 `{ system, user }`。都没有时用 `BUILTIN_QUIZ_VARIANT_PROMPT`。证书覆盖如果没写检索禁令和「题干不得与原题干相同」，服务端会把这两句补进 system。`LLM_MOCK=true` 时用内置变异题，题干带会话盐。

失败的会话不能重新拉起来出题。重试要再 `POST` 一次，拿新的会话 id。交卷后这场会出现在成绩列表里，`source` 为 `variant`。答对只按题干指纹处理，不会把 `wrong_item_id` 指向的原错题标成已消灭。用户仍可在错题详情里手动标记已消灭。

小程序页面已接上（页面代码只改 `apps/mini`）：

- 错题详情底栏恢复「复练同类」「题型变异」。空知识点、证书下架或没有同证书可用包时两钮禁用，并写明原因。未消灭时，正文区仍可点「标记已消灭」。
- 复练同类进入出题设置（`from=retrainSimilar`），预填本题知识点，可删减。删光后「AI 开始出题」不可点。提交 `source=retrain_similar` 和 `knowledgePointIds`，不改刷题包。
- 题型变异在详情直接创建会话（`source=variant`、`count=1`、`mode=practice`），再进入进度页。进度页若露出出题设置底衬，整页不能改题量、模式或题型。失败可「重新生成」（新会话）或「返回详情」。加载文案含「答对不消灭原错题」。

约束见 [复练 UI 约束](delivery/retrain-C-ui-constraints-v0.1.0-C.md)。

## 题库落库与免费用户题库优先

正式规则见 [TB-17 契约](contracts/tb17-bank-persist-C-contracts-v0.1.0-C.md)（v0.1.0-C）。这里只记已接通的行为。

AI 原创和题型变异在结构校验通过后写入独立表 `question_bank`。每行带领域、证书、教材（独立知识点为空）、知识点、难度、入库来源（`ai` 或 `ai_variant`）和题干指纹 `content_key`。指纹算法和错题键相同，里面有 NUL，所以这一列是 `bytea`，存的是同一串 UTF-8。同一证书下指纹相同只保留第一行，后来的卷引用已有 id。取消或失败会删掉本场 `paper_questions`，不删题库。历史试卷和错题不回填。

`normal` 和 `retrain_similar` 的组卷顺序是：未消灭错题（比例不变）→ 题库 → AI 补齐。题库分支只在后管开关 `freeUserBankFirst` 打开且 `isFreeUser` 为真时走。开关默认关。现网没有会员字段，`isFreeUser` 恒为真，代码里留了替身，会员上线后改为「有效会员返回 false」。会员不受开关影响，仍然 AI 出题并入库。`variant` 不抽题库，成功的变异题照样入库，来源是 `ai_variant`。

抽题只取本证书、`online`、题型落在本场设置、知识点与本场有交集的行。难度只是软匹配，不够就忽略难度。近 30 天已交卷和最近 3 场已交卷里出现过的题干指纹不再抽。知识点不够不放宽到整张证书，剩下的交给 AI。不做题型或难度的强制配比。

`paper_questions.source` 增加 `bank`。从题库抽入的题 `bank_question_id` 必填。AI 题建议带刚入库的 id。错题表增加可空 `bank_question_id`，消灭和带入仍按题干指纹，不改成只认题库 id。

开关的读写见 [后管系统设置](admin-system-settings.md)。小程序创建会话的请求体不变，也不下发这个开关。

## 还没做

- 后管发布 Prompt。本地靠迁移种子
- 课件提炼的会员配额。上传本身见 [课件](courseware.md)
- `wrongSet`「再练这 N 道」。枚举已留好，创建请求会拒绝
- 弱项临时包。复练同类只做会话级知识点覆盖
- 每题限时没有逐题时钟，考试里把它折成整卷截止时间
