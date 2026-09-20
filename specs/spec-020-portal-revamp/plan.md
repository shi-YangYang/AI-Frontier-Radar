# Plan

- 后端：`GET /user/api/posts`（登录鉴权、分页）；`/user/api/wechat` 增加 `sendCount/sendLimit/sessionActive`。
- 桥：`{accountId}.send-counter.json` 记录窗口内发送数（24h 窗口），收到用户消息时重置；发送时追加 tip；`/accounts` 暴露计数。
- 前端：PortalPage 双页签（消息列表 + 微信配置），额度进度条、会话状态条、绑定引导文案；i18n/样式补齐。
- 测试：smoke 增加用户消息接口（含鉴权）；桥计数与 tip 实机验证。
