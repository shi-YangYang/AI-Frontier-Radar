# Spec

## 背景

第一批无 RSS 站点（Anthropic）接入后，继续补齐高价值官方来源。实测结论：

- 无 RSS 且服务端可直接解析：AI2 博客、Moonshot 博客。
- 无 RSS 且需无头浏览器（反爬/CSRF）：Meta AI 博客（bot 防护，普通 fetch 400）、xAI 新闻（Cloudflare，普通 fetch 403）。
- 有 RSS、可直接收录：Mistral 博客（`mistral.ai/news/rss`）、Stability AI（Squarespace `?format=rss`）、Hugging Face Blog（`huggingface.co/blog/feed.xml`）。

## 目标

新增 4 个源类型，并把 3 个发现 RSS 的站点加入「AI 消息」组合：

| 类型 | 站点 | 方式 | 去重键前缀 |
| --- | --- | --- | --- |
| `ai2_blog` | allenai.org/blog | 服务端 HTML 解析 | `ai2:blog:` |
| `moonshot_blog` | platform.moonshot.cn/blog | 服务端 HTML 解析 | `moonshot:blog:` |
| `meta_ai_blog` | ai.meta.com/blog | 无头浏览器（捕获 GraphQL 响应） | `meta:blog:` |
| `xai_news` | x.ai/news | 无头浏览器（渲染后解析卡片） | `xai:news:` |

- 全部 `firstRunBaseline = 'all'`：首次全量入库不投递，之后仅新增投递。
- 全部接入既有基线/去重/订阅规则/投递链路，并加入「AI 消息」监听组合。
- 浏览器源复用 Playwright（已有运行时依赖），headless 默认开启，走 RSS 代理配置。

## 非目标

- Cohere / Perplexity（反爬或 403，暂不验证）。
- Stability 自定义解析（RSS 已满足）。
- 不做登录态、翻页抓取；列表页可见条目即可（AI2 约 9 条、Moonshot 约 26 条、xAI 首页卡片、Meta 首页列表）。

## 目标行为

- 解析字段：标题、日期、可选摘要/分类；`permalinkUrl` 为站点绝对地址；`postedAt` 取页面日期（缺失回退抓取时刻）。
- `xPostId` = 发布日期毫秒（16 位）+ slug 哈希（8 位），保持纯数字稳定 ID。
- 浏览器源：渲染超时/页面无内容 → `SOURCE_RESPONSE_INVALID`；网络失败 → `SOURCE_REQUEST_FAILED`；404/410 → `SOURCE_ACCOUNT_NOT_FOUND`。
- `/accounts` 新增 4 种类型（均无需输入）。

## 边界条件

- Meta GraphQL 响应缺失或结构变化 → 明确报错（`SOURCE_RESPONSE_INVALID`），不静默返回空。
- xAI 卡片缺摘要/分类 → 仅输出标题；日期解析失败 → 回退抓取时刻。
- AI2 行结构不匹配 → 跳过该行；全部不匹配 → `SOURCE_RESPONSE_INVALID`。

## 技术约束

- 不新增依赖；浏览器源共用新抽取的 `browser-session`（持久 profile、UA 掩码、操作串行队列），不影响现有 X 源。
- 服务端解析源复用 `fetch-with-proxy`（RSS 代理设置）。

## 验收标准

- [ ] 4 个新类型可校验/添加，轮询入库且首次不投递
- [ ] smoke 覆盖纯解析函数（fixture HTML/JSON）与校验分支
- [ ] 实机抓取成功：AI2、Moonshot、Meta、xAI 各至少 5 条
- [ ] RSS 三项在组合中可一键添加并抓取成功
- [ ] 组合、README、roadmap 同步

## 待确认问题

无。
