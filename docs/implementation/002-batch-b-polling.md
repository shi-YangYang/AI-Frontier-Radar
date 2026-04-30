# Batch B - 轮询链路

## 1. 批次目标

建立从 X 账号拉取时间线到创建投递事件的完整链路。

本批次完成后，系统应能：

- 轮询指定账号
- 过滤不需要的帖子
- 建立首次接入基线
- 识别新帖
- 创建 `x_posts_raw` 和 `delivery_events`

## 2. 工作包列表

### B1 X Client 与标准化转换

目标：

- 封装 X 时间线请求
- 将响应转换为内部统一结构
- 屏蔽外部接口差异

建议写入范围：

- `src/modules/polling/source/*`
- `src/modules/polling/types/*`
- `src/lib/http/*`

接口要求：

- 暴露 `SourceProvider`
- 输入包含 `xUsername | xUserId | sincePostId | limit`
- 输出为标准化帖子列表

完成标准：

- 能成功拉取指定账号最新帖子
- 能输出统一数据结构
- 失败时返回可诊断错误

非目标：

- 不负责基线推进
- 不负责入库

### B2 轮询编排与状态推进

目标：

- 实现 `PollingOrchestrator`
- 实现批次级 `poll_runs`
- 实现首次接入基线逻辑
- 实现新帖识别和事件创建

建议写入范围：

- `src/modules/polling/orchestrator/*`
- `src/modules/polling/services/*`
- `src/modules/polling/jobs/*`

关键行为：

- 读取启用中的账号
- 为每个账号调用 `SourceProvider`
- 过滤 reply / repost
- 判断哪些帖子是新帖
- 写入 `x_posts_raw`
- 创建 `delivery_events`
- 推进 `last_seen_post_id`

完成标准：

- 首次接入不补发历史消息
- 新帖只创建一次事件
- 某账号轮询失败时不推进处理位置
- 能记录 `poll_runs`

非目标：

- 不实现飞书发送
- 不实现重试调度

## 3. 并行建议

- B1 可先行
- B2 依赖 A3 和 B1

## 4. 交付给实施 Agent 的约束

- 你不止一个人在代码库中工作，不要回滚别人的改动
- 不要绕过 `baseline_post_id`
- 不要把“是不是新帖”的判断塞进 delivery 层
- 不要直接调用飞书 webhook

## 5. 验收清单

- 首次接入账号时，不补发旧帖
- 新帖进入 `x_posts_raw`
- 同一帖多次扫描不重复创建 `delivery_events`
- `last_seen_post_id` 只在成功处理后推进
- 失败账号有清晰错误记录
