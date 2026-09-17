# Acceptance

## Result

PASS

## Spec Coverage

1. 可添加 RSS 源并轮询入库、首次只建基线 1 条 — 通过。添加链路 `admin-controller.ts`（`createIfAbsentBySource`）+ `RssSourceProvider.validateSource`；基线语义沿用 `polling-account-service.ts`（cursor 为空时仅取最新 1 条）；smoke 断言 ID 为 24 位数字、`baselinePostId !== null`。
2. RSS 增量检测、去重、投递与 X 一致 — 通过。稳定 ID（16 位毫秒 + 8 位哈希）可 BigInt 比较；smoke 覆盖增量入库+投递、重复轮询 0 新增。
3. feed 失败隔离与错误记录 — 通过。404/410→`SOURCE_ACCOUNT_NOT_FOUND`、其他非 2xx→`SOURCE_REQUEST_FAILED`、解析失败→`SOURCE_RESPONSE_INVALID`；smoke 部分失败场景 + 实机负向探测。
4. X 回归 — 通过。X provider 仅接口适配，浏览器伪装与页面解析未改；smoke 10 项 X 场景全绿，实机旧请求体与运行中 X 轮询 success。
5. 管理 API 兼容旧请求体 — 通过。`{username}`/`{xUsername}` 双兼容（smoke + 实机）。
6. `typecheck` / `build` / `smoke:e2e` — 通过（smoke 25 项含 11 项 RSS/Atom）。
7. 文档同步 — 通过。README、`constitution/tech-stack.md`、`.ai/decisions/rss-source-model.md`。

迁移核查：表重建 SQL 完整复制旧列、旧数据默认 `source_type='x'`；全新库与升级库均可 `migrate deploy`；重复 deploy 无副作用。

## Tests

- `npm run typecheck`、`npm run build`、`npm run smoke:e2e`（25/25）、`node scripts/prisma-cli.cjs migrate status`（3 个迁移，schema up to date）
- 全新临时库 migrate deploy、旧数据迁移复现（临时库）
- 实机负向探测：非法 URL→400、拒连→502、404→404、HTML→502；只读接口字段含 `sourceType/sourceUrl`

未执行：真实外部 feed 轮询（避免污染用户库，改用 mock feed 覆盖）；RSS 1.0/RDF 分支无样本覆盖（spec 为尽力支持）；真实飞书投递（无投递目标，smoke mock 覆盖）。

## Issues

- Low（已在验收后修复）：RSS 请求 30s 超时原先未覆盖响应体读取，`clearTimeout` 早于 `response.text()`。已把超时清理移至整个请求-读取流程之后，`typecheck` 与 `smoke:e2e` 复跑通过。
- Low（接受）：缺日期条目按抓取时刻生成 ID，跨轮可能重复入库；spec 规定的边界行为，已在 decision 与 README 明确。
- Info：RSS 帖在消息页的 `authorDisplayName` 可能为空（展示层小瑕疵，不影响功能）。
- Info：`disableAccountsExceptUsernames` 无调用方（既有死代码，防误禁用 RSS 账号）。

## Regression Risks

- Provider 泛化贯穿轮询链路，靠 X 10 项 + RSS 11 项 smoke 与实机回归覆盖；X 抓取解析代码逐行未改。
- 24 位合成 ID 的 8 位哈希存在极小碰撞概率（spec 指定方案）。
- 缺日期 RSS 源会周期性重复入库（已知限制）。

## Required Rework

无。

---

# Rework Round（用户追加修复）

用户要求解决验收中记录的两个已知限制，实施记录见 `rework.md`。

## Result

PASS（自验；本轮因流程约定由协调 Agent 直接实施，未启用独立子 Agent 验收）

## 修复内容

1. **缺日期条目重复入库**：新增 `x_posts_raw.dedupe_key`（可空唯一，迁移 `20260917000000_add_dedupe_key`）；RSS 条目输出 `rss:<sha256(feedUrl#guid/link)前32位>`；`persistPost` 命中 dedupeKey 即跳过 upsert 与投递事件，事件仅在帖子确为新增时创建。
2. **RSS 代理**：新增 `undici` 依赖（全局 fetch 与外部 undici 的 dispatcher 接口不兼容，代理路径改用 undici 自带 fetch + `ProxyAgent`）；`RSS_PROXY_URL`（.env 默认）+ Web 控制台「RSS 源」页签覆盖（app_settings `source.rss.proxyUrl`），仅支持 http/https。

## 验证

- `npm run typecheck`（backend + admin）、`npm run build`、`node scripts/prisma-cli.cjs migrate status`（4 个迁移）均通过。
- `npm run smoke:e2e`：28 项全绿，新增「缺日期条目跨轮不重复入库」「RSS 代理请求经代理转发（本地 HTTP 代理桩）」「RSS 代理不可用时请求失败」。
- 实机：`GET/PUT /admin/api/settings/rss` 往返正常（database_override 与脱敏预览）；`socks5://` 返回 400 并给出协议提示；清空后回退 env_default。
- 全局 fetch 兼容性结论已记录到 `.ai/decisions/rss-source-model.md`（代理必须走 undici 自带 fetch）。

## Issues

无新增阻塞问题。原验收 Low/Info 中“缺日期重复入库”已解决；README 与 decision 已同步。
