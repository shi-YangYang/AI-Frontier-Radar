# Batch C Agent Task Prompts

## 1. 使用方式

本文件提供 `C1`、`C2`、`C3` 三个工作包的可直接复制消息。

推荐使用方式：

1. 先发 `C1`
2. `C1` 通过后，再发 `C2`
3. `C3` 可在 `C1` 通过后并行发出，也可以等 `C2` 后再发
4. 每次实施 Agent 回传结果后，由协调 Agent 按 `004-review-gates.md` 审查

## 2. C1 飞书 webhook client 与消息格式化

```text
你是实施 Agent，只负责当前分配给你的工作包，不负责改变项目方向。

项目根目录：
F:\AI前沿消息

你必须先阅读这些文档：

- F:\AI前沿消息\constitution\mission.md
- F:\AI前沿消息\constitution\tech-stack.md
- F:\AI前沿消息\docs\sdd\001-product-spec.md
- F:\AI前沿消息\docs\sdd\002-system-design.md
- F:\AI前沿消息\docs\sdd\004-api-contract.md
- F:\AI前沿消息\docs\sdd\005-delivery-flow.md
- F:\AI前沿消息\docs\implementation\003-batch-c-delivery-api.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
C1 飞书 webhook client 与消息格式化

你的目标：

- 封装飞书 webhook 调用
- 实现 V1 文本消息格式化
- 为后续 C2 delivery worker 提供稳定发送能力

你的允许写入范围：

- F:\AI前沿消息\src\modules\delivery\channel\*
- F:\AI前沿消息\src\modules\delivery\formatter\*
- F:\AI前沿消息\src\modules\delivery\index.ts
- F:\AI前沿消息\src\lib\http\*

如必须补充少量共享类型或最小接线代码，可最小化修改：

- F:\AI前沿消息\src\shared\*

你必须实现的内容：

- webhook client
- 文本消息格式化器
- 发送成功 / 失败的结构化结果
- 错误响应的可诊断信息

消息格式至少包含：

- 发帖账号
- 发帖时间
- 帖子正文
- 原帖链接

你的完成标准：

- 能根据标准化帖子生成符合 spec 的文本消息
- 能成功调用飞书 webhook
- webhook 错误能返回结构化诊断信息
- 不涉及队列消费编排

你的非目标：

- 不实现 delivery worker
- 不实现 retry
- 不修改 delivery_events 状态机
- 不实现 API

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要扩 scope
- 不要把发送逻辑塞进 polling 模块
- 不要顺手实现 C2 或 C3 的主要内容
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 3. C2 delivery worker 与 retry

```text
你是实施 Agent，只负责当前分配给你的工作包，不负责改变项目方向。

项目根目录：
F:\AI前沿消息

你必须先阅读这些文档：

- F:\AI前沿消息\constitution\mission.md
- F:\AI前沿消息\constitution\tech-stack.md
- F:\AI前沿消息\docs\sdd\002-system-design.md
- F:\AI前沿消息\docs\sdd\003-data-model.md
- F:\AI前沿消息\docs\sdd\005-delivery-flow.md
- F:\AI前沿消息\docs\implementation\003-batch-c-delivery-api.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
C2 delivery worker 与 retry

你的目标：

- 实现事件领取
- 实现发送状态流转
- 实现 retry 和 dead letter
- 实现启动时的遗留任务恢复

你的允许写入范围：

- F:\AI前沿消息\src\modules\delivery\worker\*
- F:\AI前沿消息\src\modules\delivery\services\*
- F:\AI前沿消息\src\modules\delivery\jobs\*
- F:\AI前沿消息\src\modules\delivery\index.ts

如必须做最小接线，可最小化修改：

- F:\AI前沿消息\src\modules\storage\*
- F:\AI前沿消息\src\modules\delivery\formatter\*
- F:\AI前沿消息\src\modules\delivery\channel\*

你必须实现的关键行为：

- 领取 `pending` / `retry_wait` 事件
- 进入 `sending`
- 成功后更新为 `sent`
- 失败后进入 `retry_wait` 或 `dead`
- 重试策略为 `1 / 5 / 15` 分钟
- 超过 3 次后进入 `dead`
- 启动时修复超时 `sending`

你的完成标准：

- 已发送消息不会重复发送
- retry 行为符合 spec
- `delivery_events` 状态更新完整
- fresh 启动后可恢复遗留任务

你的非目标：

- 不负责判断帖子是不是新帖
- 不实现飞书卡片消息
- 不实现 API

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要绕过 `delivery_events`
- 不要把发送逻辑塞回 polling 模块
- 不要扩 scope
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 4. C3 必做 API

```text
你是实施 Agent，只负责当前分配给你的工作包，不负责改变项目方向。

项目根目录：
F:\AI前沿消息

你必须先阅读这些文档：

- F:\AI前沿消息\constitution\mission.md
- F:\AI前沿消息\constitution\tech-stack.md
- F:\AI前沿消息\docs\sdd\002-system-design.md
- F:\AI前沿消息\docs\sdd\004-api-contract.md
- F:\AI前沿消息\docs\implementation\003-batch-c-delivery-api.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
C3 必做 API

你的目标：

- 实现 V1 必做 API
- 返回结构与 `004-api-contract.md` 保持一致
- 提供最小运行状态观察能力

你的允许写入范围：

- F:\AI前沿消息\src\modules\api\routes\*
- F:\AI前沿消息\src\modules\api\controllers\*
- F:\AI前沿消息\src\modules\api\schemas\*
- F:\AI前沿消息\src\modules\api\index.ts

如必须做最小接线，可最小化修改：

- F:\AI前沿消息\src\app\*
- F:\AI前沿消息\src\server\*

你必须实现的接口：

- `GET /health`
- `GET /ready`
- `GET /config/summary`

你的完成标准：

- 返回结构与 spec 一致
- 不泄露完整 webhook URL
- `/ready` 反映真实依赖状态
- `/config/summary` 返回脱敏摘要

你的非目标：

- 不强制实现完整账号管理接口
- 不实现本地 Web 管理页
- 不实现前端

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要扩 scope
- 不要依赖进程内临时状态而忽略数据库真实状态
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 5. 建议分发顺序

- 先发 `C1`
- `C1` 通过后再发 `C2`
- `C3` 可在 `C1` 通过后并行发出

## 6. 回收建议

回收时让协调 Agent 重点检查：

- C1 是否正确封装飞书发送与文本格式化
- C1 是否没有越界做 worker 编排
- C2 是否严格依赖 `delivery_events` 做幂等
- C2 是否满足 `1 / 5 / 15` 分钟重试策略
- C2 是否能恢复超时 `sending`
- C3 是否返回了符合 spec 的结构
- C3 是否没有泄露 webhook
