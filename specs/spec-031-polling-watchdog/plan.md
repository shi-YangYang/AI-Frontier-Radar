# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/polling/orchestrator/polling-orchestrator.ts` | 增加 `ACCOUNT_DEADLINE_MS`（60s）与 `processAccountWithDeadline`，用 `Promise.race` 包裹单账号处理 |
| `scripts/smoke-e2e.ts` | 注入短截止时间与挂死 provider，断言超时记失败且继续后续账号 |

## 修改顺序

1. 提取单账号截止时间常量，构造可注入的 deadline。
2. `runOnce` 改为调用 `processAccountWithDeadline`，超时返回失败结果并计入 `accountsFailed`。
3. 保留 `summarizeErrors` / `resolvePollRunStatus` 现有聚合逻辑。
4. 补 smoke 用例并回归。

## 数据流

```text
runOnce
  → for each watchAccount
    → Promise.race([processAccount(), deadline(60s)])
      → 正常完成：采用真实结果
      → 超时：返回 failed（来源 + 轮询超时），继续下一个账号
  → 聚合 accountsFailed / errorSummary / status
```

## 接口变化

`PollingOrchestratorOptions` 新增可选 `accountDeadlineMs`，默认 60_000；生产调用方不传即使用默认值。

## 测试计划

- `npm run typecheck`
- `npm run build`
- `npm run smoke:e2e`：1 秒截止时间 + 挂死账号，断言轮询快速结束、该账号失败、其它账号不受影响

## 风险

- 超时后底层操作仍可能继续并在稍后写库（Spec 已接受该极小概率竞态）。
- 截止时间过短可能误伤正常慢账号；默认 60s 覆盖 30s 网络/浏览器超时上限。
- 不取消底层浏览器实例，避免破坏后续抓取状态。

## 预计涉及文件

- `src/modules/polling/orchestrator/polling-orchestrator.ts`
- `scripts/smoke-e2e.ts`
