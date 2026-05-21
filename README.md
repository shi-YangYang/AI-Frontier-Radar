# AI 前沿消息实时监测

V1 是一个本地/单机优先的准实时监测服务：轮询指定 X 账号的新帖，写入 SQLite 状态表，创建 `delivery_events`，再通过飞书群自定义机器人 Webhook 投递。

## 环境变量

运行时只需要一个实际配置文件：

```text
.env
```

默认配置已经可以本地启动；`.env` 主要用于覆盖默认值或做首次导入。飞书群自定义机器人 Webhook 可以在启动后通过本地配置页维护为列表，也可以继续通过 `.env` 提供初始默认项：

- `FEISHU_WEBHOOK_URL`：飞书群自定义机器人 Webhook。仅作为启动种子；SQLite 中已有默认投递目标时，不会被 `.env` 覆盖。

可选配置：

- `SQLITE_PATH`：默认 `.data/ai-news-monitor.sqlite`
- `REDIS_URL`：默认 `redis://127.0.0.1:1`
- `X_SOURCE_MODE`：默认 `browser`
- `X_BROWSER_USER_DATA_DIR`：默认 `.x-browser-public-profile`
- `X_BROWSER_HEADLESS`：默认 `true`
- `X_BROWSER_BASE_URL`：默认 `https://x.com`
- `X_BROWSER_NAVIGATION_TIMEOUT_MS`：默认 `30000`
- `X_BROWSER_POST_LOAD_TIMEOUT_MS`：默认 `15000`
- `X_API_BASE_URL` / `X_API_BEARER_TOKEN`：仅 `X_SOURCE_MODE=api` 时需要
- `POLL_INTERVAL_SECONDS`：轮询间隔，默认 `300`
- `FETCH_LIMIT_PER_ACCOUNT`：每个账号单次拉取数量，默认 `5`
- `EXCLUDE_REPLIES`：默认 `true`
- `EXCLUDE_REPOSTS`：默认 `true`
- `WATCH_ACCOUNTS_SOURCE`：默认 `database`
- `HOST` / `PORT` / `LOG_LEVEL`

## 本地启动

首次安装依赖：

```bash
npm run bootstrap
```

如需覆盖默认值，可创建本地配置文件 `.env`：

```text
.env
```

可选示例：

```dotenv
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/replace-with-real-token
```

之后启动只需要一条命令：

```bash
npm run local
```

`npm run local` 会自动读取 `.env`，并依次执行 Prisma 客户端生成、数据库迁移、TypeScript 构建和本地服务启动。系统环境变量仍可覆盖 `.env` 配置。

V1.6 起，轮询间隔、每账号抓取数量、是否排除回复、是否排除转发和飞书 Webhook 列表可在本地配置页写入 SQLite。运行时优先使用 SQLite 中的 Web 配置；`.env` 继续作为默认值或首次启动种子。SQLite 文件位置由 `SQLITE_PATH` 决定，默认是 `.data/ai-news-monitor.sqlite`。

如果本机 Windows 环境拦截 Prisma schema-engine 子进程，数据库迁移会自动退回到 SQLite 本地迁移兜底方案。

如果你正在开发代码并需要监听文件变化，也可以单独运行：

```bash
npm run dev
```

## X 数据源模式

默认推荐使用浏览器模式：

1. 设置 `X_SOURCE_MODE=browser`
2. 设置 `X_BROWSER_HEADLESS=false`
3. 启动服务后等待浏览器弹出，手动登录 X
4. 登录态会保存在 `X_BROWSER_USER_DATA_DIR`
5. 后续运行可把 `X_BROWSER_HEADLESS=true`

浏览器模式不会处理验证码，不做隐身或反检测，也不会把 Cookie、Token、浏览器配置目录内容写入仓库。

如果已有付费 X API，可改用 API 模式：

```powershell
X_SOURCE_MODE=api
X_API_BASE_URL=https://api.x.com
X_API_BEARER_TOKEN=replace-with-real-token
```

