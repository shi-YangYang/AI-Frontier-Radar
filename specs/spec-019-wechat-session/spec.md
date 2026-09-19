# Spec

## 背景

微信 ClawBot（iLink）为被动会话协议：下行消息必须携带用户消息带来的 `context_token`，且用户 24 小时无互动后凭证失效、24 小时内主动推送有额度限制（社区实测约 10 条）。此前桥不缓存凭证，发送为裸发，会话失效后反复重试直至 dead。

## 目标

1. 桥缓存 `context_token`：收到消息时持久化（`{accountId}.context-tokens.json`），发送时透传。
2. `GET /accounts` 暴露 `hasContextToken`；绑定端（`/portal`）在会话未激活时提示用户发消息。
3. 会话失效（`ret=-2`/`prepare failed`）判定为**不可重试**，快速失败并给出可操作提示。

## 非目标

- 不绕过微信的 24 小时/额度限制（协议层限制，无法伪造或续期）。
- 不做自动 keep-alive（需要用户侧动作，属违规风险）。

## 验收标准

- [ ] 发送日志区分「携带/未携带 context_token」
- [ ] 会话失效不消耗重试额度（smoke 覆盖）
- [ ] `/portal` 会话未激活时显示提示
- [ ] 文档说明平台限制与恢复方法
