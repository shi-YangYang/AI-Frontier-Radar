# Batch A Agent Task Prompts

## 1. 使用方式

本文件提供 `A1`、`A2`、`A3` 三个工作包的可直接复制消息。

推荐使用方式：

1. 先让协调 Agent 完成第一轮分发
2. 然后把下面对应工作包的消息直接发给实施 Agent
3. 实施 Agent 回来结果后，再用 `005-agent-ops.md` 里的回收模板交给协调 Agent 审查

## 2. A1 工程骨架

```text
你是实施 Agent，只负责当前分配给你的工作包，不负责改变项目方向。

项目根目录：
F:\AI前沿消息

你必须先阅读这些文档：

- F:\AI前沿消息\constitution\mission.md
- F:\AI前沿消息\constitution\tech-stack.md
- F:\AI前沿消息\docs\sdd\001-product-spec.md
- F:\AI前沿消息\docs\sdd\002-system-design.md
- F:\AI前沿消息\docs\implementation\001-batch-a-foundation.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
A1 工程骨架

你的目标：

- 初始化 TypeScript 项目
- 接入 Fastify
- 规划目录结构
- 提供基本开发脚本
- 给后续 A2、A3、B、C 批次准备稳定的工程骨架

你的允许写入范围：

- F:\AI前沿消息\package.json
- F:\AI前沿消息\tsconfig.json
- F:\AI前沿消息\src\app\*
- F:\AI前沿消息\src\server\*
- F:\AI前沿消息\src\shared\*
- F:\AI前沿消息\src\modules\api\* 仅限目录骨架和空入口
- F:\AI前沿消息\src\modules\polling\* 仅限目录骨架和空入口
- F:\AI前沿消息\src\modules\delivery\* 仅限目录骨架和空入口
- F:\AI前沿消息\src\modules\storage\* 仅限目录骨架和空入口

你应建立但不必填满的建议目录结构：

- src/app
- src/config
- src/lib
- src/modules/api
- src/modules/polling
- src/modules/delivery
- src/modules/storage
- src/server
- src/shared
- prisma

你的完成标准：

- 应用可启动
- Fastify 实例可创建
- 至少存在一个启动入口
- 基础目录结构成型
- 不包含业务逻辑实现

你的非目标：

- 不实现配置解析细节
- 不实现数据库 schema
- 不实现 X 调用
- 不实现飞书发送
- 不实现业务编排

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要自行改变技术路线
- 不要扩 scope
- 不要顺手实现 A2 或 A3 的主要内容
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 3. A2 配置与日志

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
- F:\AI前沿消息\docs\implementation\001-batch-a-foundation.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
A2 配置与日志

你的目标：

- 提供统一配置加载
- 提供环境变量解析
- 提供配置校验
- 提供基础日志能力
- 为后续 polling、delivery、api 提供统一配置入口

你的允许写入范围：

- F:\AI前沿消息\src\config\*
- F:\AI前沿消息\src\lib\logger\*
- F:\AI前沿消息\src\shared\env\*
- F:\AI前沿消息\src\shared\config\*

如必须补充少量接线代码，可最小化修改：

- F:\AI前沿消息\src\app\*
- F:\AI前沿消息\src\server\*

配置至少覆盖：

- SQLite 路径
- Redis 连接
- 飞书 webhook
- 轮询间隔
- 单次抓取数量
- 是否排除回复
- 是否排除转推
- 监测账号配置来源

你的完成标准：

- 启动时能加载并校验配置
- 缺失关键配置时能明确失败
- 敏感配置不直接打印到日志
- 日志有统一入口
- 配置结构不散落在业务模块中

你的非目标：

- 不做配置热更新
- 不做复杂日志平台接入
- 不实现数据库 schema
- 不实现业务编排

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要自行改变技术路线
- 不要扩 scope
- 不要顺手实现 A1 或 A3 的主要内容
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 4. A3 数据模型与 repository

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
- F:\AI前沿消息\docs\implementation\001-batch-a-foundation.md
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
A3 数据模型与 repository

你的目标：

- 按 003-data-model.md 落实 SQLite schema
- 建立 Prisma schema
- 建立最小 repository 层
- 为后续 polling 和 delivery 提供统一的数据访问层

你的允许写入范围：

- F:\AI前沿消息\prisma\schema.prisma
- F:\AI前沿消息\prisma\migrations\*
- F:\AI前沿消息\src\modules\storage\*

如必须补充极少量接线代码，可最小化修改：

- F:\AI前沿消息\src\app\*
- F:\AI前沿消息\src\shared\*

至少实现这些 repository：

- WatchAccountRepository
- XPostRepository
- DeliveryTargetRepository
- DeliveryEventRepository
- PollRunRepository

你必须覆盖这些核心表：

- watch_accounts
- x_posts_raw
- delivery_targets
- delivery_events
- poll_runs

你的完成标准：

- 数据库可初始化
- 唯一约束和索引存在
- 能插入默认 delivery target
- repository 可完成基础 CRUD
- 状态字段包含 baseline_post_id、last_seen_post_id、delivery status 等关键字段

你的非目标：

- 不实现轮询编排
- 不实现飞书发送
- 不实现复杂查询优化
- 不把业务逻辑写进 repository 之外的随机位置

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要自行改变数据库路线
- 不要把状态只放在内存里
- 不要跳过 baseline_post_id
- 不要跳过 delivery_events
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 5. 建议分发顺序

- 先发 A1
- A2 可与 A1 并行
- A3 最好在 A1 基础目录成型后开始

## 6. 回收建议

回收时让协调 Agent 重点检查：

- A1 是否越界实现了业务逻辑
- A2 是否把配置散落到业务模块
- A3 是否严格按 `003-data-model.md` 建模
- 三者是否修改了彼此未授权范围
