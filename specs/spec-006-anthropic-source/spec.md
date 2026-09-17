# Spec

## 背景

多源接入后，仍有官方站点没有 RSS：Anthropic 新闻页（`/news/rss.xml` 实测 404）是调研中记录的主要缺口。用户要求补齐（xAI 页面返回 403，暂不支持；邮件 IMAP 已明确放弃）。

## 目标

新增 `anthropic_news` 源类型：服务端解析 `https://www.anthropic.com/news` 列表页，输出标准帖子，接入既有基线/去重/入库/投递/订阅规则链路；并加入「AI 消息」监听组合。

## 非目标

- 不支持 xAI / Meta 等其他无 RSS 站点（后续如需要按同模式扩展）。
- 不做邮件 IMAP。

## 当前行为

- 该站点无法作为监听源接入。

## 目标行为

- 解析列表页中 `a[href^="/news/"]` 卡片块：标题（h4）、日期（time）、分类、摘要（p）。
- 帖子字段：`permalink` = 站点绝对地址；`postedAt` = 页面日期；`textContent` = 标题 + 摘要；`dedupeKey` = `anthropic:news:<slug>`；`xPostId` = 发布日期毫秒（16 位）+ slug 哈希（8 位，纯数字稳定 ID）。
- `firstRunBaseline = 'all'`：首次全量入库不推送；之后仅新文章推送。
- 抓取复用「RSS 源」页签的代理配置；解析失败/页面异常给出明确错误。
- `/accounts` 新增「Anthropic 新闻」类型（无需输入）；「AI 消息」组合包含该源。

## 边界条件

- 页面无文章链接 → SOURCE_RESPONSE_INVALID；404/410 → SOURCE_ACCOUNT_NOT_FOUND；网络失败 → SOURCE_REQUEST_FAILED。
- 卡片缺摘要 → 只输出标题；缺日期 → 回退抓取时刻。

## 技术约束

- 不新增依赖；沿用 github/hf 的 provider 与注册表模式。

## 验收标准

- [ ] 可添加/校验该源；轮询入库且首次不投递
- [ ] smoke 覆盖解析、去重、增量投递
- [ ] 实机抓取成功
- [ ] 组合与 README 同步

## 待确认问题

无。
