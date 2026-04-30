# AI前沿消息实时监测 - 技术选型草案

> 状态：下游说明文档
>
> 上游约束文件：
> - `constitution/mission.md`
> - `constitution/tech-stack.md`
> - `constitution/roadmap.md`
>
> 如果本文件与 constitution 冲突，以 constitution 为准。

## 1. 项目目标

构建一个可长期运行的服务，持续监测 X 平台上指定 AI 消息博主的新发帖，并将新消息主动推送到飞书。

当前确认的能力范围：

- 实时或准实时监测指定 X 账号的新帖
- 支持自定义新增、删除、启停监测账号
- 以机器人形式接入飞书
- 后续开发遵循 SDD（Spec-Driven Development）模式

## 2. 核心判断

这个项目的关键不是“工作流编排”，而是“稳定事件采集 + 去重 + 消息投递 + 配置管理”。

所以我不建议把 OpenClaw 或类似自动化工作流平台作为核心监测引擎。它可以作为辅助工具，但不适合作为主链路，原因如下：

- X 监测需要常驻连接、断线重连、去重和重放能力
- 飞书机器人需要稳定的重试、限流和投递状态管理
- 自定义添加监测账号本质上是配置管理，不是一次性自动化任务
- 后续如果要加摘要、分类、聚合、值班告警，服务化架构扩展性更好

结论：核心链路应采用自建后端服务，工作流工具只作为外围辅助能力。

## 3. 推荐技术方案

## 3.1 推荐栈

推荐采用 TypeScript 方案：

- 后端框架：Node.js + Fastify
- 语言：TypeScript
- 数据库：SQLite
- 队列：Redis + BullMQ
- ORM：Prisma
- 部署：海外 VPS / Railway / Render / Fly.io

推荐这套的原因：

- X 官方当前提供 TypeScript SDK，且明确支持流式能力与自动重连
- 这个项目天然包含长连接、异步任务、重试与后台 worker，Node 在这类 I/O 场景很合适
- TypeScript 对接口建模、事件载荷、飞书卡片结构约束更友好
- Prisma + SQLite 适合先快速完成 V1 的状态持久化和幂等建模

## 3.2 为什么不是 Python

Python 也能做，且 X 官方同样提供 Python SDK。

但在这个项目里，我更倾向 TypeScript，主要原因是：

- 常驻流式连接 + Web 服务 + 异步任务统一在 Node 中更顺手
- 飞书消息卡片和 webhook 载荷本质是 JSON-heavy，TypeScript 类型约束更舒服
- 后续如果补管理后台，前后端统一 TypeScript 成本更低

如果你更熟 Python，我们也可以切到：

- FastAPI + SQLAlchemy / SQLModel
- SQLite
- Redis + Celery / ARQ

但当前默认推荐 TypeScript。

## 4. X 监测方案选型

说明：

- 本章包含长期方案比较
- 其中 `Filtered Stream` 属于备选或未来升级方向
- 当前 V1 冻结路线仍以 `User Timeline Polling` 为准

## 4.1 备选：Filtered Stream

首选使用 X 官方 Filtered Stream。

原因：

- 官方文档显示该能力支持 near real-time 投递
- 官方文档给出的 P99 延迟约为 6-7 秒
- 可以通过规则直接监听 `from:username`
- 支持持久化规则，适合动态增删监测账号

适合场景：

- 你希望尽可能接近实时
- 可接受接入 X 官方开发者平台并购买对应额度
- 监测账号数量会持续增长

## 4.2 备选：User Timeline Polling

如果你暂时不想接入流式能力，或者想先低成本做 MVP，可以使用用户时间线轮询：

- 周期调用 `GET /2/users/:id/tweets`
- 为每个账号维护 `since_id`
- 发现新帖后入库并推送飞书

优点：

- 实现简单
- 非常适合先做 MVP
- 账号数量在几十到上百时依然可控

缺点：

- 不是严格实时
- 轮询间隔越短，成本和复杂度越高
- 需要自己处理调度、并发和限流

## 4.3 我的建议

架构上要从第一天就抽象出 `SourceProvider` 接口，但第一阶段实现建议分两种策略：

- 如果你已经准备使用 X 官方付费 API：直接上 Filtered Stream
- 如果你想先快速验证产品价值：先上 Timeline Polling，再保留升级到 Stream 的接口层

也就是说，代码层做“可切换数据源”，而不是一开始把实现写死。

## 5. 飞书接入方案选型

说明：

- 本章包含 V1 和 V2 的形态比较
- 当前 V1 冻结路线仍以 `群自定义机器人 webhook` 为准

## 5.1 不建议只用群自定义机器人作为最终形态

飞书群自定义机器人适合“单向通知”，适合最轻量的 MVP 推送。

但如果你的需求包含以下任意一项，它就不应该是最终形态：

- 在飞书里动态添加/删除监测账号
- 通过卡片按钮做交互
- 后续扩展多群、多用户、多租户
- 需要更完整的权限和消息管理

## 5.2 V2 推荐：飞书自建应用机器人

推荐做成飞书应用机器人，原因：

