# Plan

## 涉及模块

- `prisma/schema.prisma` + 新增迁移（`prisma/migrations/<ts>_add_rss_sources/migration.sql`）
- `src/modules/polling/types/source-provider.ts`（泛化）
- `src/modules/polling/source/rss-source-provider.ts`（新增）
- `src/modules/polling/source/x-source-provider.ts`、`browser-x-source-provider.ts`（适配新接口，行为不变）
- `src/modules/polling/source/x-source-diagnostics.ts`（适配接口）
- `src/modules/polling/source/index.ts`
- `src/modules/polling/services/polling-account-service.ts`（按源类型调度）
- `src/modules/polling/orchestrator/polling-orchestrator.ts`、`jobs/run-polling-job.ts`
- `src/modules/scheduler/runtime-scheduler.ts`（registry 构建）
- `src/modules/storage/watch-account-repository.ts`、`watch-account-seed-sync.ts`、`types.ts`
- `src/modules/api/controllers/admin-controller.ts`、`schemas/admin.ts`（如需要）
- `scripts/smoke-e2e.ts`（新增 mock RSS feed 场景）
- `web/admin/src/pages/AccountsPage.vue`、`api/admin-api.ts`、`i18n.ts`、`styles.css`（如需要）
- `README.md`、`.ai/decisions/`、`constitution/tech-stack.md`

## 目标接口（实施基准）

```ts
export type SourceType = 'x' | 'rss';

export interface SourceDescriptor {
  sourceType: SourceType;
  sourceUrl?: string;     // rss
  xUserId?: string;       // x
  xUsername?: string;     // x
}

export interface SourceProviderFetchInput {
  limit: number;
  sincePostId?: string;
  source: SourceDescriptor;
}

export interface SourceProviderAccount {
  displayName?: string;
  sourceId: string;       // x: xUserId；rss: `rss:<hash(url)>`
  sourceLabel: string;    // x: username；rss: feed 标题或域名
}

export interface SourceProvider {
  readonly sourceType: SourceType;
  fetchPosts(input: SourceProviderFetchInput): Promise<SourceProviderFetchResult>;
  validateSource(input: { source: SourceDescriptor }): Promise<SourceProviderAccount>;
}

export interface SourceProviderRegistry {
  get(sourceType: SourceType): SourceProvider;
}
```

- `StandardizedPost` 沿用现有字段（`xPostId` 字段名保留以兼容存储层；对 RSS 即稳定合成 ID）。
- 存储映射：`authorUserId = sourceId`、`authorUsername = 条目作者（creator/author.name）或 sourceLabel`。

## 修改顺序

1. Prisma schema + 迁移 + `watch-account-repository`/`types` 调整（旧数据默认 `source_type='x'`）。
2. types 泛化 + X provider（API/浏览器/诊断）适配，保持行为。
3. `RssSourceProvider`：fetch（超时/UA）、解析（RSS2/Atom，尽力 RDF）、HTML 去标签、日期解析、稳定 ID、错误码映射。
4. 轮询服务/编排/调度 registry：按 `account.sourceType` 选择 provider；`createRuntimeSourceProviders(config)` 返回 `{ x, rss }`。
5. 管理 API：创建请求体扩展与兼容、列表字段扩展、RSS 校验。
6. 前端“监听源/账号”页：类型选择 + RSS URL 输入 + 列表展示。
7. smoke：新增 mock RSS feed 场景（首次基线、增量、去重、投递）。
8. 文档：README（功能/配置/FAQ）、decisions、tech-stack（fast-xml-parser）。

## 数据流

添加 RSS 源 → `watch_accounts(source_type='rss', source_url)` → 轮询 tick 构建 registry → 按类型取 `RssSourceProvider` → HTTP GET + 解析 → `StandardizedPost[]` → 基线/增量过滤 → `x_posts_raw` upsert → `delivery_events`（沿用 spec-001 语义：有目标即建事件）。

## 接口变化

- `POST /admin/api/watch-accounts`：请求体 `{sourceType?: 'x'|'rss', xUsername?, sourceUrl?}`；不传 `sourceType` 且带 `xUsername` 时按 `x` 处理（向后兼容）。
- `GET /admin/api/watch-accounts`：条目新增 `sourceType`、`sourceUrl`。
- 内部 `SourceProvider` 接口泛化（不对外）。

## 测试计划

- `npm run typecheck`、`npm run build`、`npm run smoke:e2e`（新增 RSS mock：RSS 2.0 与 Atom 样本各覆盖一条路径）。
- 迁移验证：`node scripts/prisma-cli.cjs migrate status` + 既有数据保留检查。
- 实机：添加 1 个真实 RSS 源 → 托盘轮询 → 看板可见 → 投递回归（无目标时不投递）。
- 无单测框架，以上述命令与 smoke 为准。

## 风险

- Provider 泛化涉及面广，最易回归；依赖 smoke 的 X 场景 + 实机回归。
- SQLite 改列空性需表重建，务必验证旧数据完整。
- RSS 源质量参差：缺 link/日期/编码异常需容忍；解析失败要分类清楚。

## 迁移策略

- 新迁移只加不删；`x_username` 可空通过 Prisma 生成的 SQLite 表重建实现；旧数据 `source_type` 默认 `'x'`。

## 预计涉及文件

见“涉及模块”。实施完成后按 AGENTS.md §14 返回 Implementation Report。
