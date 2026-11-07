# docs/contracts · 接口契约目录

本目录存放 **题刷刷等产品线的正式 API / 事件契约**（OpenAPI、Markdown 契约均可）。

## 命名建议

| 类型          | 示例                                        |
| ------------- | ------------------------------------------- |
| OpenAPI       | `openapi-v1.yaml` 或 `auth-v1.openapi.yaml` |
| 分域 Markdown | `auth.md`、`quiz.md`、`admin-catalog.md`    |
| 异步 / 队列   | `worker-quiz-generate.md`                   |

文件名带域 + 版本；破坏性变更升版本或新开文件并在旧文件顶注解弃。

## 规则

1. **契约归架构师**；全栈按契约实现。
2. **全栈不得私改公共契约不申报**；改字段 / 路径 / 错误码须架构师出变更并进本目录。
3. 契约未进本目录前，完整交付中的接口以架构方案中的契约草图为准，合并前应落盘至此。
4. 秘钥、口令、预发 IP 口令 **不要** 写入契约文件。

## 占位

当前可为占位目录；首份正式契约合并后，在本 README 增加索引表：

| 契约                          | 路径                                                                                                                       | 状态   | 负责人 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 复练同类 / 题型变异           | [retrain-C-contracts-v0.1.0-C.md](retrain-C-contracts-v0.1.0-C.md)                                                         | active | 架构师 |
| TB-17 题库落库与题库优先      | [tb17-bank-persist-C-contracts-v0.1.0-C.md](tb17-bank-persist-C-contracts-v0.1.0-C.md)                                     | active | 架构师 |
| TB-20 权益账本与出题门禁      | [tb20-entitlement-C-contracts-v0.1.0-C.md](tb20-entitlement-C-contracts-v0.1.0-C.md)                                       | active | 架构师 |
| TB-21 后管配额 / SKU / 增长   | [tb21-admin-quota-sku-growth-C-contracts-v0.1.0-C.md](tb21-admin-quota-sku-growth-C-contracts-v0.1.0-C.md)                 | active | 架构师 |
| TB-22 后管用户权益与补发·作废 | [tb22-admin-entitlement-grant-revoke-C-contracts-v0.1.0-C.md](tb22-admin-entitlement-grant-revoke-C-contracts-v0.1.0-C.md) | active | 架构师 |
| TB-23 微信支付与订单回写      | [tb23-wechat-pay-order-C-contracts-v0.1.0-C.md](tb23-wechat-pay-order-C-contracts-v0.1.0-C.md)                             | active | 架构师 |
| TB-24 小程序用尽半屏          | [tb24-miniapp-exhausted-sheet-C-contracts-v0.1.0-C.md](tb24-miniapp-exhausted-sheet-C-contracts-v0.1.0-C.md)               | active | 架构师 |
| TB-25 小程序会员定价          | [tb25-miniapp-membership-pricing-C-contracts-v0.1.0-C.md](tb25-miniapp-membership-pricing-C-contracts-v0.1.0-C.md)         | active | 架构师 |
