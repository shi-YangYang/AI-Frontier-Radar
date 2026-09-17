# Acceptance

## Result

PASS

## Spec Coverage

1. 无投递目标时轮询成功、账号 `lastPollStatus=success`、帖子按基线规则入库 — 通过。代码：早退抛错已移除（`polling-account-service.ts`）；冒烟：禁用目标后轮询成功且新帖入库；实机：openai 在 0 目标下 `success`、`newPostsDetected=1`、`eventsCreated=0`。
2. 无目标时不产生 `delivery_events` — 通过。冒烟断言 `eventsCreated===0` 且无该帖事件记录；实机投递事件总数为 0。
3. 有目标场景回归 — 通过。冒烟恢复目标后：新帖入库、事件 `pending`、worker 发送 `sent`（mock webhook 收到请求）。
4. 统计口径 `newPostsDetected` 按新增帖子计数、重复轮询不重复计数 — 通过。`persistPost` 先查后 upsert，`isNewPost` 累加；cursor 推进保证已入库帖不重复 eligible。
5. `/posts` 展示原文、时间、原文链接 — 通过。接口返回 `textContent`/`postedAt`/`permalinkUrl`，页面渲染未改动且正常。
6. `typecheck` / `build` / `smoke:e2e` 通过 — 通过（14 项含新增无目标场景）。

## Tests

- `npm run backend:typecheck`、`npm run typecheck`、`npm run build`：PASS
- `npm run smoke:e2e`：PASS（14 项）
- 只读实机抽查：`/admin/api/watch-accounts`、`/admin/api/posts`、`/admin/api/delivery-events`、`/admin/api/poll-runs`
- 未运行：无独立单元测试框架；跨进程并发轮询未实测（仅代码论证）

## Issues

- Low（已修复）：`.ai/decisions/x-browser-source-constraints.md` 中“无投递目标会被标记失败”的描述失效，已更新。
- Info（理论并发）：`findByXPostId` + upsert 非原子，跨进程并发理论上可多计 1；进程内调度器已有防重叠，不影响本 Spec。

## Regression Risks

- `/poll-runs` 历史对比口径变化（新帖数按入库计），plan 已声明可接受。
- 每帖多一次查询，量级可忽略。
- 无 schema/依赖/外部 API 变更；投递与重试链路未触碰。

## Required Rework

无。
