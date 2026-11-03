# 后管改目录

登录后的管理后台可以维护小程序用的官方目录：领域、证书、教材和知识点。写入走 `admin-gateway`，和帐密登录共用 `AdminSessionGuard`。小程序仍读 `/api/catalog/*`，不会读这些后管地址。

`GET /api/certificates` 是小程序的证书查询，和这里不是同一套接口。见 [证书查询](certificates.md)。用户从课件提炼出来的教材和知识点带 `owner_user_id`，后管树里不出现，也不能改。

本地没有后管时，启动 API 仍会写入 [刷题包](packs.md) 里的种子。种子按 `code` 冲突跳过，不会覆盖已经改过的行。

## 上下架和删除

`status` 只有 `online` 和 `offline`。小程序目录只返回上架项。

| 操作       | 小程序                                               | 已有刷题包                                                                    |
| ---------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| 领域下架   | 领域列表不再出现，也不能在这个领域里新建包           | 不改。证书仍上架时，包可以改名、换知识点和刷题                                |
| 证书下架   | 证书列表和知识点树都不再出现                         | 与现有规则一致：只能删除，不能改名、换知识点或开始刷题。见 [刷题包](packs.md) |
| 教材下架   | 这本教材和它下面的知识点不出现在树上，也不能放进新包 | 已经选进去的知识点还在。改名不受影响；换知识点时不能再选这本教材              |
| 知识点下架 | 树上不再出现，也不能放进新包                         | 已经选进去的记录还在，直到用户自己换知识点                                    |
| 分组       | 分组节点不会出现。它下面已上架的知识点仍挂在教材下   | 分组不能放进刷题包                                                            |

删除是另一条路。仍被引用时返回 `409` / `CATALOG_IN_USE`，数据不变：

- 领域下还有证书
- 证书仍被刷题包、错题或课件引用
- 教材或知识点（含子节点）仍在某个刷题包里，或下面还有用户课件知识点

证书下架后包只可删除，所以要先删掉这些包，或改用下架而不是删除证书。删掉一张不再被引用的证书时，只挂在它上面的官方教材和独立知识点会一起删掉；还挂在其他证书上的教材会留下。

一本教材可以挂多张证书。改名称或上下架对所有挂接同时生效。从一张证书「卸下」只去掉这次关联，不删教材。

## 接口

都在 `/api/admin/catalog` 下，需要 `Authorization: Bearer <后管 token>`。先按 [管理后台登录](admin-login.md) 拿到 token。微信用户 token 返回 `401` / `UNAUTHORIZED`。

编码会去掉首尾空白并转成小写。只能使用小写字母、数字和连字符，最长 64，全局不能重复。名称最长 80。排序是 0 到 10000 的整数。知识点层级由父节点决定，最深 4 级。分组不能带出题提示；知识点必须有。

```bash
TOKEN=$(curl -sS -X POST http://127.0.0.1:3000/api/admin/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"tishuashua-admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')
```

上面的口令要和 API 环境里的 `ADMIN_PASSWORD` 一致。

领域：

```bash
curl -sS http://127.0.0.1:3000/api/admin/catalog/domains \
  -H "authorization: Bearer $TOKEN"

curl -sS -X POST http://127.0.0.1:3000/api/admin/catalog/domains \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"code":"law","name":"法律","sortOrder":3}'
```

`PUT /api/admin/catalog/domains/:id` 改 `code`、`name`、`status`、`sortOrder`，至少要有一个字段。`DELETE` 在还有证书时失败。

证书挂在领域下。列表和详情都含下架项。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/admin/catalog/domains/领域id/certificates \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"code":"law-basic","name":"法律基础","totalScore":100,"passScore":60}'
```

不传 `enabledQuestionTypeCodes` 时默认 `single`、`multi`、`judge`。及格分可以不传。`passScore` 大于 `totalScore` 是 `400` / `VALIDATION_ERROR`。

下架：

```bash
curl -sS -X PUT http://127.0.0.1:3000/api/admin/catalog/certificates/证书id \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"status":"offline"}'
```

树：

```bash
curl -sS http://127.0.0.1:3000/api/admin/catalog/certificates/证书id/tree \
  -H "authorization: Bearer $TOKEN"
