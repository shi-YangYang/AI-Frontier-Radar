# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/config/source-groups.ts` | 新增 `sourcePlatformCategory(sourceType, sourceUrl)`，作为平台归类唯一权威 |
| `src/modules/api/controllers/user-controller.ts` | `/user/api/posts` 返回 `platformCategory`，支持 `category` 服务端过滤并联动分页计数 |
| `web/admin/src/pages/PortalPage.vue` | 搜索框下方分类标签栏（单选），切换分类回第 1 页，翻页保持分类 |
| `web/admin/src/api/admin-api.ts` | 帖子查询参数类型补充 `category` |
| `web/admin/src/i18n.ts` | 分类标签中英文案 |
| `scripts/smoke-e2e.ts` | 归类、服务端过滤、分类与搜索 AND 用例 |

## 修改顺序

1. 实现平台归类函数（x / youtube / blog / paper / community）。
2. 改造用户端帖子查询：先按来源归类过滤，再执行搜索与分页，确保计数一致。
3. 响应补充 `platformCategory`；非法 `category` 忽略。
4. 前端增加标签栏并接入查询参数。
5. 补 smoke 用例并回归。

## 数据流

```text
GET /user/api/posts?page&pageSize&query&category
  → 关联来源账号 → sourcePlatformCategory(sourceType, sourceUrl)
  → category 过滤（AND 搜索）
  → 分页计数 → 返回 post.platformCategory
```

## 接口变化

新增可选查询参数 `category` 与响应字段 `platformCategory`；旧客户端不受影响。

## 测试计划

- `npm run typecheck`
- `npm run smoke:e2e`：平台归类、服务端过滤与分页计数、分类与搜索叠加、非法分类忽略
- 手动：切换分类、翻页、搜索组合、空分类空态

## 风险

- 来源被删除的帖子缺少来源信息 → 兜底归入 `blog`。
- 过滤与分页顺序错误会导致计数不一致 → 在 SQL/查询层先过滤再分页。
- 分类清单未来扩展只改归类函数与 i18n，不改接口结构。

## 预计涉及文件

- `src/config/source-groups.ts`
- `src/modules/api/controllers/user-controller.ts`
- `web/admin/src/pages/PortalPage.vue`
- `web/admin/src/api/admin-api.ts`
- `web/admin/src/i18n.ts`
- `scripts/smoke-e2e.ts`
