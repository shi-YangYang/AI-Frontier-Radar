# AI 前沿消息实时监测

V1 是一个本地/单机优先的准实时监测服务：轮询指定 X 账号的新帖，写入 SQLite 状态表，创建 `delivery_events`，再通过飞书群自定义机器人 Webhook 投递。

## 环境变量

运行时只需要一个实际配置文件：

```text
.env
```

本地和服务器都只需要至少填写：

- `FEISHU_WEBHOOK_URL`：飞书群自定义机器人 Webhook

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

创建本地配置文件 `.env`，至少填入你的飞书机器人 Webhook：

```text
.env
```

示例：

```dotenv
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/replace-with-real-token
```

之后启动只需要一条命令：

```bash
npm run local
```

`npm run local` 会自动读取 `.env`，并依次执行 Prisma 客户端生成、数据库迁移、TypeScript 构建和本地服务启动。系统环境变量仍可覆盖 `.env` 配置。

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

V1.1 起，监测账号建议以 SQLite 数据库为准，并通过本地网页管理：

```text
http://127.0.0.1:3000/admin
```

页面支持查看运行摘要、账号列表、最近轮询、最近发送事件，也支持新增账号、删除账号、手动触发轮询和手动触发发送。新增账号请输入 X 用户名，也就是 `@` 后面的账号标识，例如 `openai` 或 `@openai`；系统会保存为不带 `@` 的小写用户名。

V1.2 起，管理页的表头、状态、按钮反馈和常见错误提示统一使用中文。用户名、帖子 ID、URL、环境变量名等技术标识保持原样。

V1.3 起，管理页顶部提供中文/英文一键切换。默认语言为中文，点击后页面可见 UI 文案会在不刷新页面的情况下切换，当前选择会保存到浏览器 `localStorage`，刷新 `/admin` 后继续使用上次选择；如果 `localStorage` 不可用、为空或保存了非法语言值，则回退中文。用户名、帖子 ID、URL、`targetKey`、环境变量名、API 字段名和第三方原始错误文本仍保持原样。

V1.2 起，监听账号最近轮询时间、最近轮询开始/结束时间、最近发送创建/发送时间会按浏览器本地时区显示为 `2026/5/18 10:45:32` 这种格式。最近轮询和最近发送默认每页 10 条，支持上一页/下一页分页；轮询记录有错误摘要时，可在“操作”列点击“查看错误”查看按账号拆分的错误详情。

V1.3 记录管理起，监听账号操作只保留“删除”，不再提供启用/禁用；删除监听账号只删除账号行，不删除历史帖子、轮询记录或发送记录。最近轮询和最近发送支持按时间范围查询、清空查询、输入页码跳转和单条删除；删除待发送、等待重试或发送中的发送记录时，页面会提示删除后不会继续发送或重试。

`/admin` 和 `/admin/api/*` 只允许从 `127.0.0.1`、`::1` 或 `::ffff:127.0.0.1` 访问。如果服务配置为 `HOST=0.0.0.0`，局域网其他机器也会被拒绝访问管理路由。

如果需要从旧的 `WATCH_ACCOUNTS` 或文件列表做一次性导入，可以临时设置：

```text
WATCH_ACCOUNTS_SOURCE=env
WATCH_ACCOUNTS=openai,AnthropicAI
```

或设置 `WATCH_ACCOUNTS_SOURCE=file` 与 `WATCH_ACCOUNTS_FILE_PATH`。启动时这些种子账号会写入或更新数据库中的启用状态，但不会禁用仅通过 Web 页面新增的账号，也不会覆盖已有 `baseline_post_id` / `last_seen_post_id`。导入完成后，建议切回 `WATCH_ACCOUNTS_SOURCE=database`，后续都在 `/admin` 管理账号。

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
- 不在飞书内管理监测账号，账号通过本地 `/admin` 页面维护。
- 当前只支持一个默认飞书 Webhook 投递目标。
- Redis 在当前实现中用于就绪检查和后续队列依赖；本地真实运行需要可连接 Redis。
- 首次接入已有历史帖的账号时，系统会建立基线，避免补发历史消息。
- API 模式真实 X 接入必须确认 `X_API_BASE_URL` 兼容 `/2/users/by/username/:username` 和 `/2/users/:id/tweets`。
