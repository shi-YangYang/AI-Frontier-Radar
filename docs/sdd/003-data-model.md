# AI前沿消息实时监测 - Data Model

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

## 1. 文档目标

定义 V1 的数据实体、表结构、关键约束和状态字段，作为后续 Prisma schema、SQLite 表设计和实施 Agent 编码的依据。

## 2. 设计原则

V1 的数据模型遵循以下原则：

- 只保留支撑 V1 所需的最小状态
- 必须支持首次接入不补发历史消息
- 必须支持幂等去重
- 必须支持失败重试和运行排障
- 尽量保持对未来迁移到 MySQL 友好

## 3. 数据库选型约束

V1 默认数据库为 `SQLite`。

设计要求：

- 不依赖 PostgreSQL 专属字段类型
- 不依赖复杂触发器、存储过程、分区表
- 时间字段统一使用 UTC ISO 字符串或标准时间戳
- JSON 原始数据允许以文本字段保存

## 4. 核心实体

V1 定义 5 个核心实体：

1. `watch_accounts`
2. `x_posts_raw`
3. `delivery_targets`
4. `delivery_events`
5. `poll_runs`

## 5. 表结构

## 5.1 watch_accounts

用途：

- 保存需要监测的 X 账号
- 保存每个账号的轮询状态
- 保存首次接入基线和最近处理位置

建议字段：

- `id`: `TEXT`，主键，建议使用 UUID
- `x_username`: `TEXT`，唯一，非空
- `x_user_id`: `TEXT`，可空
- `display_name`: `TEXT`，可空
- `enabled`: `INTEGER`，非空，默认 `1`
- `baseline_post_id`: `TEXT`，可空
- `last_seen_post_id`: `TEXT`，可空
- `last_polled_at`: `TEXT`，可空
- `last_poll_status`: `TEXT`，可空，取值建议 `success | failed | pending`
- `last_poll_error`: `TEXT`，可空
- `created_at`: `TEXT`，非空
- `updated_at`: `TEXT`，非空

约束：

- `x_username` 唯一
- `enabled` 只能取 `0` 或 `1`

说明：

- `baseline_post_id` 用于首次接入时防止补发历史帖子
- `last_seen_post_id` 表示该账号当前已处理到的最大帖子 ID
- V1 不单独拆 `polling_state` 表，直接并入 `watch_accounts`，降低复杂度

## 5.2 x_posts_raw

用途：

- 保存识别到的新帖原始数据
- 为排障、回放和后续格式升级保留原始材料

建议字段：

- `id`: `TEXT`，主键，建议使用 UUID
- `x_post_id`: `TEXT`，唯一，非空
- `author_username`: `TEXT`，非空
- `author_user_id`: `TEXT`，可空
- `posted_at`: `TEXT`，非空
- `text_content`: `TEXT`，非空
- `permalink_url`: `TEXT`，非空
- `is_reply`: `INTEGER`，非空，默认 `0`
- `is_repost`: `INTEGER`，非空，默认 `0`
- `raw_payload_json`: `TEXT`，非空
- `detected_at`: `TEXT`，非空
- `created_at`: `TEXT`，非空

约束：

- `x_post_id` 唯一
- `is_reply` 和 `is_repost` 只能取 `0` 或 `1`

说明：

- 即使 V1 默认排除回复和转推，也允许保留字段，便于未来扩展和排障

## 5.3 delivery_targets

用途：

- 保存消息投递目标
- V1 虽然默认只有一个飞书 webhook，也建议表结构先建好，避免后续写死

建议字段：

- `id`: `TEXT`，主键，建议使用 UUID
- `target_key`: `TEXT`，唯一，非空
- `channel_type`: `TEXT`，非空，V1 固定为 `feishu_webhook`
- `display_name`: `TEXT`，非空
- `webhook_url`: `TEXT`，非空
- `enabled`: `INTEGER`，非空，默认 `1`
- `created_at`: `TEXT`，非空
- `updated_at`: `TEXT`，非空

约束：

- `target_key` 唯一
- `enabled` 只能取 `0` 或 `1`

说明：

- 如果 V1 最初完全从配置文件读取目标，也建议启动时同步写入这张表

## 5.4 delivery_events

用途：

- 表示某条 X 帖子对某个投递目标的投递任务和状态
- 同时承担幂等记录和失败重试状态记录

建议字段：

