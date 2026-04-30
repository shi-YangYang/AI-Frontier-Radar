# Batch A - 基础骨架与数据层

## 1. 批次目标

建立 V1 的可运行底座，包括：

- 工程骨架
- 配置与日志入口
- SQLite 数据模型
- 基础 repository 层

本批次完成后，后续轮询和投递实现应能直接基于统一底座推进。

## 2. 工作包列表

### A1 工程骨架

目标：

- 初始化 TypeScript 项目
- 接入 Fastify
- 规划目录结构
- 提供基本开发脚本

建议写入范围：

- `package.json`
- `tsconfig.json`
- `src/app/*`
- `src/server/*`
- `src/shared/*`

建议目录结构：

- `src/app`
- `src/config`
- `src/lib`
- `src/modules/api`
- `src/modules/polling`
- `src/modules/delivery`
- `src/modules/storage`
- `prisma`

完成标准：

- 应用可启动
- Fastify 实例可创建
- 至少存在一个启动入口

非目标：

- 不实现业务逻辑
- 不实现 X 调用
- 不实现飞书发送

### A2 配置与日志

目标：

- 提供统一配置加载
- 提供环境变量解析
- 提供配置校验
- 提供基础日志能力

建议写入范围：

- `src/config/*`
- `src/lib/logger/*`
- `src/shared/env/*`

配置覆盖范围：

- SQLite 路径
- Redis 连接
- 飞书 webhook
- 轮询间隔
- 单次抓取数量
- 是否排除回复
- 是否排除转推
- 监测账号配置来源

完成标准：

- 启动时能加载并校验配置
- 敏感配置不直接打印到日志
- 日志有统一入口

非目标：

- 不做配置热更新
- 不做复杂日志平台接入

### A3 数据模型与 repository

目标：

- 按 `003-data-model.md` 落实 SQLite schema
- 建立 Prisma schema
- 建立最小 repository 层

建议写入范围：

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `src/modules/storage/*`

至少实现的 repository：

- `WatchAccountRepository`
- `XPostRepository`
- `DeliveryTargetRepository`
- `DeliveryEventRepository`
- `PollRunRepository`

完成标准：

- 数据库可初始化
- 唯一约束存在
- 能插入默认 delivery target
- repository 可完成基础 CRUD

非目标：

- 不实现业务编排
- 不实现复杂查询优化

## 3. 并行建议

- A1 与 A2 可并行
- A3 依赖 A1 的基础工程，但可以在目录结构确定后尽早开始

## 4. 交付给实施 Agent 的约束

- 你不止一个人在代码库中工作，不要回滚别人的改动
- 严格按 spec 命名和建模，不要自行改表结构方向
- 不要把轮询状态只放内存
- 不要绕过 repository 直接在业务层散落 SQL

## 5. 验收清单

- 应用能启动
- 配置缺失时能明确失败
- SQLite 文件能正常创建
- 5 张核心表可创建成功
- 默认投递目标能正确落库
