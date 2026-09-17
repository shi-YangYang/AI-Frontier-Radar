# Acceptance

## Result

PASS

## Spec Coverage

- `anthropic_news` 类型全链路打通：校验 → 注册表 → 轮询入库 → 基线/去重/订阅规则；「AI 消息」组合已包含；`/accounts` 提供「Anthropic 新闻」类型（无需输入）。
- 解析兼容两种卡片结构：精选卡（`h4` 标题 + `p` 摘要 + 分类 span）与列表卡（`span.title` + `time` + subject span）；HTML 实体解码含十进制/十六进制数字实体。
- 字段：`dedupeKey = anthropic:news:<slug>`、`xPostId` = 日期毫秒（16 位）+ slug 哈希（8 位）、`permalink` 为站点绝对地址。
- `firstRunBaseline='all'`：首轮全量入库且不产生投递事件；后续新文章入库并产生投递事件。
- 错误码：无文章 → `SOURCE_RESPONSE_INVALID`；404/410 → `SOURCE_ACCOUNT_NOT_FOUND`；网络失败 → `SOURCE_REQUEST_FAILED`。

## Tests

- smoke 新增 3 项：解析（标题/摘要/分类/去重键/列表卡结构）、首次基线不投递、增量入库并投递；全量 53 项通过。
- 实机：经代理添加 `https://www.anthropic.com/news`（创建成功，标签 Anthropic News）；轮询实抓 11 篇入库（2026-07-23 ～ 2026-08-31），标题、日期与分类正确，无投递事件。

## Issues

验收中发现并已修复（均非阻塞）：
1. 列表卡标题位于 `span.title` 而非 `h4`，首版仅覆盖精选卡（3/11 篇）；现兼容两种结构。
2. 数字 HTML 实体（如 `&#x27;`）未解码；现已支持。

## Regression Risks

低：新增 provider 与源类型分支；注册表、校验、调度为增量分支，既有源逻辑未改动。

## Required Rework

无。
