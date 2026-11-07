# 后管用户权益与补发·作废

TB-22 / C6。契约是 [tb22-admin-entitlement-grant-revoke-C-contracts-v0.1.0-C.md](contracts/tb22-admin-entitlement-grant-revoke-C-contracts-v0.1.0-C.md)。UI 评审见 [tb22-ui-tech-review-20261107.md](delivery/tb22-ui-tech-review-20261107.md)，结论通过、必改 0。

样式对照 `design/bridge-export/admin-commerce-v2/`（帧 `13:252` 用户权益、`13:816` 补发弹层）。作废没有独立画板，页内确认框复用补发弹层，原因必填。审计可以走页顶抽屉，也可以打开 `/commerce/audit`。

需要后管 Bearer。微信用户 token 调这些地址是 `401` / `UNAUTHORIZED`。

## 页面

侧栏「商业化 / 权益 · v2.0.0」里的「用户权益」可点，进入 `/commerce/entitlements`。

| 入口 | 路由 |
| --- | --- |
| 用户权益 | `/commerce/entitlements` |
| 商业化审计 | 页顶「审计」抽屉，或 `/commerce/audit` |

余额、会员到期、入桶都是只读。入桶固定写成 `inventory（跨日库存）`，不是下拉。日免和当日任务行没有作废按钮。待发放行的「补发」会带上 `pendingId`，数量锁成该行的 qty。没有支付、改价或改 `ends_at` 的控件。

全站 `/system/audit` 仍是占位。

## 接口

| 方法 | 路径 |
| --- | --- |
| GET | `/api/admin/commerce/entitlements/lookup?q=` |
| GET | `/api/admin/commerce/entitlements/:userId` |
| POST | `/api/admin/commerce/entitlements/:userId/grant` |
| POST | `/api/admin/commerce/entitlements/:userId/revoke` |
| GET | `/api/admin/commerce/audit` |

查找按 userId、openId 精确匹配，昵称和脱敏手机是包含匹配。响应只回掩码 openId。

详情会做和 `GET /api/me/entitlement` 一样的懒日切。补发只进跨日库存，走 TB-20 `grantEntitlement`，流水原因仍是 `inventory_grant`。作废把批次 `remain` 收到 0，并追加 `admin_revoke`（delta 为剩余的相反数）。同一批次再作废是 `409` / `ENTITLEMENT_CONFLICT`。

待发放表是 `entitlement_pending_grants`。本刀只读和决议（通过补发 / 作废）。增长任务自动写入留给后续。

补发和作废与 `admin_audit_logs` 在同一个事务里。审计列表只读，默认 `actionPrefix=commerce.`，能看到 TB-21 的配额、SKU、增长，以及本刀的补发和作废。没有更新或删除审计的接口。

原因文案在 `after.reason`。动作名：

| action | 含义 |
| --- | --- |
| `commerce.entitlement.grant` | 补发 |
| `commerce.entitlement.revoke_lot` | 作废库存批次 |
| `commerce.entitlement.void_pending` | 作废待发放 |

## 数据

迁移 `011_entitlement_admin_ops.sql`：

- `entitlement_ledger.reason` 增加 `admin_revoke`
- 新建 `entitlement_pending_grants`，索引 `(user_id, status, created_at DESC)`
- `related_ref` 非空时 `(user_id, related_ref)` 唯一

不建收款、订单或微信回调表。不改四桶账户列，也不改会员 `ends_at`。

`revokeInventoryLot` 在 `@tishuashua/shared/entitlement`（服务端入口）。浏览器 barrel `packages/shared/src/index.ts` 不导出它，也不引入 `node:crypto`。

## 不做

不改 TB-20 扣场顺序和 TB-21 配额 / SKU / 增长的写路径。不签到、不分享、不绑邀请。不接支付。
