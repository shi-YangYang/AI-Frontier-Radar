# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `web/admin/index.html` | 静态 `<title>` 改为「消息雷达」 |
| `web/admin/src/i18n.ts` | `brand.name` / `brand.ariaLabel` / `brand.documentTitle` / `brand.shortName` 中英文更新 |
| `web/admin/src/components/ToastNotice.vue` | 成功提示 4 秒后淡出；`danger` 持久显示；消息变化重置计时；卸载时清理计时器 |
| `web/admin/src/public.css` | `.me-wechat-layout.is-bound` 改为单列纵向堆叠 |

## 修改顺序

1. 更新品牌文案与页面标题。
2. 为 `ToastNotice` 增加自动消失逻辑与计时器清理。
3. 将微信绑定页两张卡改为上下堆叠。
4. `npm run typecheck` + `npm run build` + `npm run smoke:e2e`。

## 数据流

```text
ToastNotice(props.message, props.danger)
  → message 变化：清理旧计时器
  → 非空且非 danger：4 秒后进入 hiding，再隐藏
  → danger：保持显示
```

## 接口变化

无。后端投递署名与 Feed 标题按 Spec 非目标保持不变。

## 测试计划

- `npm run typecheck`
- `npm run build`
- `npm run smoke:e2e`（后端回归）
- 手动：连续保存观察提示重置；错误提示不自动消失；宽屏下两张卡纵向排列

## 风险

- 计时器未清理导致组件卸载后更新状态 → `onBeforeUnmount` 统一清理。
- 错误提示被误判为成功而自动消失 → 仅 `danger === false` 启动计时器。

## 预计涉及文件

- `web/admin/index.html`
- `web/admin/src/i18n.ts`
- `web/admin/src/components/ToastNotice.vue`
- `web/admin/src/public.css`
