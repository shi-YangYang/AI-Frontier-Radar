# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] 管理端可配置 AppKey / AppSecret / 启用开关，AppSecret 脱敏回显
- [x] 可选 CorpId，配置后授权 URL 携带 `exclusiveLogin` / `exclusiveCorpId`
- [x] 启用后登录页显示分割线与钉钉蓝色按钮，停用后隐藏
- [x] OAuth 回调校验 state，按 unionId 查找/创建用户；首次登录自动创建普通用户
- [x] 管理员角色登录后进入 `/`，普通用户进入 `/portal`
- [x] 未启用或 state 校验失败时拒绝并回到登录页提示
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过
- [x] README 记录钉钉应用创建与回调地址登记
- [ ] 真实钉钉扫码未在本地复测（需外部应用与凭据）

## Validation

- Risk Level: S3
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`src/modules/auth/dingtalk.ts`、`src/modules/api/routes/auth-routes.ts`、`src/modules/api/controllers/admin-controller.ts`、`web/admin/src/pages/LoginPage.vue`
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中钉钉相关 5 项：providers 默认关闭、未启用拒绝、配置保存与脱敏、CorpId 授权参数、管理员读取配置
- 未执行：真实钉钉 OAuth 扫码及 `/contact/users/me` 联调。

## Issues

- 真实扫码链路依赖钉钉应用、回调地址与网络，本地无凭据，未复测。
- “管理员提升角色后进入管理端”由现有 `role === 'admin'` 跳转逻辑覆盖，未做真实账号端到端验证。

## Regression Risks

- state cookie 必须与回调校验一致；错误路径不得建立会话。
- AppSecret 只存 SQLite、仅回显末 4 位，不写日志。
- 回调多个 Set-Cookie 必须以独立响应头发送，避免登录静默失败。

## Required Rework

- 无。真实扫码若失败，按新缺陷流程处理。
