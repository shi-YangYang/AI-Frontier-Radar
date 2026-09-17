# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/storage/types.ts` | `WatchAccountSourceType` 增加 4 类型 |
| `src/modules/polling/types/source-provider.ts` | `SourceType` 增加 4 类型 |
| `src/modules/polling/source/ai2-blog-source-provider.ts` | 新增（HTML 解析，fetch-with-proxy） |
| `src/modules/polling/source/moonshot-blog-source-provider.ts` | 新增（HTML 解析，fetch-with-proxy） |
| `src/modules/polling/source/browser-session.ts` | 新增（持久 profile、UA 掩码、串行队列） |
| `src/modules/polling/source/meta-ai-blog-source-provider.ts` | 新增（浏览器 + GraphQL JSON 递归抽取） |
| `src/modules/polling/source/xai-news-source-provider.ts` | 新增（浏览器 + 渲染 HTML 卡片解析） |
| `source/index.ts`、`polling/index.ts` | 导出 |
| `src/modules/scheduler/runtime-scheduler.ts` | 注册 4 个 provider（代理沿用 rss 配置） |
| `src/modules/api/controllers/admin-controller.ts`、`src/server/start-server.ts` | 校验分支 |
| `src/config/source-groups.ts` | AI 消息组合：+Mistral/Stability/HF Blog RSS + 4 新类型；更新说明 |
| `web/admin/...`（admin-api、AccountsPage、i18n） | 4 个新类型选项与徽标 |
| `scripts/smoke-e2e.ts` | 解析 fixture 用例 + 校验分支 |
| `README.md`、`constitution/roadmap.md`、`specs/spec-007-.../acceptance.md` | 文档 |

## 修改顺序

1. 类型层 → 2. 服务端解析 provider（AI2/Moonshot）→ 3. browser-session + Meta/xAI → 4. 调度与校验接线 → 5. 组合/UI → 6. smoke → 7. 文档 → 8. 构建重启实机验证。

## 解析要点

- **AI2**：按行（`bd-be-w_2px` 分隔）提取日期 div（`June 12, 2026`）、首个 `href="/blog/<slug>"`、`<h2>` 标题、`Blurb` span 摘要。
- **Moonshot**：按 `class="post-item"` 提取 `<h3><a href="/blog/posts/<slug>">` 标题与 `<time dateTime>`。
- **Meta**：浏览器监听 `/api/graphql` 响应，递归抽取含 `title`+`href` 的对象（date/description/research_area 可选），按 href 去重。
- **xAI**：渲染后取 `page.content()`，按 `<a href="/news/<slug>">` 块解析：标题 `h1-h4`、日期 `time` 或日期型 `p`、分类首个非 `·` span、摘要非日期型 `p`。

## 测试计划

- smoke：`parseAi2BlogHtml`、`parseMoonshotBlogHtml`、`parseMetaBlogGraphqlBodies`、`parseXaiNewsHtml` 纯函数 fixture 断言；新增类型校验分支断言。
- 实机：逐源添加并触发 `poll-now`，核对抓取条数、标题、日期、无投递事件。

## 风险

- Meta GraphQL 结构变化 → 递归抽取 + 明确报错。
- xAI/Meta 反爬升级 → 已在 headless 下验证；如失效属于后续维护项，不影响其他源。
- 浏览器源增加轮询耗时（每源数秒至十几秒），与现有 X 源同模式。
