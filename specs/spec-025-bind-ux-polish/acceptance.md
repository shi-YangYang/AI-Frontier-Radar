# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] `loginStatus === 'scanned'` 时隐藏二维码并显示「已扫码，请在手机上确认」状态卡
- [x] 账号已登记但 `sessionActive === false` 时显示「给 ClawBot 发送第一条消息」引导卡
- [x] `sessionActive === true` 后自动恢复正常已连接态
- [x] 失败、超时与取消路径保持原有处理
- [x] 复用现有 `me.bind.*` 文案，无新增后端接口
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S1
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`web/admin/src/pages/PortalPage.vue` 中 `loginStatus`、`sessionActive`、`boundAccount` 分支及 `me.bind.confirmOnPhone` / `me.bind.waitingMessage` 文案
  - 确认 3 秒轮询与二维码隐藏逻辑沿用现有绑定流程
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22，后端回归）
- 未执行：真实微信扫码、手机确认与首条消息激活的端到端人工验证。

## Issues

- 无自动化 UI 测试；状态卡切换依赖真实微信桥登录流程，本次仅做代码审阅。
- 轮询间隔为 3 秒，扫码确认后的界面更新存在最多约 3 秒延迟（Spec 已接受）。

## Regression Risks

- 状态优先级错误可能在会话失效时误显示“等待首条消息”而非失效提示；需保持 `sessionInvalidated` 分支优先。
- 隐藏二维码期间不得丢失取消/重新绑定入口。

## Required Rework

- 无。
