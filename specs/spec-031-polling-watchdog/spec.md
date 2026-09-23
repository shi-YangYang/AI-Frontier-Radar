# Spec

## 背景

服务器实测：轮询在某个账号的下游环节挂死 6 小时（无任何日志），整条轮询链路停摆（每轮调度全部跳过）。各 provider 内部虽有部分超时（RSS fetch 30s、page.goto 30s），但无法覆盖所有挂起模式（如无超时的下游 await、解析器空转、代理僵死连接）。需要编排层兜底。

## 目标

`PollingOrchestrator.processAccount` 增加单账号硬性截止时间（看门狗）：

1. 单账号处理超过 60 秒 → 强制判定为失败（`WATCH_ACCOUNT_DEADLINE`），记录明确错误，继续下一个账号
2. 看门狗超时不中断仍在跑的底层操作（不 cancel 浏览器实例，避免状态破坏）——仅让本轮跳过该账号的持久化，竞态下若底层操作稍后完成，其结果按现状处理（Promise.race 语义）
3. 轮询整体不再被任何单账号挂死

## 非目标

- 不做底层操作的取消/中止（Promise.race 语义，超时后底层继续，结果不采纳）
- 不改各 provider 内部超时
- 不改调度器/投递侧

## 当前行为

- `runOnce` 顺序 `await processAccount(...)`——任一账号挂起即整轮挂死，后续轮次全部跳过
- 账号处理时长无上限

## 目标行为

- `processAccount`（或其调用处）以 `Promise.race([内部流程, deadline])` 包裹：60 秒未完成 → 返回失败结果 `{ status: 'failed', errorSummary: '<来源> 轮询超时（60s），已跳过' }`
- 截止时间计入 poll_runs 的 accounts_failed（该账号本轮失败）
- 单账号失败不影响其它账号与整轮状态判定（与现有失败聚合逻辑一致）

## 边界条件

- 恰好 60 秒边界：deadline 先到 → 记失败；底层随后完成 → 结果丢弃（不再写库；由实现保证 race 后不再采纳内部结果——现有 processAccount 正常路径在 race 之外继续执行，其持久化副作用需评估：若底层挂起 6h 后苏醒并写库，属可接受的极小概率行为，超时即已放弃本轮该账号）
- deadline 可配置（默认 60s，环境变量/常量，本期用常量）
- 上限不阻断正常慢账号：50 账号 × 60s ≈ 50 分钟最坏总时长（轮询间隔 20 分钟时会重叠下一轮——下一轮会被跳过一次，可接受；真实账号均在 30s 内完成）

## 技术约束

- 仅改 `src/modules/polling/orchestrator/polling-orchestrator.ts`（processAccount 包裹 + 常量）；不改 provider/存储
- 错误聚合沿用 `summarizeErrors` / `resolvePollRunStatus`

## 兼容性要求

- 正常账号（≤30s）行为不变；smoke 既有用例全绿
- 轮询挂起场景被兜底：任何账号最多占用 60s

## 验收标准

- [ ] 单账号超过 60s 未完成 → 本轮记失败 + 继续后续账号（代码推演 + smoke 用例：注入挂死的 fetchImplementation，断言轮询在 60s 内完成且该账号记失败）
- [ ] 正常账号不受影响
- [ ] `npm run typecheck` + `npm run smoke:e2e`（全绿）+ `npm run build`

## 待确认问题

- [x] 看门狗时长 60s（常量，覆盖 30s fetch 超时 + 浏览器 30s goto 的正常上限）
