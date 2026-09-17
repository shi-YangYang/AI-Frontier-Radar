# Plan

## 涉及模块

- `src/modules/polling/source/anthropic-news-source-provider.ts`（新）
- `source/index.ts`、`polling/index.ts`（导出）
- `types/source-provider.ts`、`storage/types.ts`（source type 增加 `anthropic_news`）
- `scheduler/runtime-scheduler.ts`（registry 注册）
- `api/controllers/admin-controller.ts`、`server/start-server.ts`（创建/校验分支）
- `web/admin/src/api/admin-api.ts`、`pages/AccountsPage.vue`、`i18n.ts`（新类型与徽标）
- `src/config/source-groups.ts`（AI 消息组合加入该源）
- `scripts/smoke-e2e.ts`、`README.md`

## 修改顺序

1. 类型与 provider（解析/ID/错误码/首轮基线）。
2. 注册与校验链路。
3. 前端类型选择与组合。
4. smoke + README + 实机验证。

## 测试计划

- provider 级 mock HTML 用例（标题/日期/摘要/去重键）。
- 轮询链路用例（首次基线不投递、新文章投递、重复不重复）。
- 实机抓取 `https://www.anthropic.com/news`。

## 风险

- 站点改版导致解析失效：错误分类明确，可快速适配。
