# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `wechat-bridge/src/session-health.mjs` | 导出会话失效判定纯函数（仅 `errcode === -14`） |
| `wechat-bridge/src/bridge.mjs` | 收消息长轮询检查 `errcode`；失效时清 context token、停止监听并记日志 |
| `wechat-bridge/src/bridge.mjs` | 发送前检查 context token；缺失返回 503 与明确错误信息 |
| `src/modules/delivery/channel/wechat-bridge-sender.ts` | 识别 503/会话失效错误并标记不可重试 |
| `scripts/smoke-e2e.ts` | 纯函数判定、503 错误映射、正常会话不误判用例 |

## 修改顺序

1. 提取并导出会话失效判定函数。
2. 长轮询响应处理：`errcode=-14` → 清凭证、停止该账号监听、日志说明。
3. 发送路径：无 context token 直接失败（503），不再静默发送。
4. 主服务映射为 `WECHAT_SESSION_EXPIRED` 且不可重试。
5. 补 smoke 用例并回归。

## 数据流

```text
getUpdates (HTTP 200)
  → response.errcode === -14
  → 清空该账号 context tokens + 停止监听
  → GET /accounts: hasContextToken=false
  → sessionActive=false → 绑定端显示未激活引导

sendText
  → 无 context token → HTTP 503「微信会话已失效，请重新扫码绑定」
  → 主服务标记 WECHAT_SESSION_EXPIRED（不可重试）
```

## 接口变化

`/accounts` 字段形状不变，仅值变化；发送接口新增 503 失败语义。

## 测试计划

- `npm run typecheck`
- `npm run build`
- `npm run smoke:e2e`：仅 `errcode=-14` 命中、503 映射为不可重试、正常会话不误判
- 手动：真实微信重新扫码后恢复（需设备）

## 风险

- 误把其它错误码判为会话失效 → 仅精确匹配 `-14`。
- 清 token 后用户未重新扫码仍收不到消息 → UI 明确引导重新扫码。
- 发送失败不得重试，避免消耗额度。

## 预计涉及文件

- `wechat-bridge/src/session-health.mjs`
- `wechat-bridge/src/bridge.mjs`
- `src/modules/delivery/channel/wechat-bridge-sender.ts`
- `scripts/smoke-e2e.ts`
