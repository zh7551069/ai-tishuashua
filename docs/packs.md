# 刷题包与目录

登录之后可以拉目录、保存刷题包。首页今日进度不读刷题包列表，改走 [每日练习计划](contracts/tb30-home-daily-plan-C-contracts-v0.1.0-C.md) 的 `GET /api/me/daily-plan`。证书下架后，已有包变成不可用：只能删除，不能改名、不能换知识点，首页主按钮也不能开始练习。

课件上传和 AI 提炼见 [课件](courseware.md)。出题设置、AI 出题和拉卷见 [出题](quiz.md)。

## 表

迁移在 API 启动时执行，目录是 `apps/api/migrations`。

| 文件                           | 内容                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `001_users.sql`                | 用户表。刷题包、出题会话和错题不在这里                     |
| `002_catalog_and_learning.sql` | 目录、刷题包，以及出题、错题、Prompt、课件上传和提炼任务表 |
| `003_catalog_seed.sql`         | 教师资格、财会金融的领域 / 证书 / 教材 / 知识点            |
| `004_quiz_generation.sql`      | 出题进度、失败原因、运行令牌、练习作答，以及已发布 Prompt  |
| `005_quiz_submit.sql`          | 进入答题的时间、交卷时间和原因                             |
| `006_courseware_extract.sql`   | 课件所属证书、提炼进度，以及只属于本人的教材和知识点       |
| `007_quiz_retrain.sql`         | 复练同类、题型变异                                           |
| `008_question_bank_and_settings.sql` | 题库与系统设置                                         |
| `009_entitlement.sql`          | 权益账本                                                     |
| `010_commerce_admin_config.sql` | 后管配额、SKU、增长配置                                     |
| `011_entitlement_admin_ops.sql` | 后管补发与作废                                              |
| `012_commerce_orders.sql`      | 订单                                                         |
| `013_growth.sql`               | 邀请关系、每日任务态、分享 token、用户邀请码               |
| `014_daily_plan.sql`           | 每日练习完成：用户、业务日、刷题包、知识点                 |

已有读写 API 的表：

- `domains`、`certificates`：`code`、`name`、`status`（`online` / `offline`）。证书还有 `total_score`、`pass_score`、`enabled_question_type_codes`、`extra_constraint`。
- `question_types`：内置 `single` / `multi` / `judge`。`code` 是主键。
- `textbooks`、`textbook_certificates`：一本教材可以挂多张证书。
- `knowledge_points`：`prompt_hint`、`source_ref`、`parent_id`、`level`、`kind`。没有 `weight`。只有 `kind = knowledge_point` 能放进刷题包。`group` 不会出现在树上，它下面的知识点仍挂在所属教材下。
- `knowledge_point_certificates`：不挂教材的独立知识点。
- `packs`、`pack_knowledge_points`：`user_id`、`domain_id`、`cert_id`、`name`、`active`。每个用户最多一个 `active = true`。`unavailable` 不落库，读的时候看证书是不是 `online`。

出题会写入 `quiz_sessions`、`paper_questions`，并读取 `wrong_items`、`prompt_templates`，见 [出题](quiz.md)。课件上传和提炼使用 `user_uploads`、`extract_jobs`，见 [课件](courseware.md)。

`GET /api/certificates` 是当前用户的证书查询，不是这份目录。字段和出现条件见 [证书查询](certificates.md)。后管登录见 [admin-login.md](admin-login.md)。后管可以维护官方目录，见 [后管改目录](admin-catalog.md)。种子仍会在启动时写入，已有 `code` 不会被覆盖。

## 种子

启动 API 且数据库可连时会自动写入。重复启动不会覆盖已有 `code`。

| 领域               | 证书                             | 说明                                                                                |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| 教师资格 `teacher` | 中学教师资格 `teacher-secondary` | 总分 120，及格 70。含教材「综合素质」「教育知识与能力」，以及独立知识点「文化素养」 |
| 教师资格           | 小学教师资格 `teacher-primary`   | 与中学共用「综合素质」，另有「小学教育教学知识」                                    |
| 财会金融 `finance` | 初级会计职称 `junior-accountant` | 总分 100，及格 60                                                                   |

「综合素质」下有一条下架知识点「教学评价」，以及分组节点「综合素质章节」。树上能看到分组下的「逻辑思维」，看不到分组本身和下架知识点。

后管在「目录」里把证书改成下架，效果和下面的 SQL 一样。手动改库：

