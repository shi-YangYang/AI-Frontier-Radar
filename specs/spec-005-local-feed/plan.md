# Plan

## 涉及模块

- `src/modules/storage/x-post-repository.ts`（新增 `listLatest(limit)`，按 postedAt 倒序）
- `src/modules/api/routes/feed-routes.ts`（新）+ `routes/index.ts` 注册
- `src/modules/api/controllers/feed-controller.ts`（新：构建 RSS/JSON Feed）
- `scripts/smoke-e2e.ts`（新增用例）
- `README.md`

## 修改顺序

1. repository `listLatest`。
2. feed controller：读取帖子 + 订阅规则 matcher（复用 polling 的 `createSubscriptionRuleMatcher`）→ 构建两种格式。
3. feed routes + 注册。
4. smoke：`/feed.xml`、`/feed.json`、`?matched=1`（临时写入规则后断言）。
5. README。

## 数据流

GET /feed.{xml,json} → storage.xPosts.listLatest(limit 或 500[matched]) → matcher 过滤 → 序列化输出。

## 接口变化

新增两个公开只读端点（本机）。

## 测试计划

- typecheck / build / smoke；实机 curl 两个端点并校验结构。

## 风险

- 无（只读端点，复用现有数据）。
