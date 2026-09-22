# Plan

## 涉及模块

| 层 | 文件/模块 | 改动 |
| --- | --- | --- |
| 数据 | `prisma/schema.prisma` + migration | `SourcePack` / `SourcePackItem` 表 + 索引 |
| 数据 | `src/modules/storage/` | pack 仓库（CRUD/成员/列表含成员数）、types 扩展 `DeliveryTargetConfig.packIds` |
| 后端 | `src/config/source-groups.ts` + seed 入口 | 首启幂等 seed：ensure 预设源 → 建「AI 消息」包挂成员 |
| 后端 | `src/modules/api/controllers/admin-controller.ts` + routes + schemas | 新增 source-packs CRUD；删除 source-groups 路由/函数 |
| 后端 | `src/modules/api/controllers/user-controller.ts` | binding 返回 sourcePacks/packIds；sources 接口 mode 语义（兼容旧体） |
| 后端 | `src/modules/polling/services/polling-account-service.ts` | acceptsSource 改造：按周期解析 effective 集（包 union + sourceIds union），空集跳过 |
| 前端 | `web/admin/src/pages/AccountsPage.vue` + `admin-api.ts` | 主题包面板（替代监听组合）；封装更新 |
| 前端 | `web/admin/src/pages/PortalPage.vue` | 三分段 + 包卡片 + 生效源数 + chips 分组/平台小标 |
| 前端 | `web/admin/src/source-labels.ts` | 平台徽标函数 platformBadge |
| 前端 | `web/admin/src/i18n.ts` | 中英新增（包管理/三分段/生效提示/徽标） |
| 测试 | `scripts/smoke-e2e.ts` | 移除监听组合断言；新增 ≥4 包用例 |

## 实施顺序（串行单 Agent）

1. Prisma schema + migration + storage 仓库 + types
2. 首启 seed（AI 消息包）+ 管理端 source-packs API；删除监听组合 API/前端封装/面板
3. 投递过滤语义（含单周期缓存）
4. 用户端 API（binding/PUT mode）
5. 前端：Portal 三分段/包卡片/chips 分组/徽标/生效源数；source-labels 平台徽标
6. i18n 全量 → smoke 改造 + 新用例
7. `npm run typecheck` + `npm run smoke:e2e` + `npm run build` + README

## 关键数据流

- 建包/改成员 → watch_accounts 不动（成员是关联不是复制）
- 用户选包 → `config.packIds` 落库；投递解析：packs（enabled=true）成员 ∪ sourceIds → effective 集合
- 删除包 → 成员行级联 + 遍历 delivery_targets 清理悬空 packIds 落库；停用包 → 不动 config

## 风险

- 投递过滤回归（自定义/全部语义）→ smoke 既有用例（源过滤生效）必须保持全绿
- seed 与手工源并存幂等
- 主题包面板 UI 体量大（列表+编辑器），预留返工轮次
