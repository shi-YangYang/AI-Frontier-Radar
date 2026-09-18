# Acceptance

## Result

PASS

## Spec Coverage

- **桥 Web 登录**（`wechat-bridge/`）：`serve` 新增 `POST /login/start`（返回原始链接 + PNG data URL）、`GET /login/status`（idle/pending/scanned/need-code/connected/failed）、`GET /targets`；通过 stdout 信号识别「已扫码/需数字校验」；登录成功自动保存账号。原有 `/health`、`/send` 保留，CLI 命令保留用于调试。
- **主服务内置托管**：`WechatBridgeService` 随主服务启动 `spawn` 桥进程（stdin/stdout 管道、退出按指数退避重启、最多 5 次），主服务关闭时一并停止；依赖未安装时降级为「未安装」状态并提示 `npm run wechat:install`。
- **管理 API**：`GET /admin/api/wechat/status`、`POST /admin/api/wechat/login`、`POST /admin/api/wechat/login/code`（写入桥 stdin）、`POST /admin/api/wechat/test`；错误码区分未安装（400）、未运行（503）、桥失败（502）。
- **设置页「微信」页签**：桥进程状态与端口、登录状态与账号、扫码登录/重新登录、二维码渲染与链接兜底、数字校验输入、已登记会话列表、测试发送；未安装时显示安装提示。
- **投递渠道**：`wechat_bridge` 更名为「微信（ClawBot）」(`wechat_clawbot`)：无需填写 URL（服务端自动指向内置桥，且跳过 URL 重复校验），仅可选目标会话；sender/重试语义不变。

## Tests

- `typecheck`（前后端）通过；`smoke:e2e` 69 项全绿（微信桥用例随渠道更名更新）。
- 实机验证：
  - 主服务启动日志出现 `wechat bridge process started`，`/admin/api/wechat/status` 返回 `installed/running = true`、端口 3991；
  - `POST /admin/api/wechat/login` 实测返回真实二维码（data URL 3774 字节 + `liteapp.weixin.qq.com` 链接）；
  - 创建「微信（ClawBot）」渠道（不填 URL）成功；测试发送返回桥的 503「尚未登录」明确提示（链路打通，登录态缺失为预期）；
  - UI 截图核对「微信」页签（运行中/未登录/扫码登录/会话区）正常；修复了页签首次加载未拉取状态的问题。

## Issues

- 桥未登录时监听会话任务每 10 秒重试，已做日志节流（首次与每 60 秒提示一次），避免刷屏。

## 实测补充（用户操作）

- 用户在设置页完成扫码登录；「测试发送」送达个人微信（用户确认收到）。登录态：accountId `3ddf6a468220@im.bot`、userId `o9cq80yFFJH6v21kTXaVvQQpJEGU@im.wechat`；桥状态接口返回 `installed/running/loggedIn = true`。
- 验收后修复：会话监听曾把"发送者=账号 userId（即用户本人）"的消息过滤掉，导致会话列表为空；已改为记录所有发送者，并把 getUpdates 同步游标持久化到状态目录（避免重启丢消息）。

## Regression Risks

低：桥为独立子进程，异常不影响主服务；渠道仅改类型名与表单，未改动发送/重试逻辑。

## Required Rework

无。
