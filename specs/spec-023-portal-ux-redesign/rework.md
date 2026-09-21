# Rework

## 首轮验收结论：FAIL

## 返工目标

1.（必做）PortalPage.vue 分页控件：省略号项与页码项共用 `page-${item.key}` key 空间产生重复 key（(7,4)→重复 page-1/page-5 等多组形态）。为省略号引入独立 key 命名（如 `ellipsis-${position}`），保证任意折叠形态下 key 全局唯一。
2.（清理）删除死 key `me.posts.loadMore`（i18n.ts 中英两处）。
3.（清理）`loadPosts` 移除 `replace=false` 默认参与追加分支（所有调用点均已传 replace=true）。

## 复验要求

返工完成后由新的独立验收 Agent 重新验收，不复用首轮报告结论。
