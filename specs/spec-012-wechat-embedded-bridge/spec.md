# Spec

## 背景

spec-011 交付的微信桥需要单独执行 `npm run wechat:serve`，使用门槛高。用户要求改为**内置**：主服务启动时自动托管微信桥，在 `/settings -> 微信` 中完成扫码登录、查看状态与目标会话、测试发送。

## 目标

### A. 微信桥（`wechat-bridge/`）新增 Web 登录能力

- `serve` 模式新增接口（原有 `/health`、`/send` 保留）：
  - `POST /login/start`：生成二维码（返回原始链接 + PNG data URL）并开始后台等待
  - `GET /login/status`：`{ status: idle|pending|scanned|need-code|connected|failed, accountId?, userId?, message? }`
  - 扫码后如需数字校验：桥通过 stdout 拦截识别提示并置为 `need-code`（校验码由父进程写入其 stdin，复用插件既有交互）
- 登录成功自动保存账号（与 CLI 登录一致）。

### B. 主服务内置托管（不再单独起服务）

- 新增 `WechatBridgeService`：随主服务启动/停止，`spawn` 桥进程（`node wechat-bridge/src/bridge.mjs serve`），管道 stdin/stdout；桥异常退出按退避自动重启（有限次）；依赖未安装（`wechat-bridge/node_modules` 缺失）时进入「未安装」状态并在日志与设置页提示 `npm run wechat:install`。
- 管理 API：
  - `GET /admin/api/wechat/status`（installed/running/login 状态/账号/目标数）
  - `POST /admin/api/wechat/login`（开始登录，返回二维码）
  - `GET /admin/api/wechat/login/status`（轮询）
  - `POST /admin/api/wechat/login/code`（提交数字校验码）
  - `POST /admin/api/wechat/test`（测试发送）
  - `GET /admin/api/wechat/targets`（会话目标列表）

### C. 设置页「微信」页签 + 投递渠道

- `/settings -> 微信`：安装状态、登录二维码（页面内渲染 + 链接兜底）、登录状态轮询、验证码输入、目标会话列表、测试发送按钮。
- 投递渠道：现有 `wechat_bridge` 类型改名为「微信（ClawBot）」(`wechat_clawbot`)：无需填写 URL（自动指向内置桥），仅可选「目标会话」；sender 逻辑复用（HTTP POST 内置桥）。

## 非目标

- 不保留独立 `npm run wechat:serve` 的强制要求（命令仍可用于调试）。
- 不接收/回复微信消息；不做媒体消息。

## 边界条件

- 桥未安装/登录 → 渠道发送返回明确错误（可重试性区分：未登录 503 不重试，桥不可达可重试）。
- 同一时间只支持一个登录会话，重复点击登录则重置。
- 主服务停止时桥进程一并退出。

## 技术约束

- 桥依赖保持在 `wechat-bridge/node_modules`（主依赖树不变）；子进程方式保证 ESM/插件隔离。
- 不修改腾讯插件源码。

## 验收标准

- [ ] 主服务启动后桥自动运行，`/settings -> 微信` 可看到状态与登录二维码
- [ ] 扫码 +（如需）验证码 + 给 ClawBot 发消息登记会话后，测试发送真实到达微信
- [ ] 「微信（ClawBot）」渠道可创建/测试/投递（smoke 用 mock 断言）
- [ ] smoke 全绿；README/roadmap 更新

## 待确认问题

无。
