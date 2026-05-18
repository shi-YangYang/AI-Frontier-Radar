# Local Web Management - Intake

## Feature ID

`v1-1-001-local-web-management`

## Status

`draft`

## Problem

V1.0 已经能本地监控 X 账号并推送飞书，但账号维护和运行观察仍然依赖代码、环境变量、SQLite 状态和日志。

当前痛点：

- 添加/删除/停用账号不方便
- 不清楚当前实际启用了哪些账号
- 不方便查看账号最近抓取状态
- 不方便手动触发一次抓取或投递处理
- JSON 日志对日常使用不友好

## Target User

本项目当前唯一用户：本地运行服务的项目 owner。

## Current Behavior

- 账号通过 `WATCH_ACCOUNTS` 或 `src/config/watch-accounts.ts` 默认列表进入数据库。
- 配置外旧账号会被停用，但用户需要看日志或查数据库才知道实际状态。
- 轮询和投递状态主要通过日志观察。
- 没有本地 Web 页面。

## Desired Behavior

提供一个本地 Web 管理页，用浏览器访问即可：

- 查看监控账号列表
- 添加账号
- 启用/停用账号
- 查看账号最近抓取状态
- 查看最近轮询批次
- 查看最近投递事件
- 手动触发一次抓取
- 手动触发一次投递处理

## Non-Goals

- 不做公网 SaaS
- 不做登录鉴权
- 不做多用户权限
- 不做飞书内交互式管理
- 不做复杂前端工程化
- 不引入 React/Vue 等大型前端栈，除非后续明确决策
- 不迁移数据库

## Affected Areas

- `src/modules/api/*`
- `src/app/*`
- `src/modules/storage/*`
- `src/modules/polling/*`
- `src/modules/delivery/*`
- `src/modules/scheduler/*`
- `docs/specs/v1-1-001-local-web-management/*`

## Risks

- 本地页面若误暴露到公网，会带来管理风险。
- 手动触发抓取可能与定时任务重入，需要复用 scheduler 的重入保护。
- 账号添加后首次抓取规则必须保持：最多只发最新一条，不批量补发历史。
- UI 不能泄露完整飞书 webhook。

## Open Questions

- [ ] 本地 Web 页默认监听所有网卡还是仅建议用户用 `127.0.0.1` 访问？
- [ ] 是否需要一个简单的只读首页，账号管理放到第二步？
- [ ] 手动触发 API 是否需要防误触确认？

## Acceptance To Move To Spec

- [ ] Problem is clear
- [ ] Desired behavior is clear
- [ ] Non-goals are clear
- [ ] Open questions are either answered or explicitly deferred
