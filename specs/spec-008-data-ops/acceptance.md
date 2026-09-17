# Acceptance

## Result

PASS

## Spec Coverage

- **帖子导出**：`GET /admin/api/posts/export` 支持 CSV/JSON 与现有帖子筛选参数（authorUsername / postedFrom / postedTo / query / isReply / isRepost），`limit` 默认 20000 最大 50000；CSV 带 UTF-8 BOM、字段转义、下载文件名；PostsPage 提供「导出 CSV / 导出 JSON」按钮。
- **数据保留策略**：`data.retentionDays`（0 = 关闭，默认关闭，1–3650）；`GET/PUT /admin/api/settings/data` 返回过期预览计数与上次清理时间；`POST /admin/api/actions/cleanup-now` 批量清理（事件先于帖子）；轮询完成后调用 `runIfDue()`，间隔 ≥24 小时，失败仅告警不影响轮询；SettingsPage 新增「数据与备份」页签（天数、预览、二次确认清理）。
- **数据库备份/恢复**：`VACUUM INTO` 快照到 `.data/backups/`，自动保留最近 10 份；创建/列表/下载（SQLite 头校验）/删除接口齐全；恢复走 `npm run db:restore -- <文件>`（校验备份文件、检测服务停止、自动 pre-restore 快照、清理 -wal/-shm，支持 `--check`）。
- **运行日志**：日志器内存环形缓冲 500 条（沿用脱敏规则）；`GET /admin/api/logs` 支持 `level`（info/warn/error 最低级别过滤）与 `limit`（默认 200 最大 500）；新增 `/logs` 页面（级别筛选、手动/自动刷新、导航入口）。

## Tests

- `backend:typecheck`、`admin:typecheck`、`smoke:e2e` 62 项全绿（新增 4 项：导出、保留策略、备份、日志）。
- 实机验证：CSV 导出 355 条数据行（表头 + BOM + 多行正文引用正确）；JSON 按来源筛选正常；保留策略 90 天预览 32 条帖子（随后恢复为关闭，未删除数据）；备份创建（244 KB）、下载验证 SQLite 头、列表正常；日志缓冲 12/500 且内容正确。
- UI 截图核对：运行日志页、配置「数据与备份」页签、消息内容导出按钮均正常渲染。

## Issues

- 验收中发现并修复：配置页数据设置未在挂载时加载（一直显示"读取中"）；`logs` 接口未传 `level` 时参数校验抛错；导出接口未传 `format` 时同样问题。
- 已修复（验收后追加）：帖子作者筛选与账号搜索的 SQLite `LIKE` 通配符问题——改用 `LIKE ... ESCAPE` 解析精确匹配值后等值查询（`_`/`%` 现在按字面处理），并新增通配符转义回归用例。

## Regression Risks

低：新增接口与页面均为增量；日志缓冲为旁路写入（不影响原有 stdout 输出）；保留策略默认关闭且不改变现有数据结构。

## Required Rework

无。
