# Spec

## 背景

早期 P0 规划中的「本地 RSS/JSON 输出」是最后一项未完成项：让本机数据可被外部阅读工具消费（Feedly / Inoreader / Newsletter 工具等），无需鉴权与第三方服务。

## 目标

- 提供 `GET /feed.xml`（RSS 2.0）与 `GET /feed.json`（JSON Feed 1.1）。
- 默认输出最新内容；支持 `?limit=`（默认 50，最大 200）。
- 支持 `?matched=1`：仅输出命中“订阅规则”（启用中）的内容；没有启用规则时等同全量（与投递语义一致）。

## 非目标

- 不做鉴权/多用户（仅本机使用）。
- 不修改数据库结构与轮询链路。

## 当前行为

- 帖子仅通过本地 Web 控制台查看，无法被外部工具订阅。

## 目标行为

- `/feed.xml`：channel = 「AI 前沿雷达」，item = 标题（正文首行，≤120 字）、链接（原文）、guid（xPostId）、pubDate（postedAt）、author（authorUsername）、描述（完整正文）。
- `/feed.json`：JSON Feed 1.1 结构（version/home_page_url/feed_url/items），item 含 id/url/title/content_text/date_published/authors。
- 两个端点都按 `postedAt` 倒序；`limit` 非法时使用默认值；`matched=1` 时只取启用规则。
- Content-Type 分别为 `application/rss+xml; charset=utf-8`、`application/feed+json; charset=utf-8`。

## 边界条件

- 无帖子：返回合法空 feed（channel 存在、items 为空）。
- 无启用规则时 `matched=1`：返回全量。
- 帖子标题为空（正文为空）：标题回退为 `@authorUsername`。

## 技术约束

- 不新增依赖（XML 用 fast-xml-parser 的 XMLBuilder 构建，避免手写转义）。
- 路由挂在根路径（非 /admin），与本机服务同端口。

## 验收标准

- [ ] `/feed.xml` 与 `/feed.json` 返回 200、合法结构与正确 Content-Type
- [ ] `limit` 与 `matched=1` 行为符合上述规则
- [ ] smoke 新增用例通过（含 matched 过滤）
- [ ] README 更新

## 待确认问题

无。
