# Batch C - 投递链路与 API

## 1. 批次目标

建立从投递事件到飞书消息发送的完整链路，并补齐最小可观察 API。

本批次完成后，系统应能：

- 消费 `delivery_events`
- 按格式发送飞书消息
- 处理重试与死信
- 提供最小运行状态接口

## 2. 工作包列表

### C1 飞书 webhook client 与消息格式化

目标：

- 封装飞书 webhook 调用
- 实现 V1 文本消息格式化

建议写入范围：

- `src/modules/delivery/channel/*`
- `src/modules/delivery/formatter/*`
- `src/lib/http/*`

完成标准：

- 能根据帖子生成符合 spec 的文本消息
- 能成功调用飞书 webhook
- 对错误响应能给出结构化错误

非目标：

- 不实现队列消费编排

### C2 delivery worker 与 retry

目标：

- 实现事件领取
- 实现发送状态流转
- 实现重试和死信
- 实现重启恢复

建议写入范围：

- `src/modules/delivery/worker/*`
- `src/modules/delivery/services/*`
- `src/modules/delivery/jobs/*`

关键行为：

- 领取 `pending` / `retry_wait`
- 更新为 `sending`
- 发送成功后更新为 `sent`
- 失败后进入 `retry_wait` 或 `dead`
- 启动时修复僵尸 `sending`

完成标准：

- 重复任务不重复发送
- 失败任务按 1/5/15 分钟退避
- 超过 3 次后进入 `dead`
- 重启后可恢复遗留任务

非目标：

- 不负责判断帖子是不是新帖

### C3 必做 API

目标：

- 实现 `004-api-contract.md` 中的必做接口

建议写入范围：

- `src/modules/api/routes/*`
- `src/modules/api/controllers/*`
- `src/modules/api/schemas/*`

必做接口：

- `GET /health`
- `GET /ready`
- `GET /config/summary`

完成标准：

- API 返回结构与 spec 一致
- 不泄露完整 webhook URL
- `ready` 能真实反映数据库、Redis、配置状态

非目标：

- V1.0 不强制实现完整账号管理接口

## 3. 并行建议

- C1 与 C3 可先并行
- C2 依赖 C1，也依赖 B2 提供真实事件流

## 4. 交付给实施 Agent 的约束

- 你不止一个人在代码库中工作，不要回滚别人的改动
- 不要把发送逻辑塞进 polling 模块
- 不要绕过 `delivery_events` 直接发飞书
- 不要让 API 依赖进程内临时状态而忽略数据库真实状态

## 5. 验收清单

- 能从 `delivery_events` 发送到飞书
- 已发送消息不会重复发送
- 失败任务可重试并最终进入 `sent` 或 `dead`
- `/health`、`/ready`、`/config/summary` 可用
- 敏感配置不会被 API 返回
