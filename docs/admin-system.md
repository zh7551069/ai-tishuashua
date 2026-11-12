# 后管系统（TB-13）

角色矩阵、全站审计和数据保留。登录仍是环境变量里的一份帐密，本期不按矩阵拒写，也没有封禁 API。

样式对照 `design/bridge-export/v2.0.0/系统/`。对稿按主区标题：`(0,0)` 数据保留周期、`(1520,0)` 操作审计、`(0,980)` 角色权限。主色 `#2563EB`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / PUT | `/api/admin/system/roles` | 读写能力矩阵。无行时返回默认矩阵 |
| GET | `/api/admin/system/audit` | 只读 `admin_audit_logs`。`actionPrefix` 默认空。分页默认 20，上限 100 |
| GET / PUT | `/api/admin/system/retention` | 出题日志天数、用户上传 / 提炼天数。整数 1…3650，默认 90/90 |
| POST | `/api/admin/system/retention/preview` | 只计不删。请求体可临时给天数，不写回 |

`GET /api/admin/commerce/audit` 仍在，默认前缀仍是 `commerce.`，pageSize 上限仍是 50。

`PUT /api/admin/system-settings/freeUserBankFirst` 路径和语义不变，成功后补 `system.freeUserBankFirst.update`。

内容配置的新建、修改、删除、教材挂接会写 `catalog.*`。证书更新的摘要含上下架、及格分和 `enabledQuestionTypeCodes`。

## 清理

Worker 每天 03:00（Asia/Shanghai）跑 `system.retention.purge`。选择器与 preview 相同：`created_at` 早于 `now - 天数` 才到期，等于截止瞬时不删。先写审计（actor=`worker`），再删除到期的 `quiz_generation_logs` 和 `user_uploads`。`extract_jobs` 随上传外键级联删除。

不删除练习记录、错题、证书成绩、题库，也不提供这些数据的自动清理开关。没有到期行时清理仍成功，并留下审计。
