# 后管商业化配置

TB-21 / C5。契约是 [tb21-admin-quota-sku-growth-C-contracts-v0.1.0-C.md](contracts/tb21-admin-quota-sku-growth-C-contracts-v0.1.0-C.md)。UI 评审见 [tb21-ui-tech-review-20261107.md](delivery/tb21-ui-tech-review-20261107.md)，结论通过、必改 0。

这一刀做后管全局配额、权益 SKU 和增长任务配置。样式对照 `design/bridge-export/admin-commerce-v2/`（帧 13:86 / 13:3 / 13:476 / 13:169）。用户权益、补发和作废在 TB-22，见 [admin-entitlement-ops.md](admin-entitlement-ops.md)。

需要后管 Bearer。没有会话，或拿微信用户 token 来调，都是 `401` / `UNAUTHORIZED`。

## 页面

侧栏分组「商业化 / 权益 · v2.0.0」：

| 入口 | 路由 |
| --- | --- |
| 权益 SKU | `/commerce/skus` |
| 全局配额 | `/commerce/quota` |
| 增长任务 | `/commerce/growth` |
| 用户权益 | `/commerce/entitlements`（TB-22，已可点） |

「系统 / 免费用户题库优先」仍在 `/settings`。配额页里的开关调用的是同一条 `GET|PUT /api/admin/system-settings/freeUserBankFirst`，没有第二套键。

配额和增长是整表保存，按钮是「保存并记审计」。「重置为默认」要再确认一次。SKU 在列表里筛选，编辑用抽屉。新建可以填 `code` 和 `type`；编辑时这两项只读。

会员日上限开关永久禁用，文案是「架构禁·永久关闭」。请求体里带 `memberDailyCap` 或 `member_quota` 会 `400`。没有对应的设置键。

配额页写明：改日免不回溯当日 remain，下次跨日发放才用新值。

## 配额

`GET|PUT /api/admin/commerce/quota`

`PUT` 只接受：

```json
{ "dailyFreeSessions": 3, "refineLifetimeLimitFree": 1 }
```

两个都要有。`dailyFreeSessions` 和 `refineLifetimeLimitFree` 都是 1 到 99 的整数。其它字段 `400` / `VALIDATION_ERROR`。

`GET` 里 `memberDailyCap.uiLocked` 恒为 `true`。时区、清零说明、扣场顺序是服务端常量，客户端改不了。

`POST /api/admin/commerce/quota/reset` 恢复 2 和 1。

设置落在 `system_settings`：

| key | 值 |
| --- | --- |
| `dailyFreeSessions` | `{ "sessions": number }` |
| `refineLifetimeLimitFree` | `{ "limit": number }` |

`ensureDay` / `dailyFreeQuota()` 每次直读 `dailyFreeSessions`。没有合法正整数时用 2。同一业务日不再改已经发出的 `daily_free_remain`；业务日滚到下一天时，`daily_grant` 用新的 sessions。TB-20 留下的裸正整数和 `{ "value": n }` 仍能读。

短缓存键是 `sysset:dailyFreeSessions` 和 `sysset:refineLifetimeLimitFree`，TTL 60 秒。PUT 成功后必须删除。删除失败返回 `503` / `REDIS_UNAVAILABLE`，数据库里的新值已经写上。日免发放不读这层缓存，避免删除失败时下一次发放还用旧值。没有 `REDIS_URL` 时不做缓存。

提炼次数提供了 `readRefineLifetimeLimitFree`。权益视图里的免费上限会读这个配置。会员 `unlimited` 不变。课件上传门禁这刀不改。

## 增长

`GET|PUT /api/admin/commerce/growth`

`PUT` 必须是契约 §3.2 的完整对象。缺字段或未知字段都是 `400`。奖励场次是 0 到 99 的整数。

`POST /api/admin/commerce/growth/reset` 恢复默认包。

键名 `growthConfig`。缓存键 `sysset:growthConfig`。本刀只存配置，不签到、不分享、不绑邀请。

## SKU

表 `commerce_skus`。迁移种 5 条：`member_week`、`member_month`、`member_quarter`、`member_year`、`session_pack_5`。`code` 冲突时不覆盖。

| 方法 | 路径 |
| --- | --- |
| GET | `/api/admin/commerce/skus` |
| GET | `/api/admin/commerce/skus/:code` |
| POST | `/api/admin/commerce/skus` |
| PUT | `/api/admin/commerce/skus/:code` |
| POST | `/api/admin/commerce/skus/:code/disable` |
| POST | `/api/admin/commerce/skus/:code/enable` |

列表查询 `type=member|session_pack`，`status=enabled|disabled|all`。默认全部，不分页。

`code` 匹配 `^[a-z][a-z0-9_]{1,63}$`。重复是 `409` / `VALIDATION_ERROR`。`PUT` 的请求体只要出现 `code` 或 `type` 就是 `400`，语句也不会改 `code`。

会员要有 `durationDays`，场次数和库存天数必须为空。加油包要有 `sessions`，有效天数必须为空。不传 `inventoryExpireDays` 时加油包按 365 天记下。页面不露出这个字段。

`priceYuan` 由 `priceFen / 100` 派生。页面按元输入，只接受到分，再换成整数分写入。

停用只改 `enabled`。这刀没有订单，已购权益无从改写。

写入后删除可选缓存 `commerce:skus:v1`。后管列表直读数据库。

## 审计

写操作插入 `admin_audit_logs`（actor、action、target、before、after）。动作包括 `commerce.quota.update`、`commerce.quota.reset`、`commerce.growth.update`、`commerce.growth.reset`、`commerce.sku.create`、`commerce.sku.update`、`commerce.sku.disable`、`commerce.sku.enable`。

审计列表在 TB-22：`GET /api/admin/commerce/audit`。本刀的配额、SKU、增长写入仍进同一张 `admin_audit_logs`。

## 不做

不建收款、下单或回调表。没有统一下单，没有商户密钥，没有 C 端支付页。补发和作废不在本刀，见 TB-22。