- 能走正式的服务端消息发送 API
- 适合做卡片消息
- 适合做事件订阅和交互回调
- 后续可以把“新增监测博主”“暂停监测”“查看最近推送”都放进飞书交互里

## 5.3 MVP 折中方案

最务实的落地方式：

- V1：先接飞书群自定义机器人 webhook，只做消息推送
- V2：升级为飞书自建应用机器人，补齐交互式配置管理

如果你一开始就明确希望“在飞书里直接管理监测账号”，那就不要走自定义机器人，直接上应用机器人。

## 6. 系统架构建议

推荐拆成 4 个模块：

### 6.1 monitor-api

职责：

- 提供内部管理 API
- 负责本地配置查看或管理
- 提供健康检查
- 为后续本地 Web 管理页预留接口

### 6.2 source-worker

职责：

- 执行轮询任务
- 识别新帖并生成标准化事件
- 做基础去重

### 6.3 delivery-worker

职责：

- 将标准化事件投递到飞书
- 处理重试、失败回退、幂等控制

### 6.4 database

建议至少包含这些表：

- `watch_accounts`
- `x_posts_raw`
- `post_events`
- `delivery_records`
- `feishu_targets`
- `rule_sync_logs`

## 7. 关键设计原则

## 7.1 幂等优先

X 断线重连、轮询重扫、飞书重试，都可能导致重复消息。

所以必须基于 `post_id + target_id` 做幂等。

## 7.2 原始数据保留

不要只保留“最终发送给飞书的文本”，要保留原始 X 帖子结构化数据。

这样后续才能支持：

- 摘要
- 分类
- 翻译
- 热度阈值过滤
- 历史检索

## 7.3 监测与投递解耦

监测到新帖后先入库，再异步投递飞书，不要在同一事务里直接强耦合发送。

否则任一外部接口抖动都会拖垮主链路。

## 7.4 数据源可替换

从设计上就要允许：

- Filtered Stream
- Timeline Polling
- 第三方数据源

这能显著降低后续切换成本。

## 8. 第一阶段范围（建议）

建议先把 V1 压到最小：

- 管理一组 X 账号
- 监测这些账号的新帖
- 去重入库
- 推送到一个飞书目标群
- 支持最基本的启停和新增删除
- 记录失败日志

暂时不要在 V1 里做：

- LLM 摘要
- 情绪分析
- 自动分类
- 多租户
- Web 后台
- 复杂权限体系

这些都适合 V2。

## 9. SDD 开发建议

建议后续按下面的文档序列推进：

1. `001-product-spec.md`
2. `002-system-design.md`
3. `003-data-model.md`
4. `004-api-contract.md`
5. `005-delivery-flow.md`
6. `006-milestones.md`

执行原则：

- 先定规格，再写代码
- 每份规格都必须明确边界、不做什么、异常路径
- 代码实现必须能回溯到对应 spec
- 大功能先出 sequence 和 state 变化，再落库和写 handler

## 10. 当前推荐结论

当前我给出的默认结论是：

- 核心架构：自建后端服务，不以 OpenClaw 为主链路
- 语言：TypeScript
- 后端：Fastify
- 数据库：SQLite
- 队列：Redis + BullMQ
- X 接入：V1 采用 Timeline Polling
- 飞书接入：V1 使用自定义机器人 webhook，V2 再考虑应用机器人
- 部署区域：建议香港 / 新加坡 / 东京，避免对 X 连通性造成影响

## 11. 待确认决策

下面两个决策会直接影响实现路线：

1. 你是否接受使用 X 官方付费 API / credits
2. 你是否希望“在飞书里直接完成监测账号管理”

如果第 1 个答案是“否”，我们会优先走 Timeline Polling 架构。

如果第 2 个答案是“是”，我们会直接按飞书应用机器人设计，而不是先走群 webhook。

## 11.1 已确认决策

截至 2026-04-21，当前项目已确认：

- 不接受使用 X 官方付费 API / credits
- V1 不在飞书内管理监测账号
- V1 的监测账号先通过脚本写死，或通过本地 Web 应用管理
- V2 再升级为飞书内直接管理

因此当前冻结的 V1 技术路线为：

- X 接入：`User Timeline Polling`
- 飞书接入：优先 `群自定义机器人 webhook`
- 数据库：`SQLite`
- 配置管理：本地配置文件或本地管理页面
- 实时性目标：准实时，而非严格实时

这意味着 V1 的重点是：

- 低成本验证监测链路是否稳定
- 验证监测账号集合和推送内容是否有业务价值
- 为 V2 的飞书交互式管理保留升级空间

## 12. 参考资料

- X Filtered Stream: https://docs.x.com/x-api/posts/filtered-stream/introduction
- X Timelines: https://docs.x.com/x-api/posts/timelines/introduction
- X Rate Limits: https://docs.x.com/x-api/fundamentals/rate-limits
- X API Overview: https://docs.x.com/x-api/overview
- X Official SDKs: https://docs.x.com/x-api/tools-and-libraries/sdks
- Feishu Open Platform Documentation: https://open.feishu.cn/document/home/index
- Feishu Custom Bot Guide: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
- Feishu Send Message API: https://open.feishu.cn/document/server-docs/im-v1/message/create
