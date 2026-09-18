# Acceptance

## Result

PASS

## Spec Coverage

- 账号与会话：`users` / `user_sessions` 迁移；scrypt 密码哈希；HttpOnly Cookie 会话；启动种子管理员（env 优先，缺省随机密码写入日志）。
- 访问控制：`/admin/api/*` 需管理员会话（未登录 401、普通用户 403）；取消本机白名单；`/login`、`/portal` 页面公开、由前端守卫接管。
- 用户管理：设置页「用户」页签支持新增/删除/重置密码；拒绝删除当前账号与最后一个管理员；删除用户即时失效会话并释放微信绑定归属。
- 绑定端：`/portal` 展示本人微信绑定、扫码绑定、取消绑定、解绑；越权解绑返回 404。
- 绑定归属：`delivery_targets.owner_user_id`，扫码发起时记录发起人并在同步时写入/认领。

## Tests

- `npm run typecheck`：通过（后端 + 前端）。
- `npm run build`：通过。
- `npm run smoke:e2e`：通过（新增 9 项鉴权/用户/绑定用例）。
- 实机验证：未登录 `/admin/api/summary` 401；管理员登录 200；错误密码 401；普通用户管理 API 403；`/login`、`/portal` 200；登录跳转携带 `redirect`；扫码二维码正常展示。
- 截图：`.tmp/ui-shots-v3/`（登录页中英、移动端、用户页签、绑定端、二维码）。

## Issues

- 无。

## Regression Risks

- 原「管理页只允许从本机访问」行为被登录鉴权替代（符合 spec-016 决策）；局域网访问需登录。
- 旧会话不存在时，升级后所有浏览器需要重新登录一次。

## Required Rework

- 无。
