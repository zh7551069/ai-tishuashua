# 后管题库（只读）

TB-19 补的只读列表。TB-17 把题目写入 `question_bank`，当时明确没有列表 API。这一页只查看已落库的题，不能编辑、删除、审核、下架或出题。

样式对照 `design/bridge-export/admin-bank-20261107/`（帧 `28:166`，卡 `28:322`）。不读 `design/dev-cache`。

## 页面

侧栏「数据查询」里，「题库（只读）」排在「出题日志」和「用户上传教材」之间，路由 `/question-bank`。面包屑是「数据查询 / 题库（只读）」。

筛选项是领域、证书、知识点、时间范围。时间范围默认「近 30 天」。证书下拉在选定领域后才有具体证书，知识点下拉在选定证书后才有具体知识点。未选时按全部查询。点「查询」才提交。

没有数据时，同一张卡里显示「暂无落库题目」和「调整筛选后再查」。行上只有「查看」，打开只读抽屉。页脚是「只读列表 · 无编辑 / 无删除 / 无审核操作」。

## 接口

需要后管 Bearer。微信用户 token 返回 `401` / `UNAUTHORIZED`。只有 GET。没有 POST、PUT、PATCH、DELETE。

`GET /api/admin/question-bank`

| Query              | 说明                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `range`            | `7d`、`30d`、`90d`、`all`。缺省 `30d`，按 `created_at` 相对当前时间 |
| `domainId`         | 可选 UUID                                                           |
| `certificateId`    | 可选 UUID                                                           |
| `knowledgePointId` | 可选 UUID。`kpId` 是别名；两个都写且不一致时 `400`                  |
| `page`             | 缺省 1，最大 10000                                                  |
| `pageSize`         | 缺省 20，最大 100                                                   |

非法 UUID、时间范围或页码返回 `400` / `VALIDATION_ERROR`。

按入库时间从新到旧。`online` 和 `offline` 都返回，本接口不能改状态。抽题仍然只抽 `online`，这一页不改抽题。

```json
{
  "items": [
    {
      "id": "uuid",
      "summary": "关于建设工程施工合同纠纷案…",
      "domainId": "uuid",
      "domainName": "建筑",
      "certificateId": "uuid",
      "certificateName": "一级建造师",
      "kpIds": ["uuid"],
      "knowledgeLabel": "合同管理",
      "source": "ai",
      "createdAt": "2026-11-05T06:22:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

`summary` 是题干压成一行后最多 40 个字，更长以 `…` 结尾。空白题干写成「题目内容无法读取」。`source` 只有 `ai` 或 `ai_variant`。`knowledgeLabel` 是知识点名称用「、」拼接；名称缺失时为空字符串。列表不带选项、答案和解析。

`GET /api/admin/question-bank/:id`

在列表字段上增加 `stem`、`type`（`single` / `multi` / `judge`）、`options`（`{ id, text }[]`）、`answer`（选项 id 数组）、`analysis`（没有则为 `null`）、`difficulty`（`easy` / `medium` / `hard` 或 `null`）、`status`（`online` / `offline`）。不存在返回 `404` / `NOT_FOUND`，说明是「题目不存在」。

```bash
curl -sS "http://127.0.0.1:3000/api/admin/question-bank?range=30d&page=1" \
  -H "Authorization: Bearer 后管token"

curl -sS "http://127.0.0.1:3000/api/admin/question-bank/题目uuid" \
  -H "Authorization: Bearer 后管token"
```

落库规则见 [出题](quiz.md)。开关见 [后管系统设置](admin-system-settings.md)。
