# Acceptance

## Result

PASS

## Spec Coverage

- **新增 4 个渠道**：`wecom_webhook`（企业微信 markdown）、`dingtalk_webhook`（markdown + 可选加签）、`bark`（完整推送地址）、`generic_webhook`（固定 JSON 字段）；均实现统一 `DeliveryChannelSender` 接口并入注册表，投递处理器按目标 `channelType` 分发。
- **目标配置**：新增 `delivery_targets.config_json` 列（迁移 `20260917010000_add_delivery_target_config`），当前存钉钉加签密钥；创建/更新/测试接口支持渠道类型与配置，未知类型与缺设备 Key 的 Bark 地址被拒绝。
- **分渠道订阅规则**：规则新增 `targetKeys`（空 = 全部通道，兼容既有规则）；保存时校验引用的通道存在；投递时按「命中规则指定通道的并集」创建投递事件；无启用规则仍为全量、未命中不投递。
- **管理台**：页签更名「投递通道」（渠道类型选择、按类型变化的 URL 占位、钉钉加签字段、列表渠道标签与脱敏预览、测试发送）；订阅规则表单与规则列表展示「生效通道」。

## Tests

- `backend:typecheck`、`admin:typecheck` 通过；`smoke:e2e` 68 项全绿（新增 5 项：创建 4 渠道、渠道校验拒绝、4 渠道 payload 与钉钉加签校验、分渠道规则命中仅投指定通道、未命中不投递并清理规则）。
- 实机验证：迁移自动应用；创建本地通用 Webhook 通道 → 测试发送返回 200 且接收器收到完整 payload（author/title/text/url/postedAt）；规则引用不存在通道返回 400、引用有效通道保存成功；删除测试通道后无残留。
- UI 截图核对：投递通道页签（类型/名称/URL/列表）与订阅规则「生效通道」勾选正常。

## Issues

无。

## Regression Risks

低：既有 `feishu_webhook` 走同一注册表的适配器，飞书发送逻辑未改动；规则默认 `targetKeys=[]` 保证向后兼容；迁移仅新增列。

## Required Rework

无。
