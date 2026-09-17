# 订阅源统一模型与 RSS 稳定 ID

- `watch_accounts` 统一承载 X 账号与 RSS 源：`source_type`（`x`/`rss`，默认 `x`）+ 可空 `x_username` + 可空 `source_url`；RSS 以 `(source_type, source_url)` 唯一，X 仍以 `x_username` 唯一。选择统一表而非新建 RSS 表，是为了让基线/增量/去重/入库/投递链路与帖子表完全复用。
- 轮询通过 `SourceProviderRegistry` 按 `source_type` 选择 provider，`SourceDescriptor` 承载 `sourceType/sourceUrl/xUsername/xUserId`；X provider 仅适配接口，抓取与解析行为不变。
- RSS 帖子沿用 `x_posts_raw.x_post_id`：稳定 ID 为 `发布时间毫秒（16 位补零）+ guid/link 哈希（8 位）`纯数字，可直接与 X 数字 ID 做 BigInt 游标比较并复用唯一约束去重，代价是不同平台的 ID 在同一字段混存。
- 帖子去重使用独立 `dedupe_key`（RSS 为 `feed URL + guid/link` 的 sha256 前缀，X 留空）：缺日期条目不再依赖合成时间 ID 判重，跨轮不会重复入库；命中去重键的条目直接跳过 upsert 与投递事件。事件只在帖子确为新增时创建。
- RSS 抓取代理通过 `undici` 的 `ProxyAgent` 实现（全局 fetch 与外部 undici 的 dispatcher 接口不兼容，代理路径必须走 undici 自带的 fetch）；配置为 `RSS_PROXY_URL`（.env 默认）与 Web 控制台 `source.rss.proxyUrl`（运行时优先），仅支持 http/https，不支持 socks5。
- RSS 解析使用 `fast-xml-parser`（唯一新增依赖），仅支持 feed 提供的 title/description/content，不抓取全文。
- 来源预设（YouTube / Reddit / arXiv / Hacker News / Product Hunt）统一在前端转换为标准 feed URL 后按 RSS 源入库，不新增 source_type；YouTube 频道解析在服务端完成，复用 RSS 代理配置；列表徽标由前端按 feed URL 推断。
- 默认推荐源仅在“监听源表为空且 `app_settings.sources.defaultsImportedAt` 标记不存在”时导入一次，导入不做网络校验（由后续轮询暴露错误），删除后不会恢复。
- GitHub 分三种形态：热门仓库使用独立 `source_type='github'`（服务端解析 Trending 页面，仓库去重键为 `github:trending:<owner/repo>`）；仓库发布与用户动态使用 GitHub 原生 Atom（`releases.atom` / `<user>.atom`）按 `rss` 类型接入。GitHub 页面抓取复用“RSS 源”页签的代理配置。
- GitHub 热门仓库采用“首次全量基线”：首次轮询把当前榜单整体入库但不创建投递事件（避免一次推送几十条），之后只有新进入榜单的仓库才产生投递事件；`SourceProvider.firstRunBaseline='all'` 是通用机制，其他榜单类源可复用。
- HF Daily Papers 通过官方 JSON API 接入，独立 `source_type='hf_papers'`，复用 `firstRunBaseline='all'`（首次全量基线不投递）。
- 订阅规则只控制投递：存储于 app_settings `subscription.rules`，命中任一启用规则才创建投递事件，无启用规则时保持全量投递；排除词优先，包含词支持 any/all（共现）两种模式；帖子始终入库。
