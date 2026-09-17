# Roadmap

## 已完成

| 版本 | 内容 |
| --- | --- |
| V1.x | 核心链路成型：轮询 X 账号、SQLite 持久化、飞书投递、本地 Web 控制台 |
| V2.0 | 消息内容页：帖子浏览、筛选、详情 |
| V2.0.1 | 运行时配置：Web 控制台管理飞书 Webhook、轮询参数、X 数据源与代理 |
| V2.0.2 | 初始化体验：`npm run setup` 一键初始化与自检 |

## 近期迭代（V2.1，未发布版本号）

| 迭代 | 内容 |
| --- | --- |
| spec-001 | 轮询与投递解耦：无 Webhook 也入库，不补发历史帖 |
| spec-002 | RSS/Atom 多源接入（含去重键与抓取代理） |
| spec-003 | 按来源类型添加（YouTube / Reddit / arXiv / HN / Product Hunt） |
| spec-004 | 管理台 UI/UX 重构（信息密度收敛、全站空态） |
| spec-005 | 本地 Feed 输出（RSS / JSON Feed，支持规则过滤） |
| spec-006 | Anthropic 官方新闻源（无 RSS 站点专用解析） |
| spec-007 | 第二批官方源：AI2 / Moonshot / Meta AI / xAI（含无头浏览器源）与 Mistral / Stability / HF Blog（RSS） |
| spec-008 | 数据管理 + 运维：帖子导出（CSV/JSON）、数据保留策略、数据库备份/恢复、运行日志页 |
| spec-009 | 首轮仅锚定最新 1 条（榜单型源除外）+ 删除源级联清理消息与投递记录 |
| 追加 | GitHub Trending / HF Daily Papers 源、关键词订阅规则、监听组合、无源跳过轮询、消息一键清空、轮询间隔分钟化 |
| 已放弃 | 邮件通讯（自有邮箱 IMAP）不做 |

## 当前阶段

- 当前版本：V2.0.2 + V2.1 迭代（未发布版本号）
- 下一阶段功能方向：待确认

## 规则

- 本文件描述阶段方向，不替代具体 Spec；每个功能迭代仍需在 `specs/spec-XXX-short-name/` 下走完整 SDD 流程。
- 长期方向调整需要用户明确决策，Agent 不得擅自规划。