服务启动后可检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/ready
Invoke-RestMethod http://127.0.0.1:3000/config/summary
```

`/config/summary` 只返回配置摘要，不返回完整 Webhook。

## 本地网页管理页

V1.4 起，监测账号建议以 SQLite 数据库为准，并通过本地 Vue 管理控制台管理：

```text
http://127.0.0.1:3000/
```

V1.8 起，管理页品牌更新为 `AI 前沿雷达 / AI Frontier Radar`，根路径 `/` 是本地 Web 管理入口。页面使用“雷达扫描 + 信号点”Logo，并复用同源图标作为 favicon。中英文切换时，品牌名、副标题和浏览器标题会同步切换。

V1.8 同时优化了 PC / 移动端响应式体验：PC 端保留左侧 sidebar 和品牌区；移动端改为顶部品牌栏、语言切换按钮、菜单按钮和右侧抽屉导航，不再使用两列导航按钮或顶部横排导航。页面整体在手机尺寸下不应出现横向滚动；数据表格等宽内容会限制在局部容器内横向滚动，避免撑破页面。手机端页面头部主操作会以居中收窄的单列按钮组展示，筛选、表单、弹窗、分页和表格操作按钮组会居中或对称排列；抽屉关闭时不会在屏幕右侧残留阴影、边框或可见残影。

管理页拆分为五个本地页面：

- `/`：总览首页，查看运行摘要、监听账号数量、发送状态摘要、最近一次轮询，并可手动刷新、立即轮询、立即发送。
- `/accounts`：监听账号管理，支持账号关键词查询、新增账号、删除账号、分页和页码跳转。
- `/poll-runs`：最近轮询记录，支持时间范围查询、清空查询、分页跳转、删除记录、清空历史记录和查看错误详情。
- `/delivery-events`：最近发送记录，支持时间范围查询、清空查询、分页跳转、删除记录和清空历史记录。
- `/settings`：配置页，包含“飞书配置 / Feishu settings”“轮询配置 / Polling settings”“运行信息 / Runtime info”三个页内分类，支持保存轮询间隔、每账号抓取数量、是否排除回复、是否排除转发，并管理飞书 Webhook 列表。

V1.7 起，管理页和飞书通知补齐以下使用体验细节：

- 飞书新帖通知中的帖子发布时间拆分为北京时间和 UTC 时间两行展示，便于同时按本地时间和原始 UTC 时间核对。
- 新增监听账号前会先校验 X 账号是否存在；校验失败时不会写入监听账号，也不会创建帖子、发送事件或推进基线。
- 最近轮询和最近发送支持在当前页勾选多条记录并批量删除；删除未完成发送事件前会提示风险确认。
- 飞书 Webhook 列表支持分页，默认每页 10 条，并继续展示全量 Webhook 总数和启用数量。

V1.9 起，最近轮询和最近发送支持“清空历史记录”。清空历史是全量操作，不受当前查询条件、分页页码或勾选项影响；最近轮询只清空终态历史，保留进行中的 `running` 轮询，且不会重置监听账号基线或游标；最近发送只清空终态历史，保留 `pending`、`retry_wait`、`sending`，不会中断未完成发送或后续重试。监听账号页面支持按账号关键词查询，输入 `@username` 会归一化为不带 `@` 的用户名，同时支持分页和页码跳转。

配置页接入管理页中文/英文切换，默认打开“飞书配置”。飞书配置显示新增表单和 Webhook 列表，列表包含名称、`targetKey`、启用状态、脱敏预览、创建时间、更新时间和操作按钮。新增 webhook 默认启用；编辑时不会回填完整 URL，URL 留空表示只修改名称。保存、新增或编辑成功后输入框会清空，页面只显示 `webhookPreview`。可以对单个 webhook 启用、停用、测试发送或删除；刷新配置、保存轮询配置、新增、编辑、启用、停用、删除和测试发送都会按当前语言给出明确成功或失败反馈，重复 webhook URL 会显示清晰错误。删除 webhook 前会使用自定义弹框二次确认，并提示删除后该 webhook 未完成发送任务会停止。新消息会发送到所有启用的 webhook；新增 webhook 不会补发历史消息。运行信息分类展示只读信息，包括 source mode、SQLite 路径、Redis URL 脱敏预览、服务 host/port/env，以及 X 浏览器或 API 配置摘要；Bearer Token、Cookie 和浏览器 profile 内容不会展示。

V1.4 已删除旧的 `/admin` 页面入口，不保留跳转；`/admin/api/*` 仍作为后端 JSON API 路径供前端调用。新增账号请输入 X 用户名，也就是 `@` 后面的账号标识，例如 `openai` 或 `@openai`；系统会保存为不带 `@` 的小写用户名。

V1.2 起，管理页的表头、状态、按钮反馈和常见错误提示统一使用中文；V1.3 起逐步接入中文/英文切换。用户名、帖子 ID、URL、环境变量名等技术标识保持原样。

V1.3 起，管理页提供中文/英文一键切换。默认语言为中文，点击后页面可见 UI 文案会在不刷新页面的情况下切换，当前选择会保存到浏览器 `localStorage`，刷新管理页后继续使用上次选择；如果 `localStorage` 不可用、为空或保存了非法语言值，则回退中文。用户名、帖子 ID、URL、`targetKey`、环境变量名、API 字段名和第三方原始错误文本仍保持原样。

V1.2 起，监听账号最近轮询时间、最近轮询开始/结束时间、最近发送创建/发送时间会按浏览器本地时区显示为 `2026/5/18 10:45:32` 这种格式。最近轮询和最近发送默认每页 10 条，支持上一页/下一页分页；轮询记录有错误摘要时，可在“操作”列点击“查看错误”查看按账号拆分的错误详情。

V1.3 记录管理起，监听账号操作只保留“删除”，不再提供启用/禁用；删除监听账号只删除账号行，不删除历史帖子、轮询记录或发送记录。最近轮询和最近发送支持按时间范围查询、清空查询、输入页码跳转和单条删除；V1.4 起删除确认和错误详情使用自定义弹框，不再使用浏览器原生确认框。删除待发送、等待重试或发送中的发送记录时，页面会提示删除后不会继续发送或重试。

`/`、`/accounts`、`/poll-runs`、`/delivery-events`、`/settings`、`/admin-assets/*` 和 `/admin/api/*` 只允许从 `127.0.0.1`、`::1` 或 `::ffff:127.0.0.1` 访问。如果服务配置为 `HOST=0.0.0.0`，局域网其他机器也会被拒绝访问管理路由和管理静态资源。

如果需要从旧的 `WATCH_ACCOUNTS` 或文件列表做一次性导入，可以临时设置：

```text
WATCH_ACCOUNTS_SOURCE=env
WATCH_ACCOUNTS=openai,AnthropicAI
```

或设置 `WATCH_ACCOUNTS_SOURCE=file` 与 `WATCH_ACCOUNTS_FILE_PATH`。启动时这些种子账号会写入或更新数据库中的启用状态，但不会禁用仅通过 Web 页面新增的账号，也不会覆盖已有 `baseline_post_id` / `last_seen_post_id`。导入完成后，建议切回 `WATCH_ACCOUNTS_SOURCE=database`，后续都在 `/accounts` 管理账号。

## 开发协作和文档同步

项目采用规格驱动开发（SDD）。新迭代应先在 `docs/specs/<feature-id>/` 下维护需求规格、技术设计、实施计划、交接记录和验收记录。

每次版本迭代验收后必须同步：

- `README.md`：更新用户可见行为、启动方式、配置方式和限制。
- `docs/specs/<feature-id>/handoff.md`：标记当前状态和后续任务。
- `docs/specs/<feature-id>/verification/acceptance.md`：记录验收范围和验证结果。
- `prompts/context-recovery.md`：当代理分工、启动方式、项目边界或长期规则变化时同步更新。

如果聊天上下文丢失，使用 `prompts/context-recovery.md` 中的协调、实施、验收代理提示词恢复上下文。

## 数据库迁移和客户端生成

Prisma 命令通过 `SQLITE_PATH` 生成 `DATABASE_URL`，不需要手动设置 `DATABASE_URL`：

```powershell
npm run prisma:generate
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

## 端到端冒烟验证

运行：

```powershell
npm run smoke:e2e
```

冒烟验证使用临时 SQLite、本地模拟 X API、本地模拟飞书 Webhook，不访问真实 X 或真实飞书。它会验证：

- 浏览器模式不需要 `X_API_BEARER_TOKEN`
- API 模式缺少 `X_API_BEARER_TOKEN` 会配置失败
- 调度器在浏览器模式会创建浏览器数据源
- 种子监听账号会写入数据库
- 首次无帖不设置错误基线
- 后续首条新帖写入 `x_posts_raw`
- 新帖创建 `delivery_events`
- 投递工作器发送到模拟 Webhook
- 成功后 `delivery_events.status = sent`
- `/health` 可用
- `/config/summary` 不泄露 Webhook
- `/ready` 在 Redis 不可用时返回 `503 DEPENDENCY_UNREADY`

脚本结束后会关闭模拟服务并删除临时数据库目录。

## 当前 V1 限制和真实接入注意事项

- 不接 X 实时流，只使用用户时间线轮询。
- 不在飞书内管理监测账号，账号通过本地 `/accounts` 页面维护。
- 飞书 Webhook 支持多个投递目标；新消息会发送到所有启用项，新增目标不会补发历史消息。
- Redis 在当前实现中用于就绪检查和后续队列依赖；本地真实运行需要可连接 Redis。
- 首次接入已有历史帖的账号时，系统会建立基线，避免补发历史消息。
- API 模式真实 X 接入必须确认 `X_API_BASE_URL` 兼容 `/2/users/by/username/:username` 和 `/2/users/:id/tweets`。
