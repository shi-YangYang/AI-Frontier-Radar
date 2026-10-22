# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] 消息页增加分类标签栏（全部 / X / YouTube / 官方博客 / 论文 / 社区榜单），默认全部
- [x] `sourcePlatformCategory` 统一计算平台归类，服务端返回 `platformCategory`
- [x] `GET /user/api/posts` 支持 `category` 过滤，先过滤再分页，计数正确
- [x] 分类与搜索为 AND 关系，非法分类值忽略
- [x] 前端切换分类回到第 1 页，翻页保持当前分类
- [x] 来源缺失时兜底归入 `blog`
- [x] 中英文分类文案齐全
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S2
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`src/config/source-groups.ts`（`sourcePlatformCategory`）、`src/modules/api/controllers/user-controller.ts`（分类过滤与返回）、`web/admin/src/pages/PortalPage.vue`（标签栏与查询参数）
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中相关 3 项：平台归类、服务端分类过滤与分页计数、分类与搜索 AND、非法分类忽略
- 未执行：消息页分类标签栏的浏览器交互与视觉回归。

## Issues

- 分类清单为硬编码规则，新增来源类型时需要同步扩展归类函数与 i18n。
- 来源被删除的帖子缺少来源信息，统一兜底 `blog`。

## Regression Risks

- 过滤与分页顺序必须一致，否则总数与页内容会不匹配。
- 旧客户端不传 `category` 时应保持原行为。
- 分类标签固定展示 5 类，空分类也应可点击并显示空态。

## Required Rework

- 无。
