# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] `deliveryTargets.delete()` 始终物理删除 target 行
- [x] 删除前将 pending / retry_wait / sending 事件标记为 dead
- [x] 已发送投递历史按 `target_key` 保留，可继续查询
- [x] 用户解绑、换绑、管理员删除通道后不再出现 `[deleted]` 残留行
- [x] 返回结构 `{ deleted, deadEventsCount }` 保持兼容
- [x] 移除 `delivery_events.target_key` 的 `ON DELETE RESTRICT` 外键
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S3
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`src/modules/storage/delivery-target-repository.ts`（`deleteMany` 前更新事件为 dead）、`prisma/migrations/20260922091316_drop_delivery_target_fk/migration.sql`
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中相关 3 项：无历史微信号删除、有历史微信号物理删除并终止待发送任务、重新绑定按原 key 新建且不重发旧任务
- 未执行：生产数据库迁移回滚演练。

## Issues

- 迁移会重建 `delivery_events` 表；已在 smoke 临时库验证，但未在生产数据副本上演练。
- 删除后历史事件仍保留 `target_key`，管理台按 key 展示，不再有 target 行可关联。

## Regression Risks

- 外键未移除时删除会失败；必须先应用 migration。
- 删除通道时仍有排队事件，必须先置 dead 再删行，避免 worker 继续发送。
- 换绑依赖相同 target_key，需确认 sync 生成规则不被本次改动影响。

## Required Rework

- 无。
