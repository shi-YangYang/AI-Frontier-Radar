# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/polling/services/polling-account-service.ts` | 统一首轮锚定与增量游标判定 |
| `src/modules/polling/source/*` | 文章型源移除 `firstRunBaseline='all'`；榜单型源保留 |
| `src/modules/storage/watch-account-repository.ts` | 删除源时级联清理帖子与投递事件 |
| `src/modules/api/controllers/admin-controller.ts` | 删除接口返回级联数量 |
| `web/admin/src/pages/AccountsPage.vue` | 删除确认文案与带数量的成功提示 |
| `scripts/smoke-e2e.ts` | 首轮锚定、级联删除用例 |

## 修改顺序

1. 调整文章型源首轮行为，仅锚定最新 1 条；榜单型源保持首轮全量入库不投递。
2. 删除源时按「投递事件 → 帖子 → 源」顺序级联清理。
3. 管理端删除确认与结果提示补充数量。
4. 更新 smoke 断言并回归。

## 数据流

```text
首轮：fetch → 取最新 1 条作为 baseline（文章型） / 全量入库不投递（榜单型）
后续：仅入库 xPostId > 游标的条目

删除源：delivery_events → x_posts_raw → watch_accounts
```

## 接口变化

`DELETE /admin/api/watch-accounts/:id` 返回 `{ deleted, deletedPosts, deletedEvents }`。

## 测试计划

- `npm run typecheck`
- `npm run smoke:e2e`：文章型首轮只锚定、榜单型首轮全量、删除源级联且不影响其它源

## 风险

- 榜单型源首轮全量语义不能误改，否则会补推当日剩余条目。
- 删除顺序必须避免外键约束失败或遗留孤儿事件。

## 预计涉及文件

- `src/modules/polling/services/polling-account-service.ts`
- `src/modules/polling/source/*`
- `src/modules/storage/watch-account-repository.ts`
- `src/modules/api/controllers/admin-controller.ts`
- `web/admin/src/pages/AccountsPage.vue`
- `scripts/smoke-e2e.ts`
