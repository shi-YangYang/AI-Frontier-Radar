# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/modules/storage/x-post-repository.ts` | `countExpired`、`listExpiredIds`、`deleteByXPostIds`、`listForExport` |
| `src/modules/storage/delivery-event-repository.ts` | `countExpiredByPostCutoff`、`deleteByXPostIds` |
| `src/modules/storage/runtime-settings-service.ts` | `data.retentionDays` / `data.lastCleanupAt` 读写与预览计数 |
| `src/modules/maintenance/retention-service.ts`（新） | 清理逻辑、每日自动（runIfDue）、手动清理 |
| `src/modules/maintenance/backup-service.ts`（新） | VACUUM INTO、列表、删除、保留 10 份 |
| `src/lib/logger/log-buffer.ts`（新） | 环形缓冲 + 查询 |
| `src/lib/logger/logger.ts` | 写入缓冲（沿用脱敏后的条目） |
| `src/modules/scheduler/runtime-scheduler.ts` | 轮询 tick 后调用 retention.runIfDue() |
| `src/modules/api/controllers/admin-controller.ts` | 导出（CSV/JSON）、设置、清理、备份、日志接口 |
| `src/modules/api/routes/admin-routes.ts` | 新路由（含二进制下载响应） |
| `scripts/db-restore.cjs`（新）、`package.json` | 恢复 CLI 与 npm script |
| `web/admin/src/pages/PostsPage.vue` | 导出按钮 |
| `web/admin/src/pages/SettingsPage.vue` | 数据保留 + 数据库备份两张卡片 |
| `web/admin/src/pages/LogsPage.vue`（新）、`router.ts`、`App.vue`、`NavIcon.vue` | 日志页与导航 |
| `web/admin/src/api/admin-api.ts`、`i18n.ts` | 接口与文案 |
| `scripts/smoke-e2e.ts` | 导出/保留/备份/日志用例 |
| `README.md`、`constitution/roadmap.md`、`specs/spec-008-data-ops/acceptance.md` | 文档 |

## 修改顺序

1. 存储层仓库方法 → 2. 保留/备份服务 → 3. 日志缓冲 → 4. 控制器与路由 → 5. 调度钩子 → 6. 前端（导出/设置/日志页）→ 7. 恢复 CLI → 8. smoke → 9. 文档与实机验证。

## 数据流

- 导出：帖子查询参数 → 仓库 `listForExport` → 序列化（CSV/JSON）→ Fastify `reply.send`（Content-Disposition）。
- 清理：`retentionDays` → cutoff（postedAt < now - N 天）→ 预览 `count`；执行按批：事件 `deleteMany(xPostId in ids)` → 帖子 `deleteMany(xPostId in ids)`。
- 备份：独立 Prisma 连接执行 `VACUUM INTO` → 目录扫描列表（mtime/size）→ 最新 10 份保留。
- 日志：logger 序列化条目 → 环形缓冲（500）→ GET 接口过滤。

## 测试计划

- smoke：导出 CSV（表头/BOM/转义/筛选）与 JSON；保留设置保存 + 预览计数 + cleanup-now 删除数与最近帖子保留；备份创建/列表/下载头/删除；logs 接口返回条目与级别过滤；恢复脚本干跑（`--check` 模式）。
- 实机：导出文件下载；设置保留 90 天并清理（若无过期数据则 0）；创建备份并下载；日志页浏览。

## 风险

- 恢复脚本属高风险操作：默认要求服务停止，并自动生成 pre-restore 快照。
- 每日自动清理的“仅一次”依赖时间戳记录，轮询失败不影响该记录。
