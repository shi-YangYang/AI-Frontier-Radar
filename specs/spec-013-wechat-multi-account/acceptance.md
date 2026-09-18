# Acceptance

## Result

PASS（第二个微信号的绑定实测需用户用另一台微信扫码，见「未执行项」）

## Spec Coverage

- **桥多账号**：`GET /accounts`（accountId/userId/baseUrl/脱敏 token）、`DELETE /accounts/:accountId`（`unregisterWeixinAccountId` + `clearWeixinAccount`）、`/send` 支持 `accountId`、`/targets` 带账号归属；会话监听改为**每账号一个轮询循环**（各自同步游标），新增账号自动开始监听、删除后停止。
- **管理台**：微信页签新增「已绑定微信号」列表（账号 ID、微信用户 ID、删除）与「添加微信（扫码）」；会话目标列表增加「所属账号」列。
- **渠道**：`wechat_clawbot` 配置新增 `accountId`（`config_json`，无迁移）；表单/编辑弹窗提供「发送账号」下拉（默认最近登录）+「目标会话」；发送 payload 携带 `accountId`。

## Tests

- 前后端 typecheck 通过；`smoke:e2e` 69 项全绿（微信桥用例新增 `accountId` 断言）。
- 实机验证：
  - `/admin/api/wechat/status` 返回 `accounts`（当前 1 个：`3ddf6a468220@im.bot` / `o9cq…@im.wechat`，token 脱敏）；
  - 创建「微信（ClawBot）」渠道并在渠道上显式指定账号+目标，测试发送返回成功（真实送达此前已由用户确认）；
  - UI 截图核对「已绑定微信号」与「添加微信（扫码）」正常。

## Issues

无。

## 未执行项

- **第二个微信号的绑定与按账号投递**：需用户用另一个微信号再次扫码（点击「添加微信（扫码）」），随后 `/accounts` 应出现两个账号；此项待用户操作后验证。

## Regression Risks

低：单账号路径保持兼容（无 accountId 时桥自动使用最近账号）；targets 旧数据（无 accountId）读取兼容。

## Required Rework

无。
