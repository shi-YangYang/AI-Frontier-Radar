# Acceptance

## Result

PASS

## Spec Coverage

- 用户端双页签：消息（分页 + 来源徽章 + 标题/正文 + 查看原文）、微信推送（绑定/会话/额度/静默/来源）。
- 绑定引导：扫码前与扫码中提示「需给 ClawBot 发一条消息」；未激活显示黄色等待条，激活后显示绿色「会话已同步」。
- 额度：进度条 + `本窗口已推送 n/10 条` + 重置说明；满额变红并提示。
- 微信消息 tip：`当前消息[n/10]`，第十条附加「【当前消息容量已满，请发送一条消息重置】」（实机日志验证）。
- 计数器：用户发消息后重置（桥收消息时清空）。

## Tests

- `npm run typecheck` / `npm run build` / `npm run smoke:e2e`（93 项）通过。
- 实机：`GET /accounts` 返回 `sendCount/sendLimit/hasContextToken`；注入计数 9 后发送日志显示 `当前消息[10/10] / 【容量已满】`。

## Issues

- 真实推送到达仍依赖用户给 ClawBot 发消息（平台限制）。

## Required Rework

- 无。
