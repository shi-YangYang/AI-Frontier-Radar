# Spec

## 背景

三项品牌与体验调整：
1. 品牌名「AI 前沿雷达」需统一改为「消息雷达」（顶部 topbar、浏览器标签页 title 等）。
2. 各页面操作反馈是嵌入在页面内的静态 `<p>`（如「微信绑定成功。」），不会自动消失，长期残留影响观感。
3. 微信推送页绑定后两张卡片目前左右并排一行，改为**上下两行**：第一行「我的微信绑定」，第二行「推送设置」。

## 目标

1. 品牌名变更：zh「AI 前沿雷达」→「消息雷达」；en 同步调整为「Message Radar」；浏览器标签页 title 同步（`index.html` 静态 title + i18n `brand.documentTitle` 动态覆写）。
2. `ToastNotice` 组件增加自动消失：成功类提示 4 秒后自动淡出隐藏；**错误类（danger）保持持久显示**（用户需要看到失败原因），下一次新消息到达时重置计时。
3. 覆盖全部使用点（8 个页面共用同一组件，改组件即可全局生效）。
4. 微信推送页布局：`.me-wechat-layout.is-bound` 由两列改单列（纵向堆叠），绑定卡在上、推送设置卡在下；移动端行为不变（原本就是单列）。

## 非目标

- 不改推送消息里的 author 字段（`delivery-event-processor.ts`、`feed-controller.ts` 等后端硬编码「AI 前沿雷达」）——那是推送到 IM 的署名与 Feed 标题，是否改名另行决策
- 不改 `brand.subtitle`、README 徽章、仓库描述等站外文案
- 不做全局 toast 重构（保持现有 inline 组件，仅加自动消失）

## 当前行为

- `brand.name` / `brand.ariaLabel` / `brand.documentTitle`（zh+en）+ `web/admin/index.html` `<title>` 为「AI 前沿雷达」；`App.vue:253` 用 documentTitle 动态覆写标签页标题
- `ToastNotice.vue`：静态 `<p class="notice">`，`v-if="message.length > 0"`，父组件不清理则永远显示；被 Portal/Accounts/Settings/Overview/Posts/DeliveryEvents/PollRuns/Logs 8 页使用

## 目标行为

- 品牌：i18n 三个 key 双语更新 + `index.html` title 更新；favicon/alt 文本中的品牌名（`alt="AI Frontier Radar logo"`）同步
- ToastNotice：`watch(message)` —— 非空且非 danger → 4s 后淡出（CSS opacity transition）并隐藏；danger → 一直显示；message 变更重置计时
- 微信推送页：`public.css` 中 `.me-wechat-layout.is-bound` 两列规则删除/改为单列（与未绑定态一致）；gap 间距保持；卡片顺序绑定在上、设置在下（现有 DOM 顺序已如此）
- 页面其余结构不动

## 边界条件

- 连续两次保存操作：第二次提示重新计 4s
- danger 提示不自动消失（引导用户处理）；随后出现成功提示则正常 4s 消失

## 技术约束

- 不新增依赖；组件内自管理计时器（onBeforeUnmount 清理）
- 站外引用（README、部署文档）不动

## 验收标准

- [ ] topbar / 登录页 / 绑定端 / 标签页 title 全部显示「消息雷达」（英文界面 Message Radar）
- [ ] 成功类提示 4 秒自动消失；错误提示保留
- [ ] 微信推送页绑定后两卡纵向堆叠（绑定在上、设置在下）
- [ ] `npm run typecheck` + `npm run smoke:e2e` 通过

## 待确认问题

- [x] 推送到 IM 的 author 署名（后端硬编码）本次不改，另行决策
