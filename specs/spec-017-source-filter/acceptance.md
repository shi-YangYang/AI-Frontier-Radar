# Acceptance

## Result

PASS

## Spec Coverage

- 绑定端可选源：`/portal` 每个绑定卡片支持「全部源 / 自选源」+ 多选保存，空选择=全部源（采用显式模式，避免误清空）。
- 后端过滤：轮询创建事件时跳过 `sourceIds` 非空且不含本源的投递目标；未配置目标行为不变。
- 接口安全：非归属者修改返回 404；源 id 去重并过滤不存在的 id。
- 其它绑定不受影响：未配置过滤的微信目标仍收到该消息。

## Tests

- `npm run typecheck` / `npm run build`：通过。
- `npm run smoke:e2e`：通过（新增 3 项：绑定端保存/越权、选中的源投递、未选源不投递且其它绑定正常）。
- 截图：绑定端编辑器桌面/移动端布局（`.tmp` 临时文件已清理）。

## Issues

- 无。

## Regression Risks

- 老目标无 `sourceIds`，行为与之前一致。
- 同一消息多源重复出现时以首次入库的源为准（文档已说明）。

## Required Rework

- 无。
