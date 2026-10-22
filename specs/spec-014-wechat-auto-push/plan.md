# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/wechat/wechat-target-sync.ts` | 为每个已绑定账号创建/维护 `wechat:<accountId>` 投递通道 |
| `src/server/start-server.ts` / 微信状态读取 | 启动与状态查询时触发同步 |
| `src/modules/storage/delivery-target-repository.ts` | 支持按账号查询、按 key 删除、保留 `enabled` |
| `src/modules/api/controllers/admin-controller.ts` + routes | `PATCH /admin/api/wechat/accounts/:id/push`；列表排除微信通道 |
| `web/admin/src/pages/SettingsPage.vue` | 「接收推送」开关；移除手动投递区块 |
| `scripts/smoke-e2e.ts` | 自动建通道、开关不覆盖、删除同步清理用例 |

## 修改顺序

1. 实现账号到投递通道的幂等同步。
2. 启动与状态读取接入同步。
3. 增加账号级推送开关 API 与 UI。
4. 投递通道列表排除微信通道，移除重复入口。
5. smoke 回归。

## 数据流

```text
绑定微信号 → syncWechatDeliveryTargets
  → 创建/更新 wechat:<accountId>（默认 enabled=true）
  → 仅更新展示名/目标，不覆盖 enabled
删除微信号 → 删除对应 target
```

## 接口变化

新增 `PATCH /admin/api/wechat/accounts/:id/push`；通道列表支持 `excludeChannelType`。

## 测试计划

- 前后端 `npm run typecheck`
- `npm run smoke:e2e`：绑定后自动建通道、关闭推送后同步不覆盖、删除账号清理通道且不影响其它账号

## 风险

- 同步逻辑不得覆盖管理员的 `enabled` 选择。
- 旧版手工创建的微信通道需在同步时清理，避免重复推送。
- 微信通道从投递通道列表隐藏，但后端仍按 target 投递。

## 预计涉及文件

- `src/modules/wechat/wechat-target-sync.ts`
- `src/server/start-server.ts`
- `src/modules/storage/delivery-target-repository.ts`
- `src/modules/api/controllers/admin-controller.ts`
- `web/admin/src/pages/SettingsPage.vue`
- `scripts/smoke-e2e.ts`
