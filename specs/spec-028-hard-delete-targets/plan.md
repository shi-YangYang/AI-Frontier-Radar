# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/storage/delivery-target-repository.ts` | `delete()` 去除软删除分支：进行中事件置 dead 后物理删除 target |
| `prisma/migrations/20260922091316_drop_delivery_target_fk/` | 移除 `delivery_events.target_key` 外键（原 `ON DELETE RESTRICT` 阻止删行） |
| `scripts/smoke-e2e.ts` | 有历史/无历史删除、重新绑定、历史保留断言 |

## 修改顺序

1. 新增 migration 重建 `delivery_events`，去掉 target 外键并保留数据。
2. 改写 `delete()`：标记进行中事件 → `deleteMany` target → 返回计数。
3. 清理不可达的软删除复用分支（或保留防御，但不再产生 `[deleted]` 行）。
4. 更新 smoke 断言并回归。

## 数据流

```text
delete(target)
  → updateMany(pending/retry_wait/sending → dead)
  → deleteMany(delivery_targets where id)
  → 返回 { deleted, deadEventsCount }
  → delivery_events 按 target_key 保留，可继续查询
```

## 接口变化

`DeleteDeliveryTargetResult` 保持不变；调用方无需修改。

## 测试计划

- `npm run typecheck`
- `npm run build`
- `npm run smoke:e2e`：有发送历史的微信号删除、无历史删除、重新绑定复用原 key、历史事件保留

## 风险

- 外键未先移除会导致删行失败 → migration 顺序优先。
- 仍有排队事件时直接删 target 会造成悬挂 → 先置 dead。
- 重新绑定依赖相同 `target_key`，需确认 sync 生成规则不变。

## 预计涉及文件

- `src/modules/storage/delivery-target-repository.ts`
- `prisma/migrations/20260922091316_drop_delivery_target_fk/migration.sql`
- `scripts/smoke-e2e.ts`
