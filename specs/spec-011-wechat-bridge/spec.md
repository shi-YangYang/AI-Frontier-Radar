# Spec

## 背景

用户需要「微信」投递通道。个人微信没有开放协议；微信官方为 OpenClaw 提供了 ClawBot 插件（腾讯官方，npm `@tencent-weixin/openclaw-weixin`，MIT），但其运行需要完整 OpenClaw Gateway。经拆解确认：该插件的微信协议客户端（二维码登录 `ilinkai.weixin.qq.com`、token 存储、`sendMessage`、getUpdates 长轮询）**完全自包含**，对 OpenClaw SDK 的依赖仅 2 个工具模块（`account-id`、`infra-runtime`）。因此可以自建轻量桥，不安装 OpenClaw、不逆向任何私有协议。

## 目标

### A. `wechat-bridge/`（仓库内独立模块）

- 依赖：`@tencent-weixin/openclaw-weixin`（锁定 2.4.9，MIT，保留版权声明）、本地垫片包 `openclaw`（`shims/openclaw`，仅实现 `plugin-sdk/account-id` 与 `plugin-sdk/infra-runtime`）、`qrcode-terminal`。
- 不修改插件源码，仅动态 import 其模块。
- 命令：
  - `login`：二维码登录（终端打印二维码与链接），成功后保存账号 token 到状态目录（文件权限 0600）
  - `status`：显示已登录账号（脱敏 token、baseUrl、userId）
  - `targets`：显示已登记的微信会话目标（由长轮询记录）
  - `send --text "..." [--to <id>]`：发送文本
  - `serve [--port 3991] [--secret <token>]`：HTTP 服务（`POST /send`、`GET /health`），并后台长轮询记录会话目标
- 状态目录：默认 `wechat-bridge/.state`（`OPENCLAW_STATE_DIR` 可覆盖）。
- 目标发现：给 ClawBot 发任意消息即可登记会话；`send` 未指定 `--to` 时使用最近登记的会话。

### B. 雷达「微信桥」投递通道（`wechat_bridge`）

- 配置：桥地址（默认 `http://127.0.0.1:3991/send`）、可选密钥（`Authorization: Bearer`）、可选目标会话 `to`。
- 发送：`POST` JSON `{title, text, url, author, postedAt, to?}`；2xx 且响应体 `ok !== false` 视为成功；网络错误/5xx 可重试，4xx 与业务失败不重试。
- 管理台渠道类型新增「微信桥（ClawBot）」，含桥地址/密钥/目标三个字段与测试发送。

## 非目标

- 不接收或自动回复微信消息（仅记录会话目标用于发送）。
- 不支持图片/文件/语音（仅文本）。
- 不内置、不依赖 OpenClaw；不逆向微信私有协议、不使用第三方 hook。
- 不做公众号 / 企业微信（各自独立通道，另行评估）。

## 边界条件

- 未登录时桥的 `/send` 返回 503 与明确提示；token 失效时报错并提示重新 `login`。
- 桥不可达 → 雷达侧记录可重试错误。
- 无登记目标且未配置 `to` → 桥返回 400 与提示（先给 ClawBot 发一条消息）。
- 插件升级导致垫片不兼容 → 桥明确报错，锁版本可回退。

## 技术约束

- 不改动雷达主依赖树：bridge 独立 `node_modules`，根脚本 `npm run wechat:install` 安装。
- 垫片包版本号满足插件 peerDependency 范围；MIT 合规（仓库保留插件 LICENSE 引用与说明）。

## 验收标准

- [ ] 桥可加载（垫片生效），`login` 能获取并展示二维码（实测到微信接口返回）
- [ ] `status/targets/send/serve` 行为符合上述规则（未登录场景报错清晰）
- [ ] 雷达「微信桥」通道可创建/测试/投递（mock 桥断言 payload）
- [ ] smoke 全绿；README 说明登录使用步骤
- [ ] 用户扫码后实测发送成功（需要用户配合，作为最终验证项）

## 待确认问题

无。
