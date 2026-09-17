# Plan

## 涉及模块

- `src/modules/polling/source/fetch-with-proxy.ts`（新）：抽出带代理的 fetch（RSS provider 复用）
- `src/modules/polling/source/rss-source-provider.ts`（改为使用该帮助函数）
- `src/modules/polling/source/youtube-channel-resolver.ts`（新）：解析频道链接/@handle/ID → feed URL
- `src/modules/polling/source/index.ts`、`src/modules/polling/index.ts`（导出）
- `src/modules/api/controllers/admin-controller.ts`、`routes/admin-routes.ts`（`POST /admin/api/source-presets/youtube/resolve`）
- `web/admin/src/pages/AccountsPage.vue`、`api/admin-api.ts`、`i18n.ts`、`styles.css`
- `scripts/smoke-e2e.ts`（mock YouTube 页面 + 解析接口用例）
- `README.md`、`.ai/decisions/rss-source-model.md`

## 修改顺序

1. `fetch-with-proxy.ts` 抽出并让 `RssSourceProvider` 复用（行为不变）。
2. `youtube-channel-resolver.ts`：
   - 输入 `UC...` → 直接构造 feed URL；
   - 输入 `@handle` / `/channel/UC...` / `/c/...` / `/user/...` 或裸 handle → 请求 `https://www.youtube.com/<path>`，从 HTML 提取 `"channelId":"UC..."`（兼容 `externalId`），可选提取 `og:title`；
   - 解析失败抛 `YoutubeResolveError`（区分 invalid-input / resolve-failed）。
3. 控制器与路由：读取 `{input}`；通过 `runtimeSettings.getEffectiveRssProxySettings()` 取代理；调用解析器；返回 `{sourceUrl, label?}`；错误映射 400/502。
4. 前端：
   - 类型选择（SelectControl）：X / RSS·播客 / YouTube / Reddit / arXiv / Hacker News / Product Hunt；
   - 各类型输入与预设（Reddit 排序、arXiv 分类、HN 预设）；
   - YouTube「解析并添加」：调用解析接口后展示 feed URL 与标题，再提交；
   - 列表徽标按 URL 推断。
5. smoke：mock YouTube 页面（含 channelId 与 og:title）→ 解析成功；无 channelId 页面 → 502；空输入 → 400。
6. 文档与验证。

## 接口变化

- 新增 `POST /admin/api/source-presets/youtube/resolve` → `{ok, data:{sourceUrl, label?}}`。
- 现有接口不变。

## 测试计划

- `npm run typecheck` / `npm run build` / `npm run smoke:e2e`（新增 3 项解析用例）。
- 实机：用真实频道 URL 解析（可选，需代理）；Reddit/arXiv/HN/PH 添加后观察轮询结果（可选）。

## 风险

- YouTube 页面结构变化可能导致 `channelId` 提取失效：失败时给出明确提示，用户可改为直接粘贴频道 RSS。
- 前端表单复杂度上升：保持结构与既有样式一致，错误提示复用现有 notice。

## 迁移策略

无（不加字段、不改 schema）。

## 预计涉及文件

见“涉及模块”。
