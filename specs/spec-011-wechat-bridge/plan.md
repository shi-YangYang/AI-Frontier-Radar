# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `wechat-bridge/` | 独立轻量桥：CLI `login/status/targets/send/serve`、状态目录、token 文件权限 0600 |
| `wechat-bridge/shims/openclaw/` | 仅实现腾讯官方插件实际使用的两个 SDK 模块 |
| `src/modules/delivery/channel/wechat-bridge-sender.ts` | 新增「微信桥」通道 sender 并注册 |
| `src/modules/api/controllers/admin-controller.ts` | 通道配置（桥地址、可选密钥、目标） |
| `web/admin/src/pages/SettingsPage.vue` | 渠道类型与字段 |
| `README.md` | 安装、登录、发送说明 |

## 修改顺序

1. 搭建桥模块与官方插件协议适配。
2. 实现雷达侧 sender 与错误/重试语义。
3. 管理端渠道配置与测试发送。
4. README、smoke 与真实扫码验证。

## 数据流

```text
radar delivery event
  → POST <bridge>/send { title, text, url, author, postedAt, to? }
  → 腾讯 ClawBot 插件协议
  → 个人微信
```

## 接口变化

新增通道类型 `wechat_bridge`（后续 spec-012 更名为 `wechat_clawbot`）；配置桥地址、可选 Bearer 密钥与目标会话。

## 测试计划

- `npm run typecheck`
- `npm run smoke:e2e`：微信桥 payload 与 Bearer 鉴权
- 实机：扫码登录、发送测试消息、`status/targets` 未登录提示

## 风险

- 依赖官方插件协议，升级可能改变内部接口。
- token 与登录态不得提交 Git，状态目录需忽略。
- 仅发送文本，不接收/回复消息。

## 预计涉及文件

- `wechat-bridge/*`
- `src/modules/delivery/channel/wechat-bridge-sender.ts`
- `src/modules/delivery/channel/create-delivery-channel-registry.ts`
- `src/modules/api/controllers/admin-controller.ts`
- `web/admin/src/pages/SettingsPage.vue`
- `README.md`
