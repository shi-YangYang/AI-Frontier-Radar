# Agent Ops

## 1. 文档目标

本文件用于指导你如何驱动“协调 Agent”去组织实施工作。

你不需要自己重新解释项目背景，也不需要临场重新拆任务。直接把本文件里的模板发给协调 Agent 即可。

## 2. 你和协调 Agent 的关系

你的角色：

- 产品和方向拍板者
- 最终验收人

协调 Agent 的角色：

- 阅读现有 constitution、specs、implementation 文档
- 按批次拆给实施 Agent
- 回收实施结果
- 做 review 和下一轮分发建议

实施 Agent 的角色：

- 只负责代码实现
- 不自行改方向
- 不突破 spec 边界

## 3. 先发给协调 Agent 的总控消息

下面这段可以直接复制给协调 Agent：

```text
你现在是这个项目的协调 Agent，只负责任务编排、分发、回收、审查，不负责亲自实现大块代码。

项目根目录：
F:\AI前沿消息

你必须先完整阅读以下文档，再开始组织实施：

1. F:\AI前沿消息\constitution\mission.md
2. F:\AI前沿消息\constitution\tech-stack.md
3. F:\AI前沿消息\constitution\roadmap.md
4. F:\AI前沿消息\docs\sdd\001-product-spec.md
5. F:\AI前沿消息\docs\sdd\002-system-design.md
6. F:\AI前沿消息\docs\sdd\003-data-model.md
7. F:\AI前沿消息\docs\sdd\004-api-contract.md
8. F:\AI前沿消息\docs\sdd\005-delivery-flow.md
9. F:\AI前沿消息\docs\sdd\006-milestones.md
10. F:\AI前沿消息\docs\implementation\000-task-board.md
11. F:\AI前沿消息\docs\implementation\001-batch-a-foundation.md
12. F:\AI前沿消息\docs\implementation\002-batch-b-polling.md
13. F:\AI前沿消息\docs\implementation\003-batch-c-delivery-api.md
14. F:\AI前沿消息\docs\implementation\004-review-gates.md

执行规则：

- 你只能做协调、分发、审查、验收和下一轮决策建议
- 你不能自行跳过 spec
- 你不能自行修改产品范围或技术路线
- 你默认按 docs/implementation 下的批次来组织工作
- 你每一轮都要给出：分发对象、工作包、写入范围、验收标准、风险
- 你必须阻止实施 Agent 触碰未分配模块
- 你必须按 Review Gates 审查回收结果

先做这 4 件事：

1. 输出你对当前项目状态的简短总结
2. 给出第一轮实施分发方案
3. 明确每个实施 Agent 的写入范围
4. 明确回收时你会检查什么

不要直接开始写实现代码。
```

## 4. 第一轮分发消息模板

如果你要让协调 Agent 开始第一轮，直接发这段：

```text
现在开始组织第一轮实施。

目标：
完成 Batch A，也就是基础骨架与数据层。

要求：

1. 按 docs/implementation/001-batch-a-foundation.md 组织工作
2. 把 A1、A2、A3 拆成适合实施 Agent 的分发任务
3. 明确每个任务的写入范围，避免冲突
4. 给出建议并行方式
5. 给出每个任务完成后的验收点
6. 不要自己实现代码

输出格式：

1. 第一轮建议分发
2. 每个实施 Agent 的任务说明
3. 每个任务的写入文件范围
4. 每个任务的完成定义
5. 回收顺序与 review 重点
```

## 5. 让协调 Agent 分发给实施 Agent 的模板

下面这段是协调 Agent 发给单个实施 Agent 的模板。

你也可以要求协调 Agent 基于这个格式输出。

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
- F:\AI前沿消息\docs\implementation\004-review-gates.md

你当前的工作包是：
[在这里填 A1 / A2 / A3 / B1 / B2 / C1 / C2 / C3]

你的目标：
[在这里填该工作包目标]

你的允许写入范围：
[在这里填文件或目录范围]

你的禁止事项：

- 不要修改未授权模块
- 不要回滚别人的改动
- 不要自行改变技术路线
- 不要扩 scope
- 如果发现 spec 不足，先停止并上报

交付时必须包含：

1. 修改了哪些文件
2. 完成了什么
3. 如何验证
4. 风险和遗留问题

如果工作包完成，就只汇报结果，不要继续接下一个包。
```

## 6. 建议的第一轮任务分法

你可以要求协调 Agent 按这个思路分：

### 实施 Agent 1

- 工作包：A1
- 范围：工程骨架
- 主要写入：
  - `package.json`
  - `tsconfig.json`
  - `src/app/*`
  - `src/server/*`
  - 目录骨架

### 实施 Agent 2

- 工作包：A2
- 范围：配置与日志
- 主要写入：
  - `src/config/*`
  - `src/lib/logger/*`
  - `src/shared/env/*`

### 实施 Agent 3

- 工作包：A3
- 范围：数据库与 repository
- 主要写入：
  - `prisma/schema.prisma`
  - `prisma/migrations/*`
  - `src/modules/storage/*`

说明：

- A3 需要在 A1 基础目录成型后进行
- A1 与 A2 可以先并行

## 7. 回收消息模板

当一个实施 Agent 回传结果后，你可以这样让协调 Agent处理：

```text
现在回收并审查这个工作包结果。

要求：

1. 严格按 docs/implementation/004-review-gates.md 审查
2. 判断是否符合对应 batch 文档
3. 判断是否触碰未授权模块
4. 判断是否存在结构性红线
5. 给出结论：通过 / 需修改 / 退回
6. 如果通过，说明是否可以进入下一个依赖任务

不要替实施 Agent 继续实现，只做审查和结论。
```

## 8. 第二轮分发消息模板

当 Batch A 通过后，发给协调 Agent：

```text
现在开始组织第二轮实施。

目标：
完成 Batch B，按 docs/implementation/002-batch-b-polling.md 执行。

要求：

1. 拆分 B1 和 B2
2. 明确它们对 Batch A 产出的依赖
3. 给出建议的实施顺序
4. 给出回收时的关键检查点

不要直接实现代码。
```

## 9. 第三轮分发消息模板

当 Batch B 通过后，发给协调 Agent：

```text
现在开始组织第三轮实施。

目标：
完成 Batch C，按 docs/implementation/003-batch-c-delivery-api.md 执行。

要求：

1. 拆分 C1、C2、C3
2. 明确其中哪些可以并行
3. 明确 delivery 与 API 的边界
4. 明确最终联调前必须具备的前置条件

不要直接实现代码。
```

## 10. 你判断协调 Agent 是否靠谱的标准

如果协调 Agent 输出里缺少这些内容，说明它没有组织好：

- 没有引用现有文档
- 没有明确写入范围
- 没有说明依赖关系
- 没有说明验收标准
- 直接自己下场写代码
- 放任实施 Agent 自己决定架构

## 11. 你最省事的使用方法

如果你想最低沟通成本推进，直接按这个顺序发：

1. 先发“总控消息”
2. 再发“第一轮分发消息模板”
3. 每收到一个实施 Agent 结果，就发“回收消息模板”
4. Batch A 过了，再发“第二轮分发消息模板”
5. Batch B 过了，再发“第三轮分发消息模板”

这样你只需要盯住方向和验收，不需要自己做任务拆分。
