# 增长发奖

TB-29 把签到、每日分享和邀请有礼接到 TB-20 `grantEntitlement`。奖额、开关和封顶只读 TB-21 `growthConfig`（缓存键 `sysset:growthConfig`，60 秒；后管保存时会删掉这把键）。

本页禁止支付。分享、邀请和任务页不得调用 `wx.requestPayment`、`POST /api/orders` 或 mock-notify。购买仍去会员页或加油包页。

## 路由

都要登录 Session。

| Method | Path                         | 作用                                      |
| ------ | ---------------------------- | ----------------------------------------- |
| GET    | `/api/me/growth`             | 今日签到/分享、邀请码、封顶已用、配置快照 |
| POST   | `/api/me/growth/checkin`     | 签到，入 `daily_task`                     |
| POST   | `/api/me/growth/share/token` | 取当日分享 token。空点不发奖              |
| POST   | `/api/me/growth/share/open`  | 被分享者带 token 打开后，给分享者发奖     |
| POST   | `/api/me/growth/invite/bind` | 绑定邀请人。对外用 `inviteCode`           |

冷启动 path 模板是 `/pages/home/index?shareToken=`。邀请参数名是 `inviteCode`。小程序里解析函数已备好，启动时自动 open/bind 随对稿页再接。

交卷不新开 HTTP。生涯第一次成功交卷后，在既有交卷 handler 末尾调用 `growth.onFirstSubmit`。增长失败不回滚交卷：先重试一次，仍失败则写入 `entitlement_pending_grants`（`risk_code=grant_error`）。

## 幂等键

| 场景       | refId                            |
| ---------- | -------------------------------- |
| 签到       | `checkin:{userId}:{bizDate}`     |
| 分享       | `share:{sharerId}:{bizDate}`     |
| 邀请人注册 | `invite_reg_inviter:{inviteeId}` |
| 新用户欢迎 | `invite_reg_invitee:{inviteeId}` |
| 邀请人首刷 | `invite_fs_inviter:{inviteeId}`  |
| 新用户首刷 | `invite_fs_invitee:{inviteeId}`  |

重复请求返回 200，`applied: false`，不加第二次。

签到和分享进 `daily_task` / `task_grant`。拉新进 `inventory` / `inventory_grant`，批次默认 365 天。会员 `membership.active` 时分享不发场次，也不发提炼次，返回 `reason: member_unlimited`。

## 封顶和 pending

邀请人日/周封顶读配置。超额写入既有 `entitlement_pending_grants`，`status` 保持 `pending`。本模块不把 pending 改成 granted，也不跑自动补发。人工处理仍走 TB-22。

一人只能有一个邀请人，不能邀请自己。被邀请人的欢迎奖和首刷奖不受邀请人封顶限制。

## 小程序

「我」页签到按钮调用 checkin，成功后刷新权益。三态文案和禁支付不变。每日分享对稿 `122:8`，邀请有礼对稿 `122:10`。样式对照 `design/bridge-export/mini-commerce-v2/`（`index.html` md5 `522993188277e4e4d1bffeb7e75d2d1e`）。会员分享展示「今日已享会员不限场」，不改发提炼次。冷启动 query `shareToken` / `inviteCode` 在登录后补一次 open / bind。UI 评审见 [TB-29 三行](delivery/tb29-ui-tech-review-20261107.md)。

契约：[TB-29 C](contracts/tb29-daily-share-invite-C-contracts-v0.1.0-C.md)。
