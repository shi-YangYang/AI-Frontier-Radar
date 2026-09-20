# Plan

- `wechat-bridge/src/bridge.mjs`：`readContextTokens/saveContextToken/resolveContextToken`；`watchAccount` 收消息时保存；`sendText` 透传；发送日志与 `/accounts` 状态。
- `src/modules/delivery/channel/wechat-bridge-sender.ts`：`WECHAT_SESSION_EXPIRED` 分类（`ret=-2|prepare failed|尚未登录|context_token`），`retryable: false`。
- `user-controller` / `PortalPage` / i18n：`sessionActive` 透出与提示。
- smoke：sender 分类用例、绑定接口 `sessionActive` 断言。
