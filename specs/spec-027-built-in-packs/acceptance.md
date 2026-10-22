# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] 启动 seed 生成 5 个内置包：论文包、AI 包、机器人包、脑机包、融资包
- [x] 存量「AI 消息」包改名为「论文包」，保留 id、成员与描述
- [x] 新增 X / RSS / YouTube 源按清单 ensure，已存在则跳过
- [x] YouTube 解析失败不阻塞其余种子；后续启动重试
- [x] 已存在的内置包会补挂缺失的种子成员，管理员自建包不受影响
- [x] 管理端包列表省略号截断、移除上移/下移、增加详情弹层
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S2
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`src/config/source-groups.ts`、`src/modules/storage/source-pack-seed.ts`、`src/server/start-server.ts`、`web/admin/src/pages/AccountsPage.vue`、`web/admin/src/components/PackDetailModal.vue`
  - 本地数据库核对：`source_packs` 共 5 个（论文包 22 源、AI 包 27 源、机器人包 8 源、脑机包 4 源、融资包 6 源）
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中种子相关 7 项：5 包创建、GET 返回 5 包、YouTube 全失败仍建包、成员补挂、解析恢复、改名保留 id、旧监听组合 API 404
- 未执行：管理端包列表与详情弹层的浏览器视觉回归。

## Issues

- 内置包成员收敛会在重启后补回管理员手工删除的种子成员；Spec 与 `rework.md` 已确认为有意语义。
- YouTube 解析依赖网络与代理，失败时允许部分成员暂时缺失。

## Regression Risks

- 种子必须幂等，不得重复建源、建包或改名。
- 管理员自建包不得被种子修改。
- 新增源首轮锚定，避免历史内容一次性推送。

## Required Rework

- 无。
