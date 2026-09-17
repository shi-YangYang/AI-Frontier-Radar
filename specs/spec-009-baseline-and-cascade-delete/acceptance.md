# Acceptance

## Result

PASS

## Spec Coverage

- **首轮行为（文章型源）**：Anthropic / AI2 / Moonshot / Meta / xAI 移除 `firstRunBaseline='all'`，首次轮询仅入库最新 1 条并正常投递（与 RSS 语义一致）；更早的列表条目不再入库。
- **首轮行为（榜单型源）**：GitHub Trending / HF Daily Papers 保留 `firstRunBaseline='all'`——首轮全量入库且不投递（条目为"当天榜单"，避免下一轮把当日剩余条目当新消息补投）。
- **后续轮询**：统一只入库 `xPostId` 大于游标的条目（各源 ID 均含发布时间/抓取时间前缀，语义与"只关注添加之后的消息"一致）。
- **删除级联**：`DELETE /admin/api/watch-accounts/:id` 先删该源帖子的投递事件、再删帖子、最后删源，返回 `{ deleted, deletedPosts, deletedEvents }`；无轮询记录时返回 0。
- **UI**：删除确认文案改为"连同全部消息、投递记录一并删除且不可恢复"；成功提示带删除数量（中/英）。

## Tests

- `npm run typecheck` 通过；`smoke:e2e` 63 项全绿（新增/改写 4 项：Anthropic 首轮仅锚定最新 1 条（旧文不入库、基准投递）、AI2 首轮锚定 + 旧文不入库、删除源级联删除且不影响其他源；GitHub/HF 首轮全量语义维持原用例）。
- 实机验证（临时 arXiv cs.RO 源，不影响现有数据）：首轮入库恰好 1 条；删除后 `deletedPosts: 1`，无残留，库内总量与源数量回到原值（136 条 / 8 源）。

## Issues

- 存量历史数据不会自动清理：如 xAI 的 79 条、Moonshot 的 26 条旧文仍在库中。需要清理时，在管理台删除对应源（现会级联删除其数据）后重新添加即可，新增后只保留最新 1 条。

## Regression Risks

低：仅调整首轮资格判定与删除路径；投递规则、保留策略、Feed 输出未受影响。

## Required Rework

无。
