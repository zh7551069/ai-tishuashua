# 上传课件与 AI 提炼

选知识点页可以上传一份课件或书籍。API 把文件存进对象存储，Worker 异步提炼知识点。页面关掉之后任务还在跑。提炼成功后勾选草稿，写入当前证书下只属于自己的教材「我的课件」，也能并进当前刷题包。回到选知识点树就能勾选这些知识点。

本期不做商业化里的「免费终身 1 次提炼」配额。上传接口不拦次数。后管可以只读查看全站上传和提炼任务，见 [后管课件](admin-courseware.md)。

## 开关和存储

`LLM_MOCK` 与出题共用。只有 `true` 或 `1` 才生效，默认关闭。API 和 Worker 都读它。

| 状态                                                            | 行为                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `LLM_MOCK` 未开，且没有 `LLM_API_KEY`                           | 上传直接 `503` / `LLM_NOT_CONFIGURED`，不落库、不写文件        |
| `LLM_MOCK=true`                                                 | Worker 按材料里的段落生成草稿，不访问外网                      |
| 配了 `LLM_API_KEY`，且 `LLM_PROVIDER` 为 `deepseek` 或 `tongyi` | Worker 调国内模型。可选 `LLM_BASE_URL`，不填则用供应商默认地址 |

模型超时或非 2xx 记为 `LLM_UNAVAILABLE`。返回内容过不了结构校验记为 `LLM_INVALID_OUTPUT`。文件里读不出文字记为 `COURSEWARE_UNREADABLE`。这些都写在任务的 `error` 上，状态变成 `failed`。

只在 mock 打开时，材料正文里单独出现 `[[EXTRACT_FAIL]]` 会模拟提炼失败。真模型不会认这个标记。

对象存储不预置云厂商密钥。

| 配置                                                                                    | 行为                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `OSS_ENDPOINT`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` 有任一项为空 | 写本地目录。默认是仓库下的 `data/courseware`，可用 `OSS_LOCAL_DIR` 改成绝对路径               |
| 上面四项都有                                                                            | 用 S3 兼容接口。`OSS_REGION` 默认 `us-east-1`。`OSS_FORCE_PATH_STYLE` 默认 true，方便接 MinIO |

API 和 Worker 必须看到同一套变量，否则 Worker 读不到刚上传的文件。本地目录按仓库根计算，不跟进程的工作目录走。

可选的本机 MinIO，口令只给开发用：

```bash
docker run -d --name tishuashua-minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=tishuashua -e MINIO_ROOT_PASSWORD=tishuashua \
  minio/minio server /data --console-address :9001
```

建桶 `tishuashua` 后在 `.env` 里写：

```bash
OSS_ENDPOINT=http://127.0.0.1:9000
OSS_BUCKET=tishuashua
OSS_ACCESS_KEY_ID=tishuashua
OSS_ACCESS_KEY_SECRET=tishuashua
OSS_REGION=us-east-1
OSS_FORCE_PATH_STYLE=true
```

不填这些也能跑，文件会落在 `data/courseware`。

## 格式

单文件不超过 50MB。扩展名只收 `ppt`、`pptx`、`pdf`、`doc`、`docx`。

- PPTX、DOCX 读 Office Open XML 里的文本。
- PDF 读文字绘制指令；压缩流只处理 FlateDecode。复杂字体编码可能读不出来，这时任务失败，错误码 `COURSEWARE_UNREADABLE`。
- 老的 PPT、DOC 没有单独的解析库，按二进制里的文字片段提取。扫描件和纯图片课件会失败。

本期是直传到 API，再由 API 写入对象存储，没有单独的预签名 URL。

## 知识点挂在哪

勾选「加入知识点树」之后，服务端为这个用户、这张证书准备一本教材，名字固定是「我的课件」。选中的草稿会变成这本书下的知识点，`owner_user_id` 是当前用户。证书树只把官方教材和「我的教材」发给本人。别的用户看不到，也不能把这些 id 放进自己的刷题包。

请求里带了 `packId`，并且这个包属于你、证书一致、证书仍上架，这些知识点会追加进该包，原有知识点保留。不带 `packId` 就只进树，回到选知识点页再勾选保存。

同一批草稿再提交一次会返回原来的知识点 id。改勾选范围会 `409`。

## 启动

```bash
pnpm deps:up
pnpm dev:api
pnpm dev:worker
```

迁移 `006_courseware_extract.sql` 给上传和提炼补进度、草稿和失败原因，并给教材、知识点加上 `owner_user_id`。只开 API 时任务停在 `pending`，页面可以一直轮询。

本地没有 Key 时：

```bash
LLM_MOCK=true
LLM_PROVIDER=deepseek
LLM_API_KEY=
```

## 小程序

选知识点页「上传课件或书籍」进入 `/pages/courseware/index`。

| 状态     | 表现                                                           |
| -------- | -------------------------------------------------------------- |
| 选择文件 | 说明支持的格式、50MB，以及上传后会自动学习、提炼完可以勾选回树 |
| 上传中   | 进度，以及「上传文件 / AI 学习材料 / 提炼知识点」              |
| 提炼中   | 预计分钟、材料越长越慢、可以先去做别的。关闭页面不会取消       |
| 成功     | 勾选草稿，点「加入知识点树」，再回到树里看到「我的课件」       |
| 失败     | 重新上传，或返回知识点                                         |

从选知识点页离开后再进来，如果这张证书还有未看完的任务，会显示「查看课件提炼」。

主色沿用 `#2563EB`。

