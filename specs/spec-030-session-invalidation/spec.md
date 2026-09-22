# Spec

## 背景

实测确认：同一微信号在另一环境（如服务器）重新扫码后，微信平台会作废本地桥的 bot 会话，但信号只存在于**响应体内**——收消息长轮询与发送接口的 HTTP 均返回 200，响应体带 `errcode:-14（"session timeout"）`。桥现有代码只读 `msgs`/`messageId`，从不检查 `errcode`，导致：

- 本地 UI 一直显示「会话已连接」（`sessionActive` 依据的 context token 是历史残留）
- 发送静默失败（API 返回 ok，消息实际被平台丢弃，用户收不到）
- 用户无感知，直到发现收不到推送

（已用本地失效账号实测：`getUpdates` 与 `getConfig` 的响应体均返回 `errcode:-14`。）

## 目标

1. **桥端感知**：收消息长轮询识别 `errcode=-14`，自动清除该账号的会话凭证并停止监听，日志说明原因
2. **发送快速失败**：会话已失效的账号拒绝发送（HTTP 503 + 明确错误信息），主服务据此把投递事件标记为不可重试失败（错误信息引导重新扫码）
3. **UI 正确反映**：`sessionActive`（依据 hasContextToken）自动变 false → 绑定端显示「会话未激活」状态与重绑引导（沿用 spec-025 引导卡），不再显示虚假的「会话已连接」

## 非目标

- 不做多环境绑定的集中注册/互斥（两套部署各自独立 SQLite，超出单实例能力）
- 不做自动重扫（重绑必须用户扫码）
- 不改主服务的投递重试策略

## 当前行为

- 桥 `watchAccount` 长轮询：只读 `response.msgs` / `get_updates_buf`，忽略 `response.errcode`
- 发送：`sendText` 在 context token 缺失时仍照常发送（上游静默丢弃）
- 主服务：`sessionActive = hasContextToken === true`（user-controller:165-166）——基于历史凭证，不反映真实健康度

## 目标行为

### 桥端（bridge.mjs）

1. `watchAccount` 循环：getUpdates 响应后检查 `response.errcode`
   - `errcode === -14`（session timeout）→ 清空该账号 context tokens 文件 + 记日志「会话已在其它环境重新绑定，本地会话已失效」+ 结束该账号的监听循环
   - 其它 errcode：仅记日志，按现有逻辑重试
2. `sendText`：发送前检查账号的 context token——缺失时直接 `fail`（HTTP 503）：`微信会话已失效，请重新扫码绑定`（错误信息需命中主服务 `WECHAT_SESSION_EXPIRED` 识别模式 `尚未登录|context_token` 等关键词）
3. 会话失效恢复路径：用户在本环境重新扫码 → 正常登录流程重建账号与会话 → 桥重新监听（既有逻辑）

### 主服务

- `sessionActive` 计算不变（hasContextToken 清空后自动为 false）
- 投递侧：桥拒绝发送 → `wechat-bridge-sender` 识别为 `WECHAT_SESSION_EXPIRED` → 事件标记不可重试失败（错误信息「微信会话已失效，请重新扫码绑定」——此记录有解释价值，保留）

### 前端（PortalPage）

- 无需改：`sessionActive=false` 后现有 spec-025 引导卡自动出现（等待重新扫码）

## 边界条件

- 仅精确匹配 `errcode:-14` 视为会话作废；其它错误码（限流、网络）按现有重试处理，避免误清活跃会话
- 桥里账号保留（不删账号文件），仅清 context tokens——同账号重新扫码后 `saveWechatBinding` 复用行并恢复
- 多账号：每个账号独立判定
- 清空 token 后：`/accounts` 返回 `hasContextToken: false` → 主服务 `sessionActive=false`

## 技术约束

- 改动集中在 `wechat-bridge/src/bridge.mjs`（轮询检查 + 发送拒绝）；主服务与前端零改动
- 会话健康分类逻辑提取为可导出的纯函数（供 smoke 验证）

## 兼容性要求

- 正常会话（errcode 0/无字段）行为完全不变
- 桥对外 API 形状不变（/accounts 字段不变，仅值变化）

## 验收标准

- [ ] 桥收到 `errcode=-14` 后：清空 context tokens、停止监听、日志记录；`/accounts` 显示 hasContextToken=false
- [ ] 会话失效后发送被拒（503 + 明确信息）；主服务投递事件标记不可重试失败
- [ ] 绑定端 UI 显示「会话未激活/未同步」+ 引导卡；重新扫码后自动恢复
- [ ] 正常会话行为无回归
- [ ] `npm run typecheck` + `npm run smoke:e2e` 通过（桥为 .mjs 子进程，核心判定逻辑导出纯函数供测试）

## 待确认问题

- [x] 仅以 `errcode=-14` 作为会话作废信号（平台协议签名，已实测）
