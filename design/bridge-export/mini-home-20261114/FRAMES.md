# 题刷刷小程序首页（新）·黄绿 四帧对稿

权威源：辉 2026-11-14 16:23 Asia/Shanghai 点名的本机 Figma Bridge 导出
`/Users/zenghui/Documents/code/Figma-Bridge-main/output`（16:22 导出）。
本包是该导出的拷贝（index.html / styles.css / svgs）+ 已压好的插画，供对照。
禁止 get_design_context、design/dev-cache、figma-dev-cache、Figma Dev 在线取样式。
禁止把导出里两张 1536×1024 原图（各约 1.55MB）提交进仓库。

## 四帧（390×844，黄绿，0 新接口）

1. 首页（新）·黄绿·多包·男
2. 首页（新）·黄绿·多包·女
3. 首页（新）·黄绿·单包
4. 首页（新）·黄绿·空态

注意：导出标签和插画对调了——画面 left=0 标「多包·男」实际是女插画 87ad…png；left=470 标「多包·女」实际是男插画 44cac…png。实现以画面人物为准，不要按错位的帧名选图。

## 插画（替换现有路径，不要另拷一份）

- 男：`apps/mini/src/assets/hero/male.jpg` ← 附件 `male.jpg`
  450×426 JPEG，19510 字节，sha256 见附件文件本身（cover 裁自 44cac9e1…png，3 倍 CSS 盒 150×142，Lanczos）。
- 女：`apps/mini/src/assets/hero/female.jpg` ← 附件 `female.jpg`
  450×426 JPEG，21314 字节。
- 仍由现有 `HeroIllustration` 读本地性别，不新增设置入口，不写 gender 键。
- 微信主包预览上限 2MB。当前 main dist 大约 2043045 字节，余量很紧。这两张是替换不是新增，体积与现网 male.jpg/female.jpg 几乎相同，不要再提交未压缩原图，不要再拷到其它 pages/assets。

## 结构要点（只改首页 UI，不改 API / 其它页口径）

共通：

- 画布 `#f5f5f7`，字色 ink `#1C1917`、muted `#78716C`、次级 `#57534E`，强调 `#65A30D` / `#4D7C0F`，主按钮 `#8ECA3A`。
- 顶栏：浅底圆形人物按钮在「你好，备考人」左侧（36px，tint `#F4F8E8`），点进「我」页。日期在问候下方。右侧不再放 +。
- 不要画 9:41 状态栏和 Home Indicator。
- 周条在白色圆角容器里：今日为实心黄绿圆 + 白字；有完成的日期下方小绿点；无完成则无点。
- `WeekStrip` / `FilterChip` / `EmptyState` / `ListRow` / `AppButton` / `ProgressRing` 是共享组件，「我」页签到等也在用。首页外观用首页 CSS 覆写或向后兼容的 variant，不要把「我」页或其它页的默认外观改走样。

多包 / 单包英雄卡（高 142、圆角 20、白底）：

- 左侧 92 环：中间数字 + `%`（不要再用现在的三行散文 kicker/doneLine/remainLine）。
- 中列数据用现有 `summary` / `activePack` 字段：
  - 多包：`availablePackCount` +「刷题包」；勾 + `completed/total`（如 9/15）；钟 + `remainingCount`（如 6）。
  - 单包：`1 刷题包`；勾 + 当前包 `completed/knowledgePointCount`；钟 + 当前包剩余。
- 右侧插画 150×142、`background-size: cover; position: center`，左侧白到透明渐变。

练习区：

- 多包导语：「按自己的节奏，一包包进步。」单包导语：「今天的每一次练习，都在积累进步。」（稿面有句号。）
- 标题行：「今日练习」+ 右侧绿色 `completed/count`（2/5），再右侧是圆形 + 按钮（黄绿底），点按走现有 `go('plus')`（刷题包列表）。
- 多包才有横向芯片：最左「全部」（未选中，底 `#F0EFEA`，字 `#57534E`）+ 各刷题包芯片。选中包用 tint `#F4F8E8` / 强调描边 `#C0E460`。
  「全部」只做外观并点进现有刷题包列表，不要新接口，不要在前端拼「全部包知识点」清单，不要改 activatePack 语义。
- 单包没有芯片行，只有标题行和 +。
- 卡片标题用当前包 `name`；多包副标题「N 个知识点」；单包副标题「{domainName} · N 个知识点」。删掉现在的「仅显示当前包 · …」「今日知识点练习 · 待练习优先」。
- 知识点行：待练左侧橙钟/叹号图标、标题用 ink；已完成左侧绿勾、标题用 muted。不要右侧「待练习 / 已完成」文案。行间 1px 分隔 `#F3F2EE`。

空态：

- 英雄卡：「练习之旅」/「每一步，都算数」/「从第一题开始，创建刷题包后即可规划今天的练习。」
- 白卡片：「还没有刷题包」+ 现有说明 + 描边圆钮「创建刷题包」（约 40 高，走现有 `go('create')`）。不要「或点击右上方 +」这句（稿面没有）。
- 以稿面为准：空态底部若看不到主按钮「开始今日刷题练习」，就不要再展示它；创建入口只留卡片内按钮。

底部（有包时）：

- 多包脚注贴稿：「将继续 {name} 剩余的 N 项」；报名只用现有 `name`，不要新简称字段。
- 主按钮「开始今日刷题练习」，高 50、全圆、`#8ECA3A`、白字 16/700。沿用现有 CTA 逻辑，不改出题口径。

## 范围

- 只对 `apps/mini` 首页（`pages/home`）及首页必需的样式/插画替换。
- 0 新接口，不改后端，不改 daily-plan API 契约。
- 不要改登录、刷题包列表、出题设置、答题/过程态、结果/练习记录、错题本、「我」页、上传教材，除非共享组件必须加向后兼容 variant。
- 不要把 `dist/` 提交进仓。
- 禁止 squash。从 `origin/main` @ e1d210355fac78f8d3db9171b78afa5501b5d5e2 开分支，用普通提交，开 PR，不要合 main，不要部署。
- 可把本导出（不含 1.55MB 原图）放到 `design/bridge-export/mini-home-20261114/` 方便对照。
- 现有 `daily-plan.test.ts` 等测试要跟着改并保持通过；CI check 必须绿。
