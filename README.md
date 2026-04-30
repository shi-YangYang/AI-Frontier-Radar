# AI 前沿消息实时监测

V1 是一个本地/单机优先的准实时监测服务：轮询指定 X 账号的新帖，写入 SQLite 状态表，创建 `delivery_events`，再通过飞书群自定义机器人 webhook 投递。

## 必需环境变量

从 `.env.example` 复制配置，并至少填写：

- `SQLITE_PATH`：SQLite 文件路径，例如 `.data/ai-news-monitor.sqlite`
- `REDIS_URL`：Redis 连接，例如 `redis://127.0.0.1:6379`
- `FEISHU_WEBHOOK_URL`：飞书群自定义机器人 webhook
- `X_SOURCE_MODE`：X 数据源模式，默认建议 `browser`
- `X_BROWSER_USER_DATA_DIR`：浏览器登录态保存目录，例如 `.x-browser-profile`
- `X_BROWSER_HEADLESS`：首次登录建议 `false`
- `WATCH_ACCOUNTS_SOURCE`：账号来源，`.env.example` 使用 `env`
- `WATCH_ACCOUNTS`：启动时同步的监测账号，逗号分隔

可选配置：

- `X_BROWSER_BASE_URL`：默认 `https://x.com`
- `X_BROWSER_NAVIGATION_TIMEOUT_MS`：默认 `30000`
- `X_BROWSER_POST_LOAD_TIMEOUT_MS`：默认 `15000`
- `X_API_BASE_URL` / `X_API_BEARER_TOKEN`：仅 `X_SOURCE_MODE=api` 时需要
- `POLL_INTERVAL_SECONDS`：轮询间隔，默认 `120`
- `FETCH_LIMIT_PER_ACCOUNT`：每个账号单次拉取数量，默认 `10`
- `EXCLUDE_REPLIES`：默认 `true`
- `EXCLUDE_REPOSTS`：默认 `true`
- `HOST` / `PORT` / `LOG_LEVEL`

## 本地启动

```powershell
npm run bootstrap
Copy-Item .env.example .env
# 按需编辑 .env 后，把变量加载到当前 PowerShell
Get-Content .env | Where-Object { $_ -match '^\s*[^#][^=]+=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
}
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

## X 数据源模式

默认推荐使用 browser 模式：

1. 设置 `X_SOURCE_MODE=browser`
2. 设置 `X_BROWSER_HEADLESS=false`
3. 启动服务后等待浏览器弹出，手动登录 X
4. 登录态会保存在 `X_BROWSER_USER_DATA_DIR`
5. 后续运行可把 `X_BROWSER_HEADLESS=true`

browser 模式不会处理验证码，不做 stealth 或反检测，也不会把 cookie、token、profile 内容写入仓库。

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

`/config/summary` 只返回配置摘要，不返回完整 webhook。

## Migration / Generate

Prisma 命令通过 `SQLITE_PATH` 生成 `DATABASE_URL`，不需要手动设置 `DATABASE_URL`：

```powershell
npm run prisma:generate
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

## E2E Smoke

运行：

```powershell
npm run smoke:e2e
```

smoke 使用临时 SQLite、本地 mock X API、本地 mock 飞书 webhook，不访问真实 X 或真实飞书。它会验证：

- browser 模式不需要 `X_API_BEARER_TOKEN`
- api 模式缺少 `X_API_BEARER_TOKEN` 会配置失败
- scheduler 在 browser 模式会创建 browser provider
- seed watch account 写入数据库
- 首次无帖不设置错误基线
- 后续首条新帖写入 `x_posts_raw`
- 新帖创建 `delivery_events`
- delivery worker 发送到 mock webhook
- 成功后 `delivery_events.status = sent`
- `/health` 可用
- `/config/summary` 不泄露 webhook
- `/ready` 在 Redis 不可用时返回 `503 DEPENDENCY_UNREADY`

脚本结束后会关闭 mock 服务并删除临时数据库目录。

## 当前 V1 限制和真实接入注意事项

- 不接 X 实时流，只使用 User Timeline Polling。
- 不在飞书内管理监测账号，账号通过环境变量或数据库种子维护。
- 当前只支持一个默认飞书 webhook 投递目标。
- Redis 在当前实现中用于就绪检查和后续队列依赖；本地真实运行需要可连接 Redis。
- 首次接入已有历史帖的账号时，系统会建立基线，避免补发历史消息。
- API 模式真实 X 接入必须确认 `X_API_BASE_URL` 兼容 `/2/users/by/username/:username` 和 `/2/users/:id/tweets`。
