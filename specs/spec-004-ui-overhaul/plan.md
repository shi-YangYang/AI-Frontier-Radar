# Plan

## 涉及模块

- `web/admin/src/styles.css`（布局 tokens、间距节奏、卡片/表格/空状态、响应式）
- `web/admin/src/components/EmptyState.vue`（新，共享空状态）
- `web/admin/src/utils.ts`（相对时间工具）
- `web/admin/src/pages/OverviewPage.vue`（KPI 精简 + 最新消息模块 + 轮询面板精简）
- `web/admin/src/pages/PostsPage.vue`（筛选收起、卡片层级、指标精简、异常提示）
- `web/admin/src/pages/AccountsPage.vue`（组合说明精简、表格列精简、空状态）
- `web/admin/src/pages/PollRunsPage.vue`、`DeliveryEventsPage.vue`（列精简、空状态、删除弱化）
- `web/admin/src/pages/SettingsPage.vue`（紧凑 tab bar、术语统一、列精简、长值处理）
- `web/admin/src/i18n.ts`（中英文案）
- `web/admin/src/components/PaginationBar.vue`（空数据时不渲染或不可见）

## 修改顺序

1. 基建：styles.css 间距/卡片/表格 tokens 收敛；`EmptyState.vue`；`utils.ts` 相对时间；PaginationBar 空态处理。
2. 总览页：KPI 4 卡（带链接）、最新消息模块、轮询面板精简。
3. 消息内容页：筛选收起、卡片层级改造、指标卡精简、异常提示、相对时间。
4. 监听源页：组合说明折叠、表格列精简、空状态。
5. 轮询/发送页：列精简、删除弱化、空状态。
6. 设置页：紧凑 tab bar、术语统一、列精简、长值截断+复制。
7. i18n 全量校对（中英）。
8. 截图验收：用本地服务逐页截图，与旧版对照检查（含空态与有数据态），跑 typecheck/build/smoke。

## 数据流

无后端变更。总览「最新消息」复用 `GET /admin/api/posts?page=1&pageSize=5`；其余页面沿用现有接口。

## 接口变化

无。

## 测试计划

- `npm run typecheck`（含 vue-tsc）、`npm run build`、`npm run smoke:e2e`（回归后端链路不受影响）。
- 截图核对：`.tmp/ui-shots-v2/`，逐页与旧版对照；覆盖 0 源/0 帖空态与 99 帖有数据态；设置页 6 个 tab。

## 风险

- 大面积模板改动可能引入响应式回归：以截图核对 1440 宽度为主，顺带抽查 680 宽度。
- 相对时间会随文案变化影响测试断言：无自动化依赖这些文案，风险低。
- i18n 键增删需同步中英文，否则 vue-tsc 报错（可提前发现）。

## 迁移策略

无数据迁移；纯前端展示层。

## 预计涉及文件

见“涉及模块”。
