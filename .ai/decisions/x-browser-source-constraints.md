# X 浏览器数据源外部约束

实测 x.com 当前行为：

- headless Chromium 访问 x.com 直接返回 403，伪造普通 UA 无效。browser 模式必须在有图形环境下有头运行；`/settings → X 数据源` 的匿名抓取测试与登录态检查同样跟随配置使用有头模式。
- x.com 新前端已移除全部 `data-testid` 属性，帖子也没有 `<time datetime>`。解析器基于 `article`、`/status/` 链接与 `[dir="auto"]` 文本块解析；时间从状态链接的本地化日期文本（如 `9月10日`、`3小时前`）近似转换为 ISO，无法识别时回退为抓取时刻。
- 匿名访问只展示部分帖子。需要完整时间线时，在 `/settings → X 数据源 → 打开 X 登录窗口` 登录一次，复用 `.x-browser-public-profile` 持久化 profile。

本地 `.env` 已设置 `X_BROWSER_HEADLESS=false`；代码默认值仍为 `true`（适用于无图形环境，但当前会被 X 拦截）。
