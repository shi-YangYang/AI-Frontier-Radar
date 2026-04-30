# AI前沿消息实时监测 - Task Board

## 1. 文档目标

将 `006-milestones.md` 进一步拆为可直接分发给实施 Agent 的工作批次与工作包。

本文件由协调 Agent 使用，用于：

- 分发任务
- 跟踪依赖关系
- 控制并行边界
- 做阶段性验收

## 2. 当前阶段目标

当前目标是完成 V1 的第一轮可运行版本，满足：

- 轮询指定 X 账号
- 识别新帖
- 去重入库
- 推送飞书
- 本地观察运行状态

## 3. 批次划分

当前建议拆为 3 个实施批次：

1. Batch A：基础骨架与数据层
2. Batch B：轮询链路
3. Batch C：投递链路与 API

## 4. 批次依赖

- Batch A 是所有后续批次的前置依赖
- Batch B 依赖 Batch A
- Batch C 依赖 Batch A
- Batch C 的 delivery 部分依赖 Batch B 提供真实事件输入

## 5. 批次状态

### Batch A

- 状态：ready
- 文档：[001-batch-a-foundation.md](</F:/AI前沿消息/docs/implementation/001-batch-a-foundation.md>)

### Batch B

- 状态：ready
- 文档：[002-batch-b-polling.md](</F:/AI前沿消息/docs/implementation/002-batch-b-polling.md>)

### Batch C

- 状态：ready
- 文档：[003-batch-c-delivery-api.md](</F:/AI前沿消息/docs/implementation/003-batch-c-delivery-api.md>)

## 6. 分发原则

- 同一批次内，优先把写入范围互不重叠的工作包并行分发
- 实施 Agent 不应修改未分配给自己的模块
- 如果发现 spec 缺口，先回传协调 Agent，不自行扩 scope
- 每个工作包完成后，必须附带最小验证说明

## 7. 当前推荐分发顺序

### 第 1 轮

- A1：工程骨架
- A2：配置与日志
- A3：数据库与 repository

### 第 2 轮

- B1：X client 与标准化转换
- B2：轮询编排与状态推进

### 第 3 轮

- C1：飞书 webhook client 与消息格式化
- C2：delivery worker 与 retry
- C3：必做 API

## 8. 协调 Agent 检查点

每轮完成后，协调 Agent 必须检查：

- 是否违背 `constitution`
- 是否违背 `001` 到 `006` 的 specs
- 是否出现跨包写入冲突
- 是否有未声明的新增依赖
- 是否补充了最小验证结果

## 9. 对实施 Agent 的统一交付要求

每个工作包交付时必须包含：

- 修改的文件路径
- 完成的行为说明
- 未完成项
- 风险与假设
- 验证方式

## 10. 相关上游文档

- [mission.md](</F:/AI前沿消息/constitution/mission.md>)
- [tech-stack.md](</F:/AI前沿消息/constitution/tech-stack.md>)
- [roadmap.md](</F:/AI前沿消息/constitution/roadmap.md>)
- [001-product-spec.md](</F:/AI前沿消息/docs/sdd/001-product-spec.md>)
- [002-system-design.md](</F:/AI前沿消息/docs/sdd/002-system-design.md>)
- [003-data-model.md](</F:/AI前沿消息/docs/sdd/003-data-model.md>)
- [004-api-contract.md](</F:/AI前沿消息/docs/sdd/004-api-contract.md>)
- [005-delivery-flow.md](</F:/AI前沿消息/docs/sdd/005-delivery-flow.md>)
- [006-milestones.md](</F:/AI前沿消息/docs/sdd/006-milestones.md>)
