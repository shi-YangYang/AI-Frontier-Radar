# Acceptance

## Result

PASS

## Spec Coverage

- **自动建通道**：主服务启动与每次读取微信状态时执行 `syncWechatDeliveryTargets`：为每个已绑定账号创建/维护 `wechat:<accountId>` 通道（channelType `wechat_clawbot`，目标 = 账号 userId，默认 `enabled: true`）。
- **账号级开关**：微信页签「已绑定微信号」列表新增「接收推送」开关；状态接口返回每账号 `pushEnabled`；`PATCH /admin/api/wechat/accounts/:id/push` 更新；同步逻辑仅更新展示名/目标，不覆盖 `enabled`。
- **自动清理**：删除微信号时同步删除其通道；同账号但 targetKey 非规范的遗留通道（含旧版手工创建）在同步时一并清理，避免重复推送。
- **移除冲突 UI**：微信页签删除「消息投递到微信」区块；投递通道类型下拉移除微信；列表接口新增 `excludeChannelType`，微信通道不再出现在投递通道列表与统计中。

## Tests

- 前后端 typecheck 通过；`smoke:e2e` 72 项全绿（新增 3 项：绑定后自动创建默认开启、单账号关闭后同步不覆盖、删除账号同步移除其通道且不影响其他账号）。
- 实机验证：启动后自动同步出 1 条微信通道并清理了历史手工重复通道；`excludeChannelType` 后投递通道列表为 0 条且统计一致；`PATCH push` 关闭后状态 `pushEnabled=false`，恢复开启正常；UI 截图核对微信页签与投递通道页签。

## Issues

无。

## Regression Risks

低：发送/重试链路未改；同步函数幂等，异常时静默跳过不影响主流程。

## Required Rework

无。
