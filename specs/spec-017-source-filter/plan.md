# Plan

## 涉及模块

- `delivery_targets.config_json.sourceIds`（无迁移）：目标级源过滤，空/缺省 = 全部源。
- `src/modules/polling/services/polling-account-service.ts`：轮询创建投递事件前按来源过滤。
- `src/modules/api/controllers/user-controller.ts` + `routes/user-routes.ts`：绑定端查询/保存接口。
- `web/admin/src/pages/PortalPage.vue` + `api/admin-api.ts` + `i18n.ts` + `styles.css`：绑定端编辑器 UI。
- `scripts/smoke-e2e.ts`：接口、越权、投递过滤用例。

## 关键实现

- 赋值时机在轮询 `persistPost`（已知消息来源账号 id），事件一旦创建不受后续修改影响。
- 保存时对源 id 去重并过滤不存在的 id；源被删除后残留 id 自动失效。
- `PUT /user/api/wechat/accounts/:accountId/sources` 仅绑定归属者可操作，越权 404。

## 测试计划

- `npm run smoke:e2e`：新增「绑定端保存接收源并拒绝越权修改」「源过滤生效：未选源不投递、其它绑定不受影响」。
- 实机/截图：绑定端桌面与移动端编辑器（接口拦截伪造绑定）。

## 风险

- 过滤只作用于新事件；已存在的失败事件仍按原目标重试（符合预期）。