## 后管

登录后的管理后台「课件」页只读查看全站上传和提炼任务，见 [后管课件](admin-courseware.md)。它使用后管会话，不能代替上面的小程序进度接口。不重新上传、不取消别人的任务，也不做提炼次数门禁。

## API

都要 `Authorization: Bearer <token>`。先按 [微信登录](wechat-login.md) 拿 token。下面假设 mock 登录和 `LLM_MOCK=true` 已打开，Postgres、Redis 可用。不跑 Worker 时，用文末的方式在测试里直接跑提炼函数；线上要等 Worker 把 `pending` 变成 `succeeded`。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"courseware-user","nick":"课件同学"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

种子里的中学教师资格 id 是 `11111111-1111-4111-8111-111111111201`。上传用 multipart，字段是 `certificateId`、可选的 `fileName`，以及文件字段 `file`。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/courseware/uploads \
  -H "authorization: Bearer $TOKEN" \
  -F "certificateId=11111111-1111-4111-8111-111111111201" \
  -F "fileName=笔记.docx" \
  -F "file=@./笔记.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document"
```

HTTP 201。此时 `status` 是 `pending`，`stage` 是 `uploading`，`progress` 是 20，`drafts` 为空。`estimatedMinutes` 大约每 1MB 一分钟，最少 1 分钟，最多 30 分钟。mock 通常更快结束，提示仍按文件大小估算。

轮询：

```bash
curl -sS http://127.0.0.1:3000/api/courseware/jobs/任务id \
  -H "authorization: Bearer $TOKEN"
```

阶段是 `uploading`（已入库，等待学习）、`learning`、`extracting`，完成后 `done`。别人的任务返回 `404`。

取消只接受 `pending` 和 `running`：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/courseware/jobs/任务id/cancel \
  -H "authorization: Bearer $TOKEN"
```

已经成功或失败再取消会 `409`。取消是协作式的：正在打的模型请求会在这一步结束后停住，不写草稿。

成功后勾选回树。`draftIds` 必须是这次草稿里的 id。`packId` 可省略。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/courseware/jobs/任务id/commit \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"draftIds":["草稿id"],"packId":"刷题包id"}'
```

然后拉树，能看到「我的课件」：

```bash
curl -sS http://127.0.0.1:3000/api/catalog/certificates/11111111-1111-4111-8111-111111111201/knowledge-tree \
  -H "authorization: Bearer $TOKEN"
```

## 错误码

| HTTP | code                     | 何时                                                             |
| ---- | ------------------------ | ---------------------------------------------------------------- |
| 400  | `COURSEWARE_UNSUPPORTED` | 不是 PPT / PPTX / PDF / DOC / DOCX                               |
| 400  | `COURSEWARE_TOO_LARGE`   | 超过 50MB                                                        |
| 400  | `VALIDATION_ERROR`       | 空文件、没选文件、草稿 id 不在结果里                             |
| 401  | `UNAUTHORIZED`           | 没有登录                                                         |
| 404  | `NOT_FOUND`              | 证书下架、任务不存在，或看别人的任务                             |
| 409  | `VALIDATION_ERROR`       | 还没成功就提交，或成功后改勾选范围，或当前状态不能取消           |
| 409  | `PACK_UNAVAILABLE`       | 带了已下架证书的刷题包                                           |
| 503  | `LLM_NOT_CONFIGURED`     | 上传时没有 Key 且没开 mock。任务中途缺 Key 也会记在 `error.code` |
| 503  | `REDIS_UNAVAILABLE`      | 入队失败。这种情况下上传记录会删掉                               |

任务失败时 HTTP 仍是 200 的进度响应，看 `status: failed` 和 `error.code`。还可能是 `LLM_UNAVAILABLE`、`LLM_INVALID_OUTPUT`、`COURSEWARE_UNREADABLE`、`EXTRACT_FAILED`。
