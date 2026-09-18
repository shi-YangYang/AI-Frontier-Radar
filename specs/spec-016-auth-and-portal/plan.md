# Plan

## 涉及模块

- `prisma/schema.prisma` + `prisma/migrations/20260918020000_add_auth/`：`users`、`user_sessions` 表，`delivery_targets.owner_user_id`。
- `src/modules/auth/`：scrypt 密码哈希、Cookie 解析/序列化、`AuthService`（种子管理员、登录/会话、用户 CRUD）。
- `src/modules/storage/`：`UserRepository`、`UserSessionRepository`、投递目标归属字段与 `clearOwner`。
- `src/modules/wechat/`：`WechatBindCoordinator`（扫码绑定归属）、同步时认领无主通道。
- `src/modules/api/routes/`：`auth-routes`、`user-routes`，`admin-routes` 改为会话鉴权 + 用户管理 API。
- `src/modules/api/controllers/user-controller.ts`：用户管理 + 绑定端逻辑。
- `web/admin/src/`：`auth.ts`、`pages/LoginPage.vue`、`pages/PortalPage.vue`、路由守卫、侧栏用户区、设置页「用户」页签、i18n。
- `scripts/smoke-e2e.ts`：登录包装 + 鉴权/越权/用户管理/绑定归属用例。

## 关键实现

- 密码：`scrypt` + 随机盐；会话 token 随机 32 字节，库中只存 sha256。
- Cookie：`afr_session`，HttpOnly + SameSite=Lax，30 天。
- 启动：用户表为空时按 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 种子，缺省随机密码打日志。
- 管理端：`/admin/api/*` 需管理员会话（401/403）；页面与静态资源公开，由 SPA 守卫跳转 `/login`。
- 绑定归属：扫码发起时记录发起人，桥账号同步创建/认领无主通道时写入 `owner_user_id`；删除用户释放归属。
- 登录限速：每 IP 每分钟 10 次。

## 测试计划

- `npm run typecheck`、`npm run build`。
- `npm run smoke:e2e`：新增 401/403、登录、用户 CRUD、绑定归属、越权解绑、删除用户会话失效等用例。
- 实机：curl 验证未登录 401、登录 200、普通用户管理 API 403；Playwright 截图核对登录页/绑定端/用户页签。
