# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] `PollingOrchestrator` 对单账号处理增加 60 秒硬截止时间
- [x] 超时返回失败结果（来源 + 轮询超时），计入 `accountsFailed`
- [x] 超时后继续处理后续账号，不阻塞整轮
- [x] 不取消底层操作（`Promise.race` 语义），避免破坏浏览器实例
- [x] 截止时间可注入，便于 smoke 用短时限验证
- [x] 正常账号行为不变
- [x] `npm run typecheck` + `npm run build` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S2
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`src/modules/polling/orchestrator/polling-orchestrator.ts`（`ACCOUNT_DEADLINE_MS = 60_000`、`processAccountWithDeadline`、`Promise.race`）
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中“单账号挂死触发看门狗”用例断言短截止时间内记失败且不影响其它账号
- 未执行：真实服务器上单账号挂死 6 小时场景的复现（成本过高）。

## Issues

- 超时后底层操作仍可能在稍后完成并写库，Spec 已接受该极小概率竞态。
- 默认 60 秒为常量；若后续需要按来源调整，需另行扩展配置。

## Regression Risks

- 正常慢账号接近 60 秒时可能被误判；当前真实账号均在 30 秒内完成。
- 看门狗只包裹单账号，不改变整轮调度与投递逻辑。
- 超时失败必须进入现有错误聚合，不能中断 `runOnce`。

## Required Rework

- 无。
