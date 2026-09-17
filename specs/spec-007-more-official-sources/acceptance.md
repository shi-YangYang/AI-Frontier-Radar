# Acceptance

## Result

PASS

## Spec Coverage

- 4 个新源类型全链路打通：`ai2_blog`、`moonshot_blog`（服务端 HTML 解析）、`meta_ai_blog`、`xai_news`（无头浏览器渲染）；类型层、provider 注册表、调度工厂、API 校验、管理台类型选项与徽标、「AI 消息」组合均已接入。
- 「AI 消息」组合新增 3 个 RSS 源：Mistral（`mistral.ai/news/rss`）、Stability AI（Squarespace `?format=rss`）、Hugging Face Blog（`huggingface.co/blog/feed.xml`）。
- 全部新类型 `firstRunBaseline='all'`：首次全量入库不投递；「清空消息」的游标重置范围已覆盖所有基线型来源（含补上此前的 `anthropic_news`）。
- 错误码沿用：页面无法渲染/无内容 → `SOURCE_RESPONSE_INVALID`；网络/浏览器失败 → `SOURCE_REQUEST_FAILED`；404/410 → `SOURCE_ACCOUNT_NOT_FOUND`。
- 桌面与移动端新增类型均为"无需输入"提示；README 源矩阵、组合说明、roadmap 已同步。

## Tests

- `backend:typecheck`、`admin:typecheck` 通过；`smoke:e2e` 58 项全绿（新增 5 项：AI2 解析与端到端基线/增量投递、Moonshot 解析、Meta 归一化去重、xAI 精选卡+列表卡解析、调度工厂新增 provider 断言）。
- 实机 8 个源全部添加/校验成功并完成轮询（22 秒）：xAI 79 条、Moonshot 26 条、Anthropic 11 条、AI2 9 条、Meta 8 条；Mistral / Stability / HF Blog 各 1 条（既有 RSS 首轮仅基线最新条目的语义）。总计 136 条，feed.json / feed.xml 输出正常。
- 抽样核对 xAI 标题、摘要、链接与日期正确，无过短异常条目。

## Issues

验收中发现并修复：

1. xAI 首次轮询被 Cloudflare 拦截（"Sorry, you have been blocked"）：应用使用的持久化浏览器 profile 被标记，而全新 profile 正常。改为浏览器源每次启动全新上下文（非持久化 profile，公开站点无需登录态），并将"等待内容选择器出现"作为渲染完成信号；二次实机轮询 79 条成功。

## Regression Risks

低：新增 provider 与共享 `browser-session` 模块均未改动现有 X 源实现；调度工厂、校验分支为增量扩展。

## Required Rework

无。