```sql
UPDATE certificates
SET status = 'offline', updated_at = now()
WHERE code = 'teacher-primary';
```

恢复：

```sql
UPDATE certificates
SET status = 'online', updated_at = now()
WHERE code = 'teacher-primary';
```

已经指向这张证书的刷题包会变成不可用。新建包时选不到它，因为证书列表只返回上架证书。

## API

都在 `/api` 下。目录和刷题包都要登录，沿用 `Authorization: Bearer <token>`。先按 [微信登录](wechat-login.md) 拿 token。下面假设 mock 已打开，Postgres 和 Redis 可用。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/auth/wechat/login \
  -H 'content-type: application/json' \
  -d '{"code":"dev-user-1","nick":"备考同学"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

领域：

```bash
curl -sS http://127.0.0.1:3000/api/catalog/domains \
  -H "authorization: Bearer $TOKEN"
```

把返回里的教师资格 `id` 放进下一步：

```bash
curl -sS http://127.0.0.1:3000/api/catalog/domains/领域id/certificates \
  -H "authorization: Bearer $TOKEN"
```

只含 `status = online` 的证书。字段有 `totalScore`、`passScore`、`enabledQuestionTypeCodes`、`extraConstraint`。

知识点树：

```bash
curl -sS http://127.0.0.1:3000/api/catalog/certificates/证书id/knowledge-tree \
  -H "authorization: Bearer $TOKEN"
```

`nodes` 里教材是 `{ kind: "textbook", children: [...] }`，独立知识点是 `{ kind: "knowledge_point" }`。半选不由服务端计算。

保存刷题包。不传 `name` 时用证书名。成功后这个包成为当前包，HTTP 201。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/packs \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"domainId":"领域id","certId":"证书id","knowledgePointIds":["知识点id"]}'
```

列表里的 `activePackId` 就是当前包：

```bash
curl -sS http://127.0.0.1:3000/api/packs \
  -H "authorization: Bearer $TOKEN"
```

重命名，或同时更换知识点。小程序用 PUT，因为微信请求方法没有 PATCH。

```bash
curl -sS -X PUT http://127.0.0.1:3000/api/packs/刷题包id \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"中学冲刺"}'
```

设为当前包。下架包也可以被选中，这样首页能显示置灰态：

```bash
curl -sS -X POST http://127.0.0.1:3000/api/packs/刷题包id/activate \
  -H "authorization: Bearer $TOKEN"
```

删除。如果删的是当前包，响应里的 `activePackId` 是剩下的最近一个包，没有剩余包时为 `null`。

```bash
curl -sS -X DELETE http://127.0.0.1:3000/api/packs/刷题包id \
  -H "authorization: Bearer $TOKEN"
```

证书已下架时，读取仍是 200，`unavailable` 为 `true`。改名或换知识点返回 `409`，`code` 为 `PACK_UNAVAILABLE`。删除仍然成功。别人的包返回 `404`。教材 id、分组节点、其他证书的知识点、空数组都会是 `400` `VALIDATION_ERROR`。

## 小程序

`pnpm dev:mini` 之后用微信开发者工具打开 `apps/mini`。

| 页面                           | 路径                            |
| ------------------------------ | ------------------------------- |
| 首页，无包 / 有包 / 不可用     | `/pages/home/index`             |
| 选领域                         | `/pages/pack/domain/index`      |
| 选证书                         | `/pages/pack/certificate/index` |
| 选知识点（二级树、半选、搜索） | `/pages/pack/knowledge/index`   |
| 出题设置                       | `/pages/quiz/index`             |

无包时首页是每日练习的空态，主按钮禁用，文案是「创建刷题包后，即可开始今日练习」。「创建刷题包」和右上「+」进入选领域。保存成功后回到首页。有包时进度环、已完成项和知识点列表都来自 `GET /api/me/daily-plan`，待练习排在前面。多个包时顶部汇总只算可用包，芯片可以切换当前包。不可用包仍出现在芯片上，但不进汇总，主按钮禁用。

切换刷题包仍是底部 Sheet：从头图「…」或芯片长按打开。单选即设为当前包，新建进入选领域，重命名和删除都要确认。不可用包不能重命名。

「开始今日刷题练习」或点知识点行进入出题设置，默认只带一个知识点。下架包不能进入出题。选知识点页可以上传课件，见 [课件](courseware.md)。刷题包响应里增加了 `totalScore` 和 `enabledQuestionTypeCodes`，给出题设置用来限制题型。`GET /api/packs` 仍然只返回包元数据。
