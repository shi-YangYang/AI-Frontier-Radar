# Spec

## 背景

当前系统只支持监听 X 账号，信息源单一。用户明确要求引入多源能力，第一优先是 RSS/Atom 通用源（覆盖官方博客、媒体、Newsletter 等）。同时把“监听账号”升级为通用“订阅源”，为后续关键词规则（spec-003）与本地 feed 输出（spec-004）打基础。

## 目标

- 支持把 RSS/Atom feed URL 添加为订阅源，与 X 账号在同一个“监听源”列表中统一管理。
- 系统按订阅源类型自动选择抓取方式：X 走现有浏览器/API 抓取；RSS 走 HTTP 拉取 + XML 解析。
- RSS 新帖与 X 帖子走同一条基线/增量/去重/入库/投递链路。
- 迁移平滑：现有 X 账号数据保留，行为不变。

## 非目标

- 不做关键词规则（spec-003）、不做 feed 输出（spec-004）。
- 不做 RSS 全文抓取（只用 feed 提供的 title/description/content）。
- 不引入新的云服务或付费依赖。

## 当前行为

- `watch_accounts` 仅 X 账号（`x_username` 非空唯一）。
- `SourceProvider.fetchPosts` 入参 `xUsername` 必填，`provider` 固定为 `'x'`。
- 轮询服务按单一 provider 抓取。

## 目标行为

- `watch_accounts` 增加 `source_type`（`x` | `rss`，默认 `x`）与 `source_url`（RSS feed URL，可空）；`x_username` 改为可空；`(source_type, source_url)` 唯一。
- 新增 `RssSourceProvider`：HTTP GET feed（30s 超时、明确 UA、跟随跳转），支持 RSS 2.0 与 Atom（RSS 1.0/RDF 尽力支持）；输出统一 `StandardizedPost`。
- 轮询按账户 `sourceType` 从 provider 注册表选择 provider；X 行为与现状完全一致。
- 管理 API 与“监听源”页面支持新增/查看 RSS 源（URL + 解析出的标题），展示来源类型。
- RSS 帖子的 `xPostId` 使用“发布时间毫秒（16 位补零）+ guid/link 哈希（8 位）”的纯数字稳定 ID，保证基线/游标比较（BigInt）与去重可用。

## 功能需求

1. 数据模型与迁移：新列、唯一约束、`x_username` 可空（SQLite 表重建），旧数据默认 `source_type='x'`。
2. Provider 泛化：`SourceDescriptor`（sourceType/sourceUrl/xUsername/xUserId）+ `SourceProviderRegistry`，X provider 适配新接口但行为不变。
3. RSS 抓取与解析：`fast-xml-parser`，HTML 去标签、实体解码、日期解析（pubDate/published/updated → ISO，缺失回退抓取时刻）。
4. 统一轮询链路：基线（首次只存最新 1 条）、增量（id > cursor）、回复/转发过滤、入库、投递事件，全部沿用现有语义。
5. 管理 API：`POST /admin/api/watch-accounts` 兼容旧请求体（`{xUsername}`），新增 `{sourceType:'rss', sourceUrl}`；列表返回 `sourceType/sourceUrl`。
6. 监听源页面：添加表单支持选择 X 账号 / RSS 源，列表展示类型与标题。
7. 文档与决策留痕更新（README、`.ai/decisions/`、`constitution/tech-stack.md` 依赖记录）。

## 边界条件

- feed 无条目 → 视为成功且 0 帖（不设错误基线）。
- feed 404/410 → `SOURCE_ACCOUNT_NOT_FOUND`；其他非 2xx → `SOURCE_REQUEST_FAILED`；解析失败 → `SOURCE_RESPONSE_INVALID`；单个源失败不影响其他源。
- 条目缺 link → 跳过该条目；缺日期 → 用抓取时刻。
- 同 feed 内重复 guid → 去重；跨轮重复 → 由稳定 ID + cursor 去重。
- X 与 RSS 混存互不影响；现有 X 账号、帖子、投递事件、设置不受影响。

## 技术约束

- 新增依赖仅 `fast-xml-parser`（记录到 `constitution/tech-stack.md`）。
- 不改动 X 抓取行为（浏览器伪装 / 解析逻辑）。
- 迁移必须可通过 `npm run prisma:migrate:deploy` 应用（含本地 fallback）。

## 兼容性要求

- `POST /admin/api/watch-accounts` 现有调用保持可用。
- `npm run smoke:e2e` 全部通过，并新增 RSS 场景（mock feed）。

## 验收标准

- [ ] 可添加 RSS 源并轮询入库；首次只建基线 1 条
- [ ] RSS 增量检测、去重、投递链路与 X 一致
- [ ] feed 失败不影响其他源，错误记录到该源
- [ ] X 账号添加/轮询/投递全部回归通过
- [ ] 管理 API 兼容旧请求体
- [ ] `typecheck` / `build` / `smoke:e2e` 通过（smoke 含 RSS mock feed 场景）
- [ ] 文档同步（README + decisions + tech-stack）

## 待确认问题

无。关键决策已与用户确认：统一为订阅源 / 只控推送与入库解耦（本 spec 仅入库链路）/ fast-xml-parser / feed 输出范围。
