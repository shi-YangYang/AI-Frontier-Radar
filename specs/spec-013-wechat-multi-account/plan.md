# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `wechat-bridge/src/bridge.mjs` | `GET /accounts`、`DELETE /accounts/:accountId`；`/send` 支持 `accountId`；每账号独立轮询与游标 |
| `wechat-bridge/src/account-bindings.mjs` | 多账号状态读写 |
| `src/modules/wechat/wechat-bridge-service.ts` | 账号列表/删除透传 |
| `src/modules/api/controllers/admin-controller.ts` | 已绑定账号列表、删除、渠道账号选择 |
| `web/admin/src/pages/SettingsPage.vue` | 账号列表、「添加微信（扫码）」、渠道发送账号下拉 |
| `scripts/smoke-e2e.ts` | 渠道 `accountId` 断言 |

## 修改顺序

1. 桥增加账号列表/删除接口与多账号状态。
2. 会话监听改为每账号一个轮询循环。
3. 管理端账号列表与扫码入口。
4. 渠道配置增加 `accountId` 与发送账号选择。
5. 回归与第二账号人工验证。

## 数据流

```text
GET /accounts → 管理端账号列表
POST /admin/api/wechat/login → 新增账号
DELETE /accounts/:accountId → 停止该账号轮询
渠道 config.accountId → /send { accountId } → 指定账号
```

## 接口变化

桥新增账号列表/删除；`/send` 与渠道配置新增可选 `accountId`；旧调用不传时保持最近账号语义。

## 测试计划

- 前后端 `npm run typecheck`
- `npm run smoke:e2e`：渠道 `accountId` 断言
- 实机：两个微信号分别扫码与按账号投递（第二个账号需用户操作）

## 风险

- 单账号旧路径必须兼容（无 `accountId` 时使用最近账号）。
- 旧 targets 数据无账号归属，读取需兼容。
- 账号删除必须停止对应轮询，避免幽灵会话。

## 预计涉及文件

- `wechat-bridge/src/bridge.mjs`
- `wechat-bridge/src/account-bindings.mjs`
- `src/modules/wechat/wechat-bridge-service.ts`
- `src/modules/api/controllers/admin-controller.ts`
- `web/admin/src/pages/SettingsPage.vue`
- `scripts/smoke-e2e.ts`
