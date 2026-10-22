# Decisions

本文件汇总项目的长期重要决策。每条按主题保留结论、关键约束与影响；更详细的历史讨论见引入本文件前的 Git 历史。新增重要决策直接补入对应主题。

## 1. 订阅源统一模型与 RSS 稳定 ID

- `watch_accounts` 统一承载 X 账号与 RSS 源：`source_type`（`x` / `rss`，默认 `x`）+ 可空 `x_username` + 可空 `source_url`；RSS 以 `(source_type, source_url)` 唯一，X 以 `x_username` 唯一，从而复用基线、增量、去重、入库与投递链路。
- 轮询通过 `SourceProviderRegistry` 按 `source_type` 选择 provider，`SourceDescriptor` 承载 `sourceType / sourceUrl / xUsername / xUserId`。
- RSS 帖子沿用 `x_posts_raw.x_post_id`：稳定 ID 为「发布时间毫秒（16 位补零）+ guid/link 哈希（8 位）」纯数字，可直接与 X 数字 ID 做 BigInt 游标比较；代价是不同平台 ID 在同一字段混存。
- 帖子去重使用独立 `dedupe_key`（RSS 为 feed URL + guid/link 的 sha256 前缀，X 留空），缺日期条目不再依赖合成时间 ID 判重；命中去重键的条目跳过 upsert 与投递事件。
- RSS 抓取代理使用 `undici` 的 `ProxyAgent`（全局 fetch 与外部 undici dispatcher 不兼容），仅支持 `http://` / `https://`；配置为 `RSS_PROXY_URL` 与 Web 控制台 `source.rss.proxyUrl`（运行时优先）。
- RSS 解析使用 `fast-xml-parser`，仅使用 feed 提供的 title / description / content，不抓取全文。
- 来源预设（YouTube / Reddit / arXiv / Hacker News / Product Hunt）统一转换为标准 feed URL 后按 RSS 源入库；YouTube 频道解析在服务端完成并复用 RSS 代理。
- GitHub 分三种形态：热门仓库使用独立 `source_type='github'`（服务端解析 Trending 页面），仓库发布与用户动态使用 GitHub 原生 Atom 按 `rss` 接入。
- 榜单型源（GitHub Trending、HF Daily Papers）使用 `SourceProvider.firstRunBaseline='all'`：首轮全量入库但不创建投递事件，之后只有新进入榜单的条目才投递。
- 订阅规则只控制投递：存储于 `app_settings` 的 `subscription.rules`，命中任一启用规则才创建投递事件；无启用规则时全量投递，排除词优先，包含词支持 any / all。
- 初始化后不自动添加监听源；内置来源清单仅作为种子数据，在管理端一键添加，已存在源自动跳过。

## 2. X 浏览器数据源外部约束

- 无头 Chromium 的 `HeadlessChrome` 标识出现在 UA 与 Client Hints 时，x.com 返回 403；只伪造 `navigator.userAgent` 无效，必须通过 CDP `Emulation.setUserAgentOverride`（含 `userAgentMetadata`）同时覆盖 Client Hints。`navigator.webdriver` 仍为 `true`，X 目前未据此拦截；若策略升级，可能需要进一步伪装或退回有头模式。
- x.com 新前端已移除全部 `data-testid`，帖子也没有 `<time datetime>`；解析器基于 `article`、`/status/` 链接与 `[dir="auto"]` 文本块，时间从本地化日期文本近似转换，无法识别时回退为抓取时刻。
- 长帖折叠为 “Show more / 显示更多”，抓取时自动点击展开；链接缩略显示用锚点 href 还原完整地址。已入库帖子不回溯，只影响新入库内容。
- 匿名访问只展示部分帖子；需要完整时间线时，在 `/settings → X 数据源 → 打开 X 登录窗口` 登录一次，复用 `.x-browser-public-profile` 持久化 profile。
- 无可用投递目标时轮询照常执行：帖子入库供 `/posts` 查看，不创建投递事件；之后配置投递目标只推送新帖，不补发历史。

## 3. AGENTS 规范升级与分支适配

- 采用新版 `AGENTS.md`，保留本项目显式配置：`project_mode: EXISTING`、`business_code_dir: src, web/admin`、`multi_agent: true`。
- 通用模板默认主分支为 `main`，本项目按仓库实际统一为 `master`，PR 流程为 `dev → master`；避免 Agent 执行不存在的 `origin/main` 同步命令。
- 接入 `.ai/rules/web-design.md`，作为 Web 界面文案、信息密度与语言一致性的项目规则。
- `spec-022`～`spec-031` 的验收记录为追溯补记，明确标注其非原始实施时点的独立验收；未执行的检查如实保留。
- 若未来仓库主分支正式改为 `main`，需同步更新 `AGENTS.md`、README、CI/CD 与远端配置。

## 4. 历史 Spec 归档

- 历史 Spec 收敛为 `specs/history.md`：30 个已完成 Spec 各保留一句话摘要，按基础链路、微信与用户端、近期迭代分组。
- 删除 `specs/spec-*` 目录；保留 `specs/README.md`、`specs/_template/` 与新 Spec 按目录创建的约定。
- 详细 `spec.md` / `plan.md` / `acceptance.md` 以归档前的 Git 历史为准；`spec-015` 为历史跳号，无对应目录。
- 后续新增 Spec 仍按 `spec-XXX-short-name/` 创建，完成后将一句话摘要补入 `history.md`。

## 5. 决策记录归档

- 决策记录收敛为本文件；原按主题拆分的决策文件删除，详细讨论以归档前的 Git 历史为准。
- 新增重要决策直接补入本文件对应主题；涉及架构、数据模型、API、第三方服务、业务规则或兼容策略时，仍需按 `AGENTS.md` 第 10 节留痕。
