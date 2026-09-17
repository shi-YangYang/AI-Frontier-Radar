# Spec

## 背景

消息量增长后（当前 136+ 条并持续累积），缺少数据出口与日常运维能力：无法导出帖子、无保留策略（SQLite 会无限增长）、无备份手段、运行日志只能在终端看。四个能力合并在本轮实现。

## 目标

### A. 帖子导出

- `GET /admin/api/posts/export?format=csv|json` + 现有帖子筛选参数（authorUsername / postedFrom / postedTo / query / isReply / isRepost）。
- CSV：UTF-8 带 BOM（Excel 直接打开），列：xPostId、authorUsername、postedAt、detectedAt、permalinkUrl、textContent、isReply、isRepost、dedupeKey；多行正文在 CSV 中正确引用转义。
- JSON：同字段数组。
- `limit` 默认 20000、最大 50000，按 postedAt 倒序；文件名 `posts-<时间戳>.<ext>`。
- PostsPage 提供「导出 CSV / 导出 JSON」按钮（按当前筛选）。

### B. 数据保留策略

- 设置项 `data.retentionDays`：0 = 关闭（默认），1–3650。
- 清理范围：`postedAt` 早于 cutoff 的帖子及其投递事件（先删事件，再删帖子）。
- 触发：每日自动（随轮询完成检查，间隔 ≥24h，记录 `data.lastCleanupAt`）+ 手动「立即清理」。
- API：`GET/PUT /admin/api/settings/data`（含过期预览计数）、`POST /admin/api/actions/cleanup-now`。
- SettingsPage 新增「数据保留」卡片：天数、保存、预览「将删除 N 条帖子 / M 条投递事件」、立即清理（二次确认）。

### C. 数据库备份 / 恢复

- 备份：`VACUUM INTO`（一致性快照，无需停服）到 `<sqlite目录>/backups/backup-<时间戳>.sqlite`；自动保留最近 10 份。
- API：`POST /admin/api/actions/backup`、`GET /admin/api/backups`、`GET /admin/api/backups/:name/download`、`DELETE /admin/api/backups/:name`。
- 恢复：CLI `npm run db:restore -- <备份文件>`（服务需停止；脚本校验 SQLite 头、检查端口无响应、自动先复制当前库为 pre-restore 快照，再替换并清理 -wal/-shm）。
- SettingsPage 新增「数据库备份」卡片：立即备份、备份列表（时间/大小/下载/删除）、恢复命令说明。

### D. 运行日志查看页

- 日志器增加内存环形缓冲（500 条，含 level/time/module/msg 及结构化字段，敏感键沿用现有 REDACTED 规则）。
- `GET /admin/api/logs?level=&limit=`：倒序返回，limit 默认 200 最大 500。
- 新页面 `/logs`「运行日志」：级别筛选、手动/自动刷新（5 秒）、等宽表格展示；导航新增入口。

## 非目标

- 不做 Web 端恢复（高风险，走 CLI）。
- 不清理 poll_runs、不压缩数据库文件（VACUUM 全库）。
- 不做导出到云存储/定时导出。

## 边界条件

- 保留策略 0 或过期数为 0：清理返回 0，不做删除。
- 清理批量进行（每批 500），避免大事务。
- 备份目录不存在时自动创建；同名冲突（同秒）追加序号。
- 下载备份名必须匹配 `backup-*.sqlite`，拒绝路径穿越。
- 导出无匹配数据：返回仅表头 CSV / 空数组 JSON，不报错。

## 技术约束

- 不新增依赖（SQLite 关系操作走 Prisma；`VACUUM INTO` 用 Prisma raw）。
- 备份/恢复不改变现有数据库结构与迁移。

## 验收标准

- [ ] 导出 CSV/JSON 内容、转义、文件名正确（smoke + 实机）
- [ ] 保留策略：预览计数、手动清理、每日自动仅触发一次
- [ ] 备份：创建/列表/下载/删除、自动保留 10 份；恢复脚本可用
- [ ] 日志页可见近期日志（含级别筛选）
- [ ] README 更新；smoke 全绿

## 待确认问题

无。
