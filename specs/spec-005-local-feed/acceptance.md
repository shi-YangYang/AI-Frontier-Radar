# Acceptance

## Result

PASS

## Spec Coverage

- `/feed.xml`（RSS 2.0）与 `/feed.json`（JSON Feed 1.1）已实现，Content-Type 分别为 `application/rss+xml; charset=utf-8`、`application/feed+json; charset=utf-8`。
- `limit` 默认 50、最大 200、非法回退默认；`?matched=1` 复用订阅规则 matcher（无启用规则时等同全量）。
- 标题回退：正文为空时用 `@authorUsername`；无帖子时返回合法空 feed（channel 存在、items 为空）。
- 路由挂根路径且无需鉴权；未改动数据库结构与轮询链路。

## Tests

- `npm run backend:typecheck` 通过；`npm run smoke:e2e` 53 项全绿，含新增 3 项（feed.xml 结构、feed.json+limit、matched 过滤）。
- 实机 curl：两个端点各返回 11 条（当前库 11 帖）；启用中的 CCF-A 规则下 `matched=1` 返回 0 条（Anthropic 文章不命中，符合预期）。

## Issues

无。

## Regression Risks

低：仅新增只读路由与控制器；`listLatest` 为新增仓库方法，未修改既有查询。

## Required Rework

无。
