# 后管出题配置

TB-11。样式只对 `design/bridge-export/v2.0.0/出题配置/` 这版 Bridge（index sha256 `20b4ef8a5100ec6d257fdd92db9ae8e79f50691e1bd6bf3a82124b0ec1be574e`，styles sha256 `018163ca3b3c0fc66f99ddd8f96358666315eec785515501d179bdd34e1f05ae`）。契约见 [v0.1.0-C](contracts/tishuashua-tb11-13-admin-followup-C-contracts-v0.1.0-C.md) 的 TB-11 条款，样式源以 [v0.1.1-C](contracts/tishuashua-tb11-13-admin-followup-C-contracts-v0.1.1-C.md) 覆盖 H15 / §9 / §10 O4。

页面：

- `/config/prompts` 列表、编辑、版本、锁定
- `/config/question-types` 题型
- `/config/cert-types` 证书题型默认参数

「试出题（下版）」只是禁用按钮，没有试出题接口。小程序出题仍走 `POST /api/quiz/sessions`。

## Prompt

工作行在 `prompt_templates`。已发布内容在 `prompt_template_versions`，一行一个版本，禁止改旧行。发布和回滚都是再 INSERT `max+1`。出题 `loadPrompts` 只 JOIN `current_published_version` 那一行。选不到就回落内置模板，日志 `usedBuiltin=true`，不是出题失败。

迁移 `017_admin_followup_tb11_prompts.sql` 回填现网两条种子：`gen_global_v1`、`gen_cert_teacher_secondary`。新建草稿 `version=0`，第一次发布写成 version 1。

未知 `{{name}}` 不能发布。可注入的是现网 8 个；模板带 variant 时再允许 `originalType`、`originalStem`、`originalOptions`。锁定后保存、发布、回滚都是 400。

## 题型与证书默认参数

`question_types.code` 创建后不可改。`enabled=true` 时 `appRendererKey` 必须是 `single` / `multi` / `judge`。`fill` 可以先登记为停用。

默认题量、占比和分值在 `cert_question_type_configs`。这个接口不改 `certificates.enabled_question_type_codes`。启用子集仍在内容配置的证书抽屉里改。

## 审计和工作台

发布、回滚、锁定、解锁、题型启用或停用、默认参数保存，当时写入 `admin_audit_logs`。工作台「待发布草稿」读 `GET /api/admin/prompt-templates/stats` 的 `pendingDraftCount`。
