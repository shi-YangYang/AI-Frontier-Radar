# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] “夜间静默”开关关闭态使用中性浅灰、开启态使用 accent，开/关可辨
- [x] “接收源”改为「全部接收 | 按主题包 | 自定义」分段选择器
- [x] 源选择流程与保存语义保持现状（取消最后一个源回到全部接收并收起面板）
- [x] 绑定后右栏合并为单张「推送设置」卡，内含夜间静默与接收源两个分组
- [x] 消息页 PC 3 列网格，`pageSize = 18`，数字分页替代「加载更多」
- [x] 移动端单列并使用同款数字分页
- [x] 新增文案中英文 i18n
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S2
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`web/admin/src/pages/PortalPage.vue`、`web/admin/src/public.css`、`web/admin/src/i18n.ts`
  - 确认 `.me-segmented` 三分段、`.me-settings-card` 单卡分组、`.me-post-list` 三列网格、`postsPagination.pageSize = 18`、`goToPage` 分页入口
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22，后端回归，不覆盖前端视觉）
- 未执行：真实浏览器截图/视觉回归与移动端尺寸人工检查。

## Issues

- 本次为纯前端改动，无自动化 UI 测试；三列断点、长文折叠与分页边界仅通过代码审阅确认。
- 源选择流程沿用既有逻辑，未在本轮重新做交互回归。

## Regression Risks

- 分页与搜索组合需统一回到第 1 页并重置长文展开状态。
- 分段选择器只替换视觉控件，`sourcesAll` 状态映射不得改变保存语义。
- 移动端 1 列布局与分页控件需保持可点击区域。

## Required Rework

- 无。
