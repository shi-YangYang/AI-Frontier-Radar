# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `wechat-bridge/src/bridge.mjs` | 新增 `POST /login/start`、`GET /login/status`、`GET /targets`；保留 `/health`、`/send` |
| `wechat-bridge/src/login-worker.mjs` | 扫码、数字校验与登录结果状态机 |
| `src/modules/wechat/wechat-bridge-service.ts` | 主服务 `spawn` 桥进程、退出退避重启、关闭时停止 |
| `src/modules/api/controllers/admin-controller.ts` + routes | 微信状态、登录、验证码、测试发送接口 |
| `web/admin/src/pages/SettingsPage.vue` | 「微信」页签：进程状态、二维码、验证码、会话、测试发送 |
| `src/modules/delivery/channel/*` | 渠道更名为 `wechat_clawbot`，无需 URL |
| `scripts/smoke-e2e.ts` | 渠道更名后的回归用例 |

## 修改顺序

1. 桥增加 Web 登录与状态接口。
2. 主服务托管桥进程与生命周期管理。
3. 管理 API 与设置页微信页签。
4. 渠道更名与 URL 校验豁免。
5. 实机扫码与测试发送。

## 数据流

```text
主服务启动 → spawn bridge serve
设置页 → POST /admin/api/wechat/login → 二维码
用户扫码/输入数字 → 桥登录 → 保存账号
测试发送 → 桥 /send → 微信
```

## 接口变化

新增 `/admin/api/wechat/status|login|login/code|test`；通道类型改为 `wechat_clawbot`，省略 URL。

## 测试计划

- 前后端 `npm run typecheck`
- `npm run smoke:e2e`
- 实机：二维码生成、扫码登录、测试发送、进程重启

## 风险

- 桥进程退出/重启需有上限，避免无限拉起。
- 未安装依赖时主服务必须降级，不影响其它功能。
- 数字校验需要写入桥 stdin，注意进程生命周期。

## 预计涉及文件

- `wechat-bridge/src/bridge.mjs`
- `wechat-bridge/src/login-worker.mjs`
- `src/modules/wechat/wechat-bridge-service.ts`
- `src/modules/api/controllers/admin-controller.ts`
- `src/modules/api/routes/admin-routes.ts`
- `web/admin/src/pages/SettingsPage.vue`
- `scripts/smoke-e2e.ts`
