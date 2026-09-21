# Plan

## 涉及模块（纯前端）

| 模块 | 改动 |
| --- | --- |
| `web/admin/src/pages/PortalPage.vue` | 「接收源」分段选择器；右栏合并「推送设置」卡；消息页网格 + 数字分页；移除「加载更多」 |
| `web/admin/src/public.css` | 开关关闭态配色、分段选择器样式、设置卡分组样式、消息网格（3/2/1 列）、分页控件 |
| `web/admin/src/i18n.ts` | 分段选择器标签、分页 aria/页码等文案（中英） |
| `web/admin/src/api/admin-api.ts` | 如需类型微调（预计仅 pageSize 常量） |

## 实施顺序

1. 微信页结构重排（合并设置卡 + 分段选择器）→ 样式
2. 消息页网格 + 分页（pageSize 18）
3. i18n 补齐 → `npm run typecheck` + `npm run smoke:e2e` 全量回归

## 明确不做

- 源选择流程/语义任何改动（用户确认现状合理）
- 后端任何改动

## 风险

- 分页与搜索组合的状态重置遗漏 → 搜索/翻页统一走 `loadPosts(1, true)` 入口并在翻页时清理展开态
- 分段选择器与原开关状态映射：`sourcesAll`（true=全部）保持为唯一状态源，仅换皮
