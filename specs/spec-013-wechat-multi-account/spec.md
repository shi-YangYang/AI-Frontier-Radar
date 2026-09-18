# Spec

## 背景

企业微信群之外，个人微信的群聊不可用；可行的替代是"多微信号各自绑定 ClawBot"：每个需要收消息的微信扫码绑定到本桥，雷达按账号+目标投递。官方插件原生支持多账号（账号索引、独立凭据与轮询、出站可指定 accountId），桥的存储层已按此设计，但当前只管理/使用最近一个账号。

## 目标

### A. 桥（wechat-bridge）多账号

- `GET /accounts`：列出全部已绑定账号（accountId、userId、baseUrl、脱敏 token）。
- `DELETE /accounts/:accountId`：注销账号（`unregisterWeixinAccountId` + `clearWeixinAccount`）。
- `POST /send`：支持 body 传 `accountId`（缺省 = 最近登录账号）。
- `GET /targets`：会话目标带 `accountId`（保留旧数据兼容）。
- 会话监听：**每个账号一个轮询循环**（各自同步游标），自动发现新增账号；账号删除后停止其循环。

### B. 管理台（设置 → 微信）

- 账号列表：账号 ID、userId、添加（扫码）与删除；登录成功后自动出现在列表。
- 会话目标列表：按账号分列（账号、目标 ID、最近活跃）。
- 测试发送：对最近账号发送。

### C. 投递渠道（微信（ClawBot））

- 渠道配置新增可选「账号」`accountId`；发送 payload 带 `accountId`（空 = 最近账号，桥端自动选择）。
- 表单：账号下拉（默认"最近登录账号"）+ 目标会话输入；编辑弹窗同样支持。

## 非目标

- 不做跨账号广播（一次投递只发一个账号+目标；多账号场景可建多个渠道或用多条规则）。
- 不改变官方限制：每微信号需各自扫码、同一微信同时只绑一个 bot 后端。

## 边界条件

- 未登录任何账号时 `/accounts` 返回空数组；`/send` 返回 503。
- 删除当前唯一账号后，状态回到未登录；残留 targets 保留但标记账号缺失。
- 旧版 targets 文件（无 accountId 字段）读取时按"无账号"兼容处理，不报错。

## 技术约束

- 复用官方插件导出（`unregisterWeixinAccountId`/`clearWeixinAccount`），不修改插件源码。
- 渠道配置仍存 `config_json`，不新增迁移。

## 验收标准

- [ ] 连续扫码两个微信号 → `/accounts` 列出两个；设置页可见并可删除其一
- [ ] 两个账号各自轮询，`/targets` 记录带账号归属
- [ ] 渠道指定账号 A 与目标，mock 断言 payload 含 accountId
- [ ] smoke 全绿；README/roadmap 更新

## 待确认问题

无。
