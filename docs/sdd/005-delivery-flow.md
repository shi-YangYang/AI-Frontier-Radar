# AI前沿消息实时监测 - Delivery Flow

> 状态：V1 下游设计文档
>
> 上游约束文件：
> - `constitution/mission.md`
> - `constitution/tech-stack.md`
> - `constitution/roadmap.md`
>
> 依赖文档：
> - `001-product-spec.md`
> - `002-system-design.md`
> - `003-data-model.md`
> - `004-api-contract.md`

## 1. 文档目标

定义 V1 从“发现新帖”到“成功推送飞书”的完整投递流程、状态流转、幂等规则和重试策略。

## 2. 流程目标

投递流程必须满足：

- 新帖发现后能异步投递
- 相同帖子不会重复发送到同一目标
- 失败可重试
- 服务重启不会造成历史消息大量补发

## 3. 投递范围

V1 仅支持：

- 渠道：飞书群自定义机器人 webhook
- 格式：简单文本消息
- 目标：默认一个飞书群

V2 再扩展：

- 多投递目标
- 飞书应用机器人
- 卡片消息

## 4. 标准化投递输入

当 `polling-worker` 识别到新帖后，必须先完成两件事：

1. 保存 `x_posts_raw`
2. 创建 `delivery_events`

只有在 `delivery_events` 创建成功后，才允许把任务放入队列。

## 5. 状态机

`delivery_events.status` 的推荐流转：

1. `pending`
2. `sending`
3. `sent`

失败分支：

1. `pending`
2. `sending`
3. `retry_wait`
4. `sending`
5. `sent` 或 `dead`

说明：

- `pending`：已创建但尚未发送
- `sending`：某个 worker 正在处理
- `retry_wait`：失败后等待下次重试
- `sent`：已成功发送
- `dead`：超过最大重试次数，停止重试

## 6. 幂等规则

V1 的幂等核心规则：

- 同一个 `x_post_id + target_key` 只能存在一条有效投递任务
- 如果已存在 `sent` 状态记录，则禁止再次发送
- 队列重复投递、worker 重启、重复扫描都不能突破这个约束

实施要求：

- 幂等判断必须依赖数据库唯一约束
- 不能只依赖内存 Set 或本地缓存

## 7. 创建投递事件流程

当轮询发现新帖时：

1. 检查 `x_posts_raw` 是否已存在该 `x_post_id`
2. 若不存在，则插入原始帖子
3. 为默认 `delivery_target` 创建 `delivery_event`
4. 若因唯一约束冲突创建失败，视为已存在，不重复创建
5. 只有成功创建或确认事件存在后，才允许进入队列

## 8. 领取任务流程

`delivery-worker` 处理任务时：

1. 根据 `eventId` 查询 `delivery_events`
2. 如果状态为 `sent`，直接丢弃任务
3. 如果状态为 `dead`，直接丢弃任务
4. 如果状态为 `pending` 或 `retry_wait`，尝试更新为 `sending`
5. 只有成功领取后才继续发送

设计要求：

- 不允许多个 worker 同时发送同一事件
- 领取动作必须更新数据库状态

## 9. 消息格式

V1 默认发送简单文本消息。

建议格式：

```text
[AI前沿消息]
账号：@openai
时间：2026-04-21 17:00 UTC
内容：这里是帖子正文摘要或截断后的正文
链接：https://x.com/openai/status/123456789
```

格式要求：

- 必须包含账号
- 必须包含原帖链接
- 正文过长时允许截断
- 截断不影响原帖链接展示

## 10. 发送流程

发送时执行：

1. 从数据库读取 `delivery_event`
2. 读取对应 `x_posts_raw`
3. 读取对应 `delivery_target`
4. 生成消息文本
5. 调用飞书 webhook
6. 根据响应结果更新状态

## 11. 成功条件

飞书 webhook 返回成功后：

- 将 `delivery_events.status` 更新为 `sent`
- `attempt_count` 加 1
- 记录 `sent_at`
- 清空 `last_error`

## 12. 失败条件

以下情况视为发送失败：

- HTTP 请求失败
- 请求超时
- 飞书返回错误码
- 消息体生成异常

失败后：

- `attempt_count` 加 1
- 写入 `last_error`
- 根据是否还能重试，更新为 `retry_wait` 或 `dead`

## 13. 重试策略

V1 建议采用简单退避策略：

- 最大重试次数：3 次
- 重试间隔：1 分钟、5 分钟、15 分钟

行为规则：

- 首次失败后进入 `retry_wait`
- 到达 `next_retry_at` 后重新入队
- 超过最大次数后进入 `dead`

说明：

- V1 不需要极复杂的退避算法
- 重点是行为稳定、可解释、可观察

## 14. 重启恢复

服务重启后，需要处理两类状态：

## 14.1 遗留的 sending

如果某事件长时间停留在 `sending`，说明上次 worker 可能异常退出。

V1 建议规则：

- 启动时扫描所有超时 `sending` 任务
- 将其重置为 `retry_wait` 或 `pending`

超时建议：

- `sending` 持续超过 5 分钟视为僵尸任务

## 14.2 遗留的 retry_wait

对于已经到达 `next_retry_at` 的任务：

- 启动时重新补入队列

## 15. 失败可观测性

V1 至少应能回答：

- 某条帖子是否创建了投递事件
- 为什么没有发出去
- 重试了几次
- 最后一次失败是什么

因此 `delivery_events` 中至少要完整保留：

- `status`
- `attempt_count`
- `last_error`
- `next_retry_at`
- `sent_at`

## 16. 投递流程与轮询流程的边界

轮询流程负责：

- 发现新帖
- 保存原始数据
- 创建投递事件
- 推进账号处理位置

投递流程负责：

- 消费事件
- 发送飞书
- 管理重试与最终状态

明确要求：

- 轮询流程不直接调用飞书
- 投递流程不负责判断帖子是不是新帖

## 17. 对实施 Agent 的要求

实施 Agent 必须遵守：

- 不把发送逻辑塞回轮询模块
- 不省略 `delivery_events`
- 不在失败时直接吞错
- 不绕过数据库状态直接以队列消息体为准发送

## 18. 验收用例

至少覆盖以下用例：

1. 新帖第一次出现，能成功发送
2. 同一帖子被再次扫描，不重复发送
3. 飞书第一次发送失败，后续重试成功
4. 飞书持续失败，最终进入 `dead`
5. worker 在 `sending` 阶段崩溃，重启后任务可恢复
