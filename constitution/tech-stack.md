# Tech Stack

本文件记录项目已确认的技术与工程约束。除非有明确决策变更，后续设计与实现以本文件为准。

## 语言与运行时

| 项 | 值 |
| --- | --- |
| 语言 | TypeScript 5.x |
| Runtime | Node.js >= 20 |
| 包管理器 | npm（`package-lock.json` 已提交，不擅自删除或重建） |

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端框架 | Fastify 5 + @fastify/static |
| 数据库 | SQLite，通过 Prisma 6.19.3 访问（schema：`prisma/schema.prisma`） |
| 浏览器抓取 | Playwright Chromium ^1.59（持久化 profile） |
| 前端 | Vue 3.5 + vue-router 5 + Vite 8 + vue-tsc |
| 日志 | 项目内 `src/lib/logger` |
| HTTP 客户端 | 项目内 `src/lib/http` |
| 队列 | 不使用 BullMQ；Redis 仅用于 `/ready` 就绪检查，核心功能不强依赖 |

## 业务代码目录

| 目录 | 职责 |
| --- | --- |
| `src/` | 后端源码（app / config / server / shared / lib / modules） |
| `web/admin/` | Vue 本地管理前端 |
| `prisma/` | SQLite schema 与 migrations |
| `scripts/` | 初始化、Prisma 包装、冒烟脚本 |

## 文档与 Agent 结构位置

| 路径 | 职责 |
| --- | --- |
| `README.md` | 面向用户的项目说明 |
| `AGENTS.md` | Agent 开发规范与协作流程 |
| `constitution/` | 项目使命、路线图、技术栈 |
| `specs/` | SDD 规格、计划与验收记录 |
| `.ai/` | 决策留痕、工作流、提示词、规则 |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run setup` | 首次初始化（依赖、Prisma Client、migration、Playwright Chromium） |
| `npm run setup:dry-run` | 预览初始化步骤 |
| `npm run local` | 构建并启动本地服务 |
| `npm run dev` | 后端开发模式（tsx watch，不自动构建前端） |
| `npm run build` | 后端 tsc + 前端 Vite 构建 |
| `npm run typecheck` | 后端 + 前端类型检查 |
| `npm run smoke:e2e` | 本地端到端冒烟（不访问真实 X/飞书） |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:migrate:deploy` | 执行数据库迁移 |
| `npm run playwright:install` | 安装 Chromium |

## 测试与质量

| 项 | 现状 |
| --- | --- |
| 单元测试框架 | 未引入 |
| 端到端冒烟 | `scripts/smoke-e2e.ts`（`npm run smoke:e2e`） |
| Lint / Format | 未配置，仅做类型检查 |
| CI | 未配置 |

## 配置与运行

| 项 | 值 |
| --- | --- |
| 配置文件 | `.env`（模板 `.env.example`，不提交真实 `.env`） |
| 默认监听 | `0.0.0.0:3000`（Web 控制台按本机使用设计） |
| 默认数据库 | `.data/ai-news-monitor.sqlite` |
| 运行方式 | 单机本地运行，无 Docker 依赖 |
| 配置优先级 | Web 控制台 SQLite 配置 > `.env` 默认值 |
| 部署 | 本机直接运行；如需访问 X，配置 `X_BROWSER_PROXY_URL` 代理 |

## 重要约束

- X 数据源支持 `browser` 与 `api` 两种模式，默认 `browser`
- 浏览器代理支持 `http://`、`https://`、`socks5://`
- 密钥、Token、Webhook、浏览器 profile 不写入日志、不提交 Git
- 不引入 Docker、Redis 等核心运行强依赖
- 业务代码目录一经确定，不得擅自迁移或重命名
