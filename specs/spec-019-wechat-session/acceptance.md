# Acceptance

## Result

PASS

## Spec Coverage

- 凭证缓存与透传：桥在收到消息时写入 `{accountId}.context-tokens.json` 并在发送时读取；日志可区分两种状态（实测：无 token 提示、有 token 携带）。
- 会话失效快速失败：`WECHAT_SESSION_EXPIRED` 且 `retryable: false`（smoke 覆盖）。
- 绑定端提示：`/portal` 在 `sessionActive === false` 时显示「请给 ClawBot 发消息激活」。
- 文档：README 说明被动会话、24 小时与额度限制、恢复方法。

## Tests

- `npm run typecheck` / `npm run build` / `npm run smoke:e2e`：通过（新增 1 项会话失效用例、1 项 sessionActive 断言）。
- 实机：桥重启后 `GET /accounts` 返回 `hasContextToken: false`；注入/移除测试凭证验证日志与状态切换。

## Issues

- 真实推送验证依赖用户给 ClawBot 发消息（平台限制），未在本轮完成。

## Regression Risks

- 无凭证时行为与之前一致（裸发）。

## Required Rework

- 无。
