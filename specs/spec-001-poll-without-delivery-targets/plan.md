# Plan

## 涉及模块

- `src/modules/polling/services/polling-account-service.ts`（主要修改）
- `scripts/smoke-e2e.ts`（可选：补充无投递目标场景）
- `/posts` 前端不改动，仅验证

## 修改顺序

1. `pollAccount` 移除无投递目标早退。
2. `persistPost`：入库前查询帖子是否已存在，返回 `{ isNewPost, eventsCreated }`。
3. `persistPosts` / 汇总：`newPostsDetected` 按新增帖子计数，`eventsCreated` 不变。
4. 补充冒烟场景：无投递目标时轮询成功且帖子入库（视现有 smoke 结构可行性）。
5. 类型检查、构建、冒烟、实机验证。

## 数据流

fetchPosts → 过滤（回复/转发）→ eligible（基线/增量）→ persist（upsert 帖子；有目标时 createIfAbsent 事件）→ 统计返回 → PollRun 汇总。

## 接口变化

无外部 API 变化；`PollingAccountResult` 字段不变，仅统计值口径修正。

## 测试计划

- `npm run backend:typecheck` / `npm run admin:typecheck`
- `npm run smoke:e2e`（必要时扩展无目标用例）
- 实机：清空投递目标 → 手动轮询 → 确认入库 + 账号成功 + 0 事件；配置目标后新帖投递回归

## 风险

- 统计口径变化会使 `/poll-runs` 的历史对比口径不同（可接受）。
- 每个帖子多一次 `findByXPostId` 查询，量级很小。

## 迁移策略

无。

## 预计涉及文件

- `src/modules/polling/services/polling-account-service.ts`
- `scripts/smoke-e2e.ts`（可选）
