# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] 桥端收消息长轮询识别 `errcode === -14`，清空该账号 context token 并停止监听
- [x] 失效时记录明确日志，账号文件保留，便于重新扫码复用
- [x] 发送前检查 context token，缺失时返回 HTTP 503 与明确错误信息
- [x] 主服务将 503 / 会话失效映射为不可重试的 `WECHAT_SESSION_EXPIRED`
- [x] 绑定端 `sessionActive` 随 `hasContextToken` 变为 false，显示未激活/重绑引导
- [x] 正常会话（无 `-14`）行为不变
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S3
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`wechat-bridge/src/session-health.mjs`（仅 `-14` 判定）、`wechat-bridge/src/bridge.mjs`（轮询与发送路径）、`src/modules/delivery/channel/wechat-bridge-sender.ts`（不可重试映射）
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中相关 3 项：会话失效判定不可重试、仅 `-14` 命中、桥 503 映射为 `WECHAT_SESSION_EXPIRED`
- 未执行：真实微信账号在另一环境重新扫码后的设备端联调。

## Issues

- 真实平台失效信号已由实测确认，但本次未重新构造双环境扫码场景。
- 清空 token 后必须由用户重新扫码才能恢复，无法自动修复。

## Regression Risks

- 仅精确匹配 `-14`，其它错误码（限流、网络）仍走原重试逻辑。
- 多账号需独立判定，不能因一个账号失效停止其它账号监听。
- 失效后发送不得重试，避免消耗额度。

## Required Rework

- 无。
