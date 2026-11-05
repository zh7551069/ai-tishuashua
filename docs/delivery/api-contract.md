# API 契约约定

## 放哪里

正式接口契约统一放在仓库：

```text
docs/contracts/
```

说明与占位见：[`docs/contracts/README.md`](../contracts/README.md)。

## 归属与变更

| 角色 | 职责 |
|------|------|
| **架构师** | 契约唯一归属；新建 / 修订路径、错误码、分页、字段 |
| **全栈** | 按契约实现；**不得私改公共契约不申报** |
| **产品经理** | 切片记录链到契约文件；变更时组织再评审 |

## 变更流程（简）

1. 架构师改 `docs/contracts/` 并提 PR（或随架构 PR）  
2. 影响 UI 信息架构时，再走 UI 技术评审  
3. 全栈跟实现 PR，描述中写明契约版本 / 文件路径  

## 与交付文档关系

- UI 评审：`docs/delivery/ui-tech-review.md`  
- 前端对照：`docs/delivery/dev-mode-checklist.md`  
- PR 冒烟：`.github/PULL_REQUEST_TEMPLATE.md`
