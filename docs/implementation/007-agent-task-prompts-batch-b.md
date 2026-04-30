# Batch B Agent Task Prompts

## 1. 使用方式

本文件提供 `B1`、`B2` 两个工作包的可直接复制消息。

推荐使用方式：

1. 先发 `B1`
2. `B1` 通过后，再发 `B2`
3. 每次实施 Agent 回传结果后，由协调 Agent 按 `004-review-gates.md` 审查

## 2. B1 X Client 与标准化转换

```text
你是实施 Agent，只负责当前分配给你的工作包，不负责改变项目方向。

项目根目录：
F:\AI前沿消息

你必须先阅读这些文档：

- F:\AI前沿消息\constitution\mission.md
- F:\AI前沿消息\constitution\tech-stack.md
- F:\AI前沿消息\docs\sdd\001-product-spec.md
- F:\AI前沿消息\docs\sdd\002-system-design.md
- F:\AI前沿消息\docs\sdd\006-milestones.md
- F:\AI前沿消息\docs\implementation\002-batch-b-polling.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
B1 X Client 与标准化转换

你的目标：

- 封装 X 时间线请求
- 将响应转换为内部统一结构
- 暴露 SourceProvider
- 为后续 B2 的轮询编排提供稳定输入

你的允许写入范围：

- F:\AI前沿消息\src\modules\polling\source\*
- F:\AI前沿消息\src\modules\polling\types\*
- F:\AI前沿消息\src\modules\polling\index.ts
- F:\AI前沿消息\src\lib\http\*

如必须补充少量共享类型或最小接线代码，可最小化修改：

- F:\AI前沿消息\src\shared\*

接口要求：

- 暴露 `SourceProvider`
- 输入至少包含：
  - `xUsername | xUserId`
  - `sincePostId`
  - `limit`
- 输出为标准化帖子列表
- 失败时返回可诊断错误

你的完成标准：

- 能拉取指定账号最新帖子
- 能输出统一的数据结构
- 外部接口细节不会泄露到后续编排层
- 不涉及数据库写入

你的非目标：

- 不实现首次接入基线
- 不实现轮询状态推进
- 不实现 `x_posts_raw` 入库
- 不创建 `delivery_events`
- 不调用飞书 webhook

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要自行改变抓取策略
- 不要扩 scope
- 不要顺手实现 B2 的主要内容
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 3. B2 轮询编排与状态推进

```text
你是实施 Agent，只负责当前分配给你的工作包，不负责改变项目方向。

项目根目录：
F:\AI前沿消息

你必须先阅读这些文档：

- F:\AI前沿消息\constitution\mission.md
- F:\AI前沿消息\constitution\tech-stack.md
- F:\AI前沿消息\docs\sdd\001-product-spec.md
- F:\AI前沿消息\docs\sdd\002-system-design.md
- F:\AI前沿消息\docs\sdd\003-data-model.md
- F:\AI前沿消息\docs\sdd\005-delivery-flow.md
- F:\AI前沿消息\docs\implementation\002-batch-b-polling.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
B2 轮询编排与状态推进

你的目标：

- 实现 PollingOrchestrator
- 读取启用中的监测账号
- 调用 SourceProvider 拉取帖子
- 处理首次接入基线
- 识别新帖
- 写入 `x_posts_raw`
- 创建 `delivery_events`
- 推进 `last_seen_post_id`
- 记录 `poll_runs`

你的允许写入范围：

- F:\AI前沿消息\src\modules\polling\orchestrator\*
- F:\AI前沿消息\src\modules\polling\services\*
- F:\AI前沿消息\src\modules\polling\jobs\*
- F:\AI前沿消息\src\modules\polling\index.ts

如必须做最小接线，可最小化修改：

- F:\AI前沿消息\src\modules\storage\*
- F:\AI前沿消息\src\modules\polling\types\*

你必须实现的关键行为：

- 只读取启用中的账号
- 默认过滤 reply / repost
- 首次接入时建立基线，不补发历史消息
- 同一帖子不重复创建 `delivery_events`
- 账号轮询失败时不推进 `last_seen_post_id`

你的完成标准：

- 首次接入账号时，不补发旧帖
- 新帖进入 `x_posts_raw`
- 同一帖多次扫描不重复创建 `delivery_events`
- `last_seen_post_id` 只在成功处理后推进
- `poll_runs` 能记录一轮轮询结果

你的非目标：

- 不实现飞书发送
- 不实现 delivery retry
- 不实现前端或管理页面

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要绕过 `baseline_post_id`
- 不要把“是不是新帖”的判断塞进 delivery 层
- 不要直接调用飞书 webhook
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 4. 建议分发顺序

- 先发 `B1`
- `B1` 通过后再发 `B2`

## 5. 回收建议

回收时让协调 Agent 重点检查：

- B1 是否把外部 X 响应转换成稳定内部结构
- B1 是否越界做了入库或业务编排
- B2 是否严格使用 `baseline_post_id`
- B2 是否避免重复创建 `delivery_events`
- B2 是否只在成功处理后推进 `last_seen_post_id`
