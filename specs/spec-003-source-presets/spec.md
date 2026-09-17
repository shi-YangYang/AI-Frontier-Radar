# Spec

## 背景

spec-002 已把“监听账号”升级为通用订阅源并实现了 RSS/Atom provider。用户反馈：只填 RSS URL 的入口不够用，需要按来源类型直接添加（YouTube 频道、Reddit 子版块、arXiv 分类、Hacker News、产品发布、播客），并希望“多源”体验完整。

## 目标

在“监听源”页提供按来源类型添加的完整体验：选择类型 → 填写该类型特有输入（或选择预设）→ 系统转换为标准 feed URL → 完成添加；少数需要解析的来源（YouTube 频道）由服务端解析。

## 非目标

- 不新增非 RSS 形态的 provider（HF Papers API、GitHub Trending、IMAP 为后续迭代）。
- 不改动轮询链路、投递链路与数据模型（`source_type` 仍为 `x | rss`）。
- 不做关键词规则与本地 feed 输出（后续 spec）。

## 目标行为

支持的来源类型与转换规则（最终都落为 `{sourceType:'rss', sourceUrl}`）：

| 类型 | 用户输入 | 生成 feed URL |
| --- | --- | --- |
| X 账号 | 用户名 | （现有 X 流程不变） |
| RSS / 播客 | feed URL | 原样 |
| YouTube 频道 | 频道链接、`@handle` 或 `UC...` 频道 ID | 服务端解析后 `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` |
| Reddit 子版块 | 子版块名（如 `LocalLLaMA`）+ 排序（最新/热门/最高） | `https://www.reddit.com/r/<name>/<sort>/.rss` |
| arXiv | 分类预设（cs.AI / cs.CL / cs.CV / cs.LG / cs.RO / stat.ML） | `https://export.arxiv.org/rss/<category>` |
| Hacker News | 预设（首页 / 新建 / ≥100 分 / ≥300 分） | `https://hnrss.org/frontpage`、`/newest`、`/newest?points=100`、`/newest?points=300` |
| Product Hunt | 无需输入 | `https://www.producthunt.com/feed` |

- 新增服务端解析接口：`POST /admin/api/source-presets/youtube/resolve`，body `{input}`，返回 `{sourceUrl, label?}`；解析失败返回明确错误（400 输入无效 / 502 页面无法解析）。
- 解析请求遵循 RSS 代理配置（`RSS_PROXY_URL` / 控制台覆盖）。
- 列表徽标按 URL 推断展示：X / YouTube / Reddit / arXiv / HN / PH / RSS。
- 无效输入在前端拦截（子版块名格式、YouTube 输入非空等），并给出可读错误。

## 功能需求

1. 服务端：抽出带代理的 fetch 帮助函数（RSS provider 复用）；实现 YouTube 频道解析器；新增解析接口与路由。
2. 前端：监听源页新增类型选择（SelectControl）与各类型输入/预设；YouTube 支持“解析并添加”；错误提示细化。
3. i18n：中英文案。
4. 文档：README 增补支持矩阵；decision 记录 preset 映射；smoke 覆盖解析接口成功与失败路径。

## 边界条件

- YouTube 输入是 `UC...` 频道 ID 时直接拼 feed URL，不请求页面。
- 页面解析不到 channelId → 502，并提示可改用频道 RSS 地址或稍后重试。
- Reddit 子版块名不合法 → 前端提示，不发请求。
- arXiv 分类只允许白名单值（前端下拉固定）。
- 既有 X 与 RSS 添加流程保持兼容。

## 技术约束

- 不新增依赖（复用 undici 与现有 fetch）。
- 不新增数据模型字段；来源类型徽标由前端从 URL 推断。
- smoke 不访问真实外网：YouTube 解析用本地 mock HTML 页面。

## 验收标准

- [ ] 7 种类型均可按预设完成添加（URL 构造正确）
- [ ] YouTube `@handle`/`UC...` 解析成功返回 feed URL 与可选标题；解析失败与输入无效路径正确
- [ ] 解析请求走 RSS 代理配置（代码路径确认）
- [ ] 列表徽标正确区分 YouTube / Reddit / arXiv / HN / PH / RSS / X
- [ ] X 与 RSS 原有添加流程回归通过
- [ ] `typecheck` / `build` / `smoke:e2e` 通过（含 YouTube 解析 mock 用例）
- [ ] 文档同步（README + decision）

## 待确认问题

无（用户已确认：多源优先、先做源预设与添加体验）。