```

`textbooks[].nodes` 是分组和知识点的层级。`independentPoints` 是不挂教材的知识点。`linkableTextbooks` 是还没挂到这张证书的官方教材，包括已经挂到别的证书上的，也包括卸下后没有证书的。

```bash
curl -sS -X POST http://127.0.0.1:3000/api/admin/catalog/certificates/证书id/textbooks \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"code":"law-book","name":"法律教材"}'

curl -sS -X POST http://127.0.0.1:3000/api/admin/catalog/certificates/证书id/textbooks/link \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"textbookId":"已有教材id"}'

curl -sS -X POST http://127.0.0.1:3000/api/admin/catalog/textbooks/教材id/nodes \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"code":"law-intro","name":"法的概念","promptHint":"围绕法的概念出选择题"}'

curl -sS -X POST http://127.0.0.1:3000/api/admin/catalog/certificates/证书id/knowledge-points \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"code":"law-free","name":"独立知识点","promptHint":"综合考察"}'
```

分组把 `kind` 设为 `group`，不要出题提示。子节点用 `parentId`。`PUT /api/admin/catalog/knowledge-points/:id` 可以改父节点，但父节点必须在同一本教材里，也不能移到自己下面。

`DELETE /api/admin/catalog/certificates/:certificateId/textbooks/:textbookId` 只卸下。`DELETE /api/admin/catalog/textbooks/:id` 和 `DELETE /api/admin/catalog/knowledge-points/:id` 才删除。删除分组会带上子节点。

小程序侧确认：用微信登录 token 调 `GET /api/catalog/domains`、`GET /api/catalog/domains/:domainId/certificates` 和 `GET /api/catalog/certificates/:certificateId/knowledge-tree`。新上架的内容会出现；下架后消失。后管 token 不能调这些小程序接口。

## 错误码

| code                   | 何时                                                     |
| ---------------------- | -------------------------------------------------------- |
| `VALIDATION_ERROR`     | 字段缺失、类型不对、编码不合法、编码重复、及格分超过总分 |
| `UNAUTHORIZED`         | 没有后管会话、会话失效，或用了微信 token                 |
| `NOT_FOUND`            | 领域、证书、教材或知识点不存在；用户课件也按不存在处理   |
| `CATALOG_IN_USE`       | 仍被引用，不能删除                                       |
| `DATABASE_UNAVAILABLE` | 数据库不可用                                             |

`PACK_UNAVAILABLE` 仍只出现在刷题包修改上，不是目录接口的错误码。

## 管理后台

```bash
pnpm dev:admin
```

打开 <http://127.0.0.1:5173>，用管理员帐号进入后点「目录」。

1. 新建领域，再新建证书。左侧选中后，中间能看到这张证书。
2. 新建教材，加一个知识点，填出题提示。也可以加分组，再在分组下加子节点。
3. 用小程序帐号请求 `/api/catalog/domains`，能看到刚上架的领域；知识点树里能看到知识点，看不到分组。
4. 下架证书。确认框会说明已有刷题包只能删除。选领域时的证书列表不再返回它。已经关联过的用户仍能在证书查询里看到下架状态，见 [证书查询](certificates.md)。
5. 把证书重新上架，或删除没有被刷题包引用的测试数据。

课件列表、错题和证书与成绩页面仍是空壳。小程序证书查询不在这些页面里。

## 测试

```bash
pnpm test
```

不连数据库的测试覆盖组树、层级和出题提示。PostgreSQL 与 Redis 都能连上时，集成测试会走完整链路：无会话和微信 token 被拒绝、新建目录后小程序能读到、分组和用户课件不出现在小程序树、知识点或教材被刷题包占用时不能删除、领域下架后已有包仍可改名、证书下架后包返回 `PACK_UNAVAILABLE` 且只能删除。连不上就跳过，不把测试标成失败。
