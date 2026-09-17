# Rework（spec-002 后续修复）

spec-002 验收 PASS，但用户要求解决验收中记录的两个已知限制。

## 修复 1：稳定去重键（缺日期条目跨轮重复入库）

- 数据模型：`x_posts_raw` 新增 `dedupe_key`（可空、唯一；SQLite 允许多个 NULL）；X 帖子不写该字段。
- RSS provider：每条目输出 `dedupeKey = 'rss:' + sha256(feedUrl + '#' + itemKey).slice(0, 32)`（itemKey = guid | link | title+date）。
- 存储层：`CreateXPostRawInput` / `XPostRaw` 增加 `dedupeKey`；仓库新增 `findByDedupeKey`；upsert 写入该字段。
- 轮询服务 `persistPost`：
  1. 判重优先 `post.dedupeKey ? findByDedupeKey : findByXPostId`；
  2. 命中去重键 → 直接返回 `{ isNewPost: false, eventsCreated: 0 }`，**不再 upsert**（否则新合成 ID 会撞唯一索引）；
  3. 仅 `isNewPost === true` 时创建投递事件（杜绝重复与补发）。
- 验证：smoke 新增「缺日期条目连续两轮轮询：第二轮 0 新增、行数不变」；更新 README 与 `.ai/decisions/rss-source-model.md` 中“缺日期可能重复入库”的表述。

## 修复 2：RSS 抓取代理

- 依赖：新增 `undici`（零传递依赖）。
- 配置：`RSS_PROXY_URL`（`.env` 默认）+ Web 控制台覆盖（app_settings `source.rss.proxyUrl`）；优先级沿用“数据库覆盖 > env 默认”；仅支持 `http://` / `https://` 代理（undici 不支持 socks5，需在文档写明）。
- 运行时：`RssSourceProvider` 接收 `proxyUrl`，配置时以 `undici.ProxyAgent` 作为 fetch 的 dispatcher。
- API：`GET /admin/api/settings/rss`（脱敏预览 + 来源）、`PUT /admin/api/settings/rss`（body `{proxyUrl}`，空串清空覆盖）。
- UI：设置页新增「RSS」页签：代理输入、当前预览与来源、保存/清空、安全提示与 socks5 限制说明。
- 验证：smoke 至少覆盖「代理指向不可用端口 → 请求失败（证明 dispatcher 生效）」与「未配置代理 → 直连成功」；如可行，用本地极简 HTTP 转发代理覆盖正向路径。

## 验收

两项完成后执行 `typecheck` / `build` / `smoke:e2e` / `migrate status`，并由独立验收 Agent 复核；结果追加到本目录 `acceptance.md`。