- `id`: `TEXT`，主键，建议使用 UUID
- `x_post_id`: `TEXT`，非空
- `target_key`: `TEXT`，非空
- `status`: `TEXT`，非空，取值建议 `pending | sending | sent | retry_wait | failed | dead`
- `attempt_count`: `INTEGER`，非空，默认 `0`
- `next_retry_at`: `TEXT`，可空
- `last_error`: `TEXT`，可空
- `locked_at`: `TEXT`，可空
- `sent_at`: `TEXT`，可空
- `created_at`: `TEXT`，非空
- `updated_at`: `TEXT`，非空

约束：

- 唯一索引：`(x_post_id, target_key)`
- 外键：`x_post_id -> x_posts_raw.x_post_id`
- 外键：`target_key -> delivery_targets.target_key`

说明：

- `delivery_events` 是 V1 的核心幂等表
- 只要 `x_post_id + target_key` 已存在成功记录，就不能再次发送

## 5.5 poll_runs

用途：

- 保存轮询批次级别的运行记录
- 用于观察系统是否稳定

建议字段：

- `id`: `TEXT`，主键，建议使用 UUID
- `started_at`: `TEXT`，非空
- `finished_at`: `TEXT`，可空
- `status`: `TEXT`，非空，取值建议 `running | success | partial_failed | failed`
- `accounts_total`: `INTEGER`，非空，默认 `0`
- `accounts_succeeded`: `INTEGER`，非空，默认 `0`
- `accounts_failed`: `INTEGER`，非空，默认 `0`
- `new_posts_detected`: `INTEGER`，非空，默认 `0`
- `events_created`: `INTEGER`，非空，默认 `0`
- `error_summary`: `TEXT`，可空
- `created_at`: `TEXT`，非空

说明：

- V1 不要求极其细的监控系统，但至少需要这类批次级记录

## 6. 实体关系

- 一个 `watch_account` 可以对应多条 `x_posts_raw`
- 一条 `x_posts_raw` 可以对应多条 `delivery_events`
- 一个 `delivery_target` 可以对应多条 `delivery_events`
- 一个 `poll_run` 覆盖一轮轮询批次

## 7. 关键状态字段定义

## 7.1 watch_accounts.last_seen_post_id

含义：

- 该账号已被系统确认处理过的最大帖子 ID

推进规则：

- 仅当该账号本轮拉取和入库流程成功完成后才推进
- 如果拉取失败或处理异常，不推进

## 7.2 watch_accounts.baseline_post_id

含义：

- 首次接入该账号时记录的基线帖子 ID

规则：

- 首次接入时，将该账号当前最新帖子 ID 设为基线
- 小于等于基线的帖子不进入投递

## 7.3 delivery_events.status

状态定义：

- `pending`：已创建，待发送
- `sending`：已被 worker 领取，正在发送
- `sent`：发送成功
- `retry_wait`：发送失败，等待下次重试
- `failed`：当前尝试失败，已记录错误
- `dead`：超过最大重试次数，不再尝试

V1 建议规则：

- 实际运行中可以简化为 `pending -> sending -> sent`
- 失败时走 `retry_wait`
- 超过重试阈值后进入 `dead`

## 8. 索引建议

V1 至少建立以下索引：

- `watch_accounts(x_username)` 唯一索引
- `watch_accounts(enabled)` 普通索引
- `x_posts_raw(x_post_id)` 唯一索引
- `x_posts_raw(author_username, posted_at)` 组合索引
- `delivery_targets(target_key)` 唯一索引
- `delivery_events(x_post_id, target_key)` 唯一索引
- `delivery_events(status, next_retry_at)` 组合索引
- `poll_runs(started_at)` 普通索引

## 9. 初始化策略

V1 首次初始化建议：

1. 创建默认 `delivery_target`
2. 从配置文件导入 `watch_accounts`
3. 对每个账号首次拉取时补全 `baseline_post_id`
4. 不为基线之前的帖子创建 `delivery_events`

## 10. 数据保留策略

V1 数据保留建议：

- `watch_accounts`：长期保留
- `delivery_targets`：长期保留
- `delivery_events`：长期保留
- `x_posts_raw`：先长期保留，后续如数据增长再引入归档
- `poll_runs`：可按周期清理，但 V1 先保留

## 11. 对实施 Agent 的要求

实施 Agent 在落库时必须遵守：

- 不将幂等逻辑只放在内存中
- 不将轮询状态只放在本地变量中
- 不省略 `baseline_post_id`
- 不绕过 `delivery_events` 直接发送飞书

## 12. 待后续明确项

留待实现或下一份规格细化：

- Prisma schema 的字段命名风格
- 时间字段统一使用字符串还是整数时间戳
- `poll_runs` 是否拆成更细粒度的账号级运行日志
