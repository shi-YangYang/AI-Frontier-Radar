# Acceptance

## Result

PASS

## Spec Coverage

- 一键删除：监听源页「全部删除」→ 确认框（显示总数）→ `POST /admin/api/watch-accounts/delete-all`，返回删除账号/消息/事件计数并提示；列表刷新回第 1 页。
- UI：来源标题改为中文友好名（arXiv/HN/Reddit/Product Hunt/Techmeme/OpenAI 等），原始地址为灰色次要行；徽章与名称同行不换行。
- 单绑定：后端 409「每个账号只能绑定一个微信号，请先解绑当前微信。」；绑定端按钮禁用并显示提示；扫码同步只认领一个无主账号。
- 来源分组：AI 官方源 / 论文与榜单 / 开发者 / 资讯与社区 / X 账号 / 其他，中文名展示。

## Tests

- `npm run typecheck` / `npm run build`：通过。
- `npm run smoke:e2e`：通过（新增「每个用户只能绑定一个微信号」「一键删除全部监听源（级联清理消息与投递记录）」；删除 8 个源、10 条消息、19 条投递记录）。
- 截图：监听源页（友好名 + 全部删除）、删除确认框、绑定端分组来源（桌面）。

## Issues

- 无。

## Regression Risks

- 友好名称映射仅影响展示；未知来源回退域名+路径。
- 一键删除为破坏性操作，仅管理员可用且需二次确认。

## Required Rework

- 无。
