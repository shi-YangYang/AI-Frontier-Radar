# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/delivery/channel/` | 新增企业微信、钉钉、Bark、通用 Webhook sender，并注册到通道注册表 |
| `src/modules/storage/delivery-target-repository.ts` | `delivery_targets.config_json` 读写 |
| `prisma/migrations/20260917010000_add_delivery_target_config/` | 新增配置列 |
| `src/modules/storage/subscription-rule-service.ts` | 规则新增 `targetKeys`，空数组表示全部通道 |
| `src/modules/api/controllers/admin-controller.ts` + routes/schemas | 通道 CRUD、测试发送、规则校验 |
| `web/admin/src/pages/SettingsPage.vue` + `admin-api.ts` + `i18n.ts` | 渠道类型、配置字段、生效通道选择 |
| `scripts/smoke-e2e.ts` | 4 渠道 payload、加签、分渠道规则用例 |

## 修改顺序

1. 实现 4 个 sender 并接入注册表。
2. 新增 `config_json` 迁移与目标仓储读写。
3. 订阅规则增加 `targetKeys` 并接入投递事件创建。
4. 管理端通道表单、测试发送与规则 UI。
5. smoke 覆盖并回归。

## 数据流

```text
delivery_event → target.channelType → 对应 sender
post → 订阅规则匹配 → 命中规则的 targetKeys 并集 → 创建投递事件
```

## 接口变化

通道创建/更新/测试支持 `channelType` 与 `config`；订阅规则新增 `targetKeys`（空=全部）。

## 测试计划

- `npm run typecheck`
- `npm run smoke:e2e`：4 渠道创建与校验、payload/钉钉加签、分渠道规则命中与未命中

## 风险

- 飞书 sender 必须保持兼容。
- `targetKeys` 为空时不能误判为“不投递”，应表示全部通道。
- 未知渠道类型与缺失 Bark Key 需明确拒绝。

## 预计涉及文件

- `src/modules/delivery/channel/*`
- `src/modules/storage/delivery-target-repository.ts`
- `prisma/migrations/20260917010000_add_delivery_target_config/`
- `src/modules/storage/subscription-rule-service.ts`
- `src/modules/api/controllers/admin-controller.ts`
- `web/admin/src/pages/SettingsPage.vue`
- `scripts/smoke-e2e.ts`
