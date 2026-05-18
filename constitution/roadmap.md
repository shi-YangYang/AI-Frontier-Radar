# Roadmap

## 目标

本文件定义项目按阶段推进的顺序，确保开发遵循 Spec-Driven Development，而不是边写边改。

## 阶段 0：Constitution

先冻结项目的上位约束：

- `mission.md`
- `tech-stack.md`
- `roadmap.md`

只有在这些上位文档明确后，才进入具体规格和实现。

## 阶段 1：Specs

在 constitution 基础上编写具体规格文档。

当前建议顺序：

1. `001-product-spec.md`
2. `002-system-design.md`
3. `003-data-model.md`
4. `004-api-contract.md`
5. `005-delivery-flow.md`
6. `006-milestones.md`

规则：

- 规格必须明确做什么
- 必须明确不做什么
- 必须包含异常路径
- 必须能映射到实现与验收

## 阶段 2：Implementation

只有在关键 specs 完成后才进入代码实现。

第一批建议实现内容：

- 项目基础骨架
- 配置加载
- 数据库 schema
- 轮询 worker
- 去重逻辑
- 飞书投递能力
- 基础日志

## 阶段 3：Verification

实现后必须验证：

- 首次接入不补发历史消息
- 轮询能够发现新帖
- 同一帖子不会重复推送
- 飞书发送失败时可重试
- 服务重启后状态不丢失

## V1 路线图

### V1.0

目标：

- 通过配置文件维护监测账号
- 轮询 X User Timeline
- 发现新帖后推送到一个飞书群
- 实现去重和基本失败日志
- 使用 SQLite 做本地状态持久化

### V1.1

目标：

- 补本地 Web 管理页
- 优化推送格式
- 增强日志和可观测性

### V1.2

目标：

- 增加更细的轮询与过滤配置
- 增加失败告警
- 提高运行稳定性
- 为迁移到 MySQL 做准备

## V2 路线图

V2 再考虑进入：

- 飞书应用机器人
- 飞书内直接管理监测账号
- 更丰富的交互卡片
- 消息摘要与分类
- 更完善的后台管理能力
- 数据库从 SQLite 升级到 MySQL（如有必要）

## V2 执行规范

V2 起不再继续使用 V1 的 ad-hoc batch 文档作为主流程。

V2 每个功能必须进入统一 harness：

- 流程入口：`docs/harness/README.md`
- 规格目录：`docs/specs/<feature-id>/`
- 模板目录：`docs/harness/templates/`

V2 功能必须至少具备以下文档后才能分发给实施 Agent：

1. `00-intake.md`
2. `01-spec.md`
3. `02-design.md`
4. `03-implementation-plan.md`
5. `tasks/T*.md`

协调 Agent 必须先维护这些文档，再组织实施。实施 Agent 不允许绕过 harness 直接改代码。

## 工作原则

- 先 constitution，后 spec
- 先 spec，后 implementation
- 先 implementation，后 verification
- 新需求先更新文档，再改代码

## Agent 协作模型

本项目采用“协调 Agent + 实施 Agent”模式推进。

### 协调 Agent 职责

协调 Agent 负责：

- 澄清需求
- 维护 constitution
- 编写和更新 specs
- 做技术和架构决策
- 将实现工作拆分为明确工作包
- 审核实施结果
- 控制里程碑推进和验收标准

协调 Agent 默认不直接承担大块代码实现。

### 实施 Agent 职责

实施 Agent 负责：

- 按既定 spec 实现代码
- 在限定范围内完成局部设计细化
- 自检实现结果
- 提交实现说明、风险和待协调问题

### 协作规则

- 实施 Agent 不应绕过 constitution 和 specs 自行改变方向
- 任何超出 spec 边界的变更都需要先由协调 Agent 决策
- 代码实现前应有足够明确的规格
- 验收和下一轮任务拆分由协调 Agent 统一完成
