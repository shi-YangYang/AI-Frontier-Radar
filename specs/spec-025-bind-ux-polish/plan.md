# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `web/admin/src/pages/PortalPage.vue` | 绑定区增加 `scanned` 中间态卡；账号已登记但会话未激活时展示「等待首条消息」引导卡；沿用现有 3 秒轮询 |
| `web/admin/src/i18n.ts` | 复用现有 `me.bind.*` 文案；仅在有缺口时补齐中英文 |
| `web/admin/src/public.css` | 复用 `me-bind-guide` / `me-status` 样式，不新增独立视觉体系 |

## 修改顺序

1. 梳理 `loginStatus`、`boundAccount`、`sessionActive` 三个状态来源及其优先级。
2. `loginStatus === 'scanned'` 时隐藏二维码，展示「已扫码，请在手机上确认」状态卡。
3. `accounts.length > 0 && !sessionActive` 时展示 ClawBot 首条消息引导卡。
4. `sessionActive === true` 恢复现有成功态；失败路径保持现状。
5. `npm run typecheck` + `npm run smoke:e2e`。

## 数据流

```text
GET /user/api/wechat（3 秒轮询）
  → login.status = 'scanned'            → 已扫码待确认卡（隐藏二维码）
  → accounts.length > 0 && !sessionActive → 等待首条消息引导卡
  → sessionActive = true                → 正常已连接态
```

## 接口变化

无。纯前端状态渲染，后端与微信桥协议零改动。

## 测试计划

- `npm run typecheck`
- `npm run smoke:e2e`（后端回归，不覆盖前端视觉）
- 手动：扫码 → 手机确认 → 发送消息 → 页面自动恢复（需真实微信）

## 风险

- 轮询期间 `loginStatus` 与 `boundAccount` 更新不同步，可能短暂显示错误卡片；以单一状态优先级渲染规避。
- 会话未激活时的引导卡不得压住解绑/重新绑定入口。

## 预计涉及文件

- `web/admin/src/pages/PortalPage.vue`
- `web/admin/src/i18n.ts`（如需）
- `web/admin/src/public.css`（如需）
