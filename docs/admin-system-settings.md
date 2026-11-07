# 后管系统设置

本页只接 TB-17 的「免费用户题库优先」。数据保留周期、角色和审计仍是占位。商业化会员、支付和配额不在这一刀。

开关默认关。打开后，免费用户组卷在错题带入之后先从 `question_bank` 抽题，不够再调 AI。关闭时免费用户仍全程 AI。两种情况新生成的题都会入库。会员不受这个开关影响。现网还没有会员字段，接口侧 `isFreeUser` 恒为真，会员旁路留到商业化切片。题干指纹含 NUL，库里用 `bytea` 保存同一串字节。

小程序没有这个开关，创建出题会话的请求体也不接受它。

## 接口

需要后管 Bearer。微信用户 token 返回 `401` / `UNAUTHORIZED`。

`GET /api/admin/system-settings/freeUserBankFirst`

```json
{
  "key": "freeUserBankFirst",
  "enabled": false,
  "updatedAt": "2026-11-07T06:00:00.000Z",
  "updatedBy": "admin"
}
```

没有配置行时仍是 200，`enabled` 为 false，`updatedAt` 和 `updatedBy` 为 null。迁移会种一行 `enabled: false`。

`PUT /api/admin/system-settings/freeUserBankFirst`

```json
{ "enabled": true }
```

缺字段、不是布尔，或带了别的字段，返回 `400` / `VALIDATION_ERROR`。成功 200，响应和 GET 相同。`updatedBy` 是当前后管用户名。

## 缓存

Worker 经 `readFreeUserBankFirst` 读这个值。Redis 键 `sysset:freeUserBankFirst`，TTL 60 秒，值是 `1` 或 `0`。PUT 成功后必须删除这个键。删除失败返回 `503` / `REDIS_UNAVAILABLE`。数据库里的新值已经写上，再 PUT 一次即可补删。

缓存读失败时出题直读数据库，不因为 Redis 抖动把整场打成失败。没有配置 `REDIS_URL` 时也不做缓存，每次读数据库。

## 页面

后管导航「系统」里的「免费用户题库优先」进入 `/settings`。文案写明仅影响免费用户、默认关。这一页是占位实现，用来调用上面的接口。正式像素要等 UI 技术评审，不读 Figma `get_design_context`。

出题编排见 [出题](quiz.md)。
