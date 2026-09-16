# X 浏览器数据源外部约束

实测 x.com 当前行为：

- 无头 Chromium 的 `HeadlessChrome` 标识出现在 UA 与 Client Hints（`sec-ch-ua`）中时，x.com 直接返回 403 空响应；只伪造 `navigator.userAgent` 无效，必须同时覆盖 Client Hints。实现通过 CDP `Emulation.setUserAgentOverride`（含 `userAgentMetadata`）在无头模式下自动伪装，因此 `X_BROWSER_HEADLESS=true` 可正常访问。无头/有头可在 `/settings → X 数据源 → 浏览器运行模式` 切换（存 SQLite，优先于 `.env`）。`navigator.webdriver` 仍为 `true`，X 目前未据此拦截；若策略升级，可能需要进一步伪装或退回有头模式。
- x.com 新前端已移除全部 `data-testid` 属性，帖子也没有 `<time datetime>`。解析器基于 `article`、`/status/` 链接与 `[dir="auto"]` 文本块解析；时间从状态链接的本地化日期文本（如 `9月10日`、`3小时前`）近似转换为 ISO，无法识别时回退为抓取时刻。
- 匿名访问只展示部分帖子。需要完整时间线时，在 `/settings → X 数据源 → 打开 X 登录窗口` 登录一次，复用 `.x-browser-public-profile` 持久化 profile。
- 无可用投递目标（飞书 Webhook）时，账号轮询会被标记失败并记录 `No enabled delivery targets are configured.`，配置投递目标后恢复。
