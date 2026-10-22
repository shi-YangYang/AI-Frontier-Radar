# Acceptance

> 追溯验收：基于当前 HEAD 代码、测试与运行结果整理，不是原始实施时点的独立验收记录。

## Result

PASS

## Spec Coverage

- [x] 新增 `source_packs` / `source_pack_items` 数据模型、迁移与仓储
- [x] 首启 seed 创建「AI 消息」包并挂载预设源；旧「监听组合」API 与前端面板移除
- [x] 管理员可创建、编辑、删除、排序、启停主题包，并维护成员
- [x] 删除包级联清理成员与用户 `packIds`，返回受影响用户数；停用包保留用户选择
- [x] 用户端三段选择：全部接收 / 按主题包 / 自定义
- [x] 按包订阅自动纳入包内后续新增源；包模式有效源集为空时不推送
- [x] 自定义 chips 按包分组并显示平台小标；存量自定义用户无感迁移
- [x] 旧请求体（仅 `sourceIds` 数组）保持兼容
- [x] `npm run typecheck` + `npm run smoke:e2e` 通过

## Validation

- Risk Level: S3
- Evidence Reviewed / Checks Performed:
  - 代码审阅：`prisma/schema.prisma`、`src/modules/storage/source-pack-*`、`src/modules/api/controllers/{admin,user}-controller.ts`、`src/modules/polling/services/polling-account-service.ts`、`web/admin/src/pages/{AccountsPage,PortalPage}.vue`
  - `npm run typecheck`：通过（2026-10-22）
  - `npm run build`：通过（2026-10-22）
  - `npm run smoke:e2e`：122 项通过（2026-10-22），其中主题包相关 7 项：建包订阅、包内新增源自动投递、停用包、重新启用恢复、空集不推送、删除级联清理、旧体兼容
- 未执行：管理端主题包编辑器与用户端包卡片的浏览器视觉回归。

## Issues

- 投递过滤依赖 `resolveEffectiveSourceSets` 的周期缓存；本次通过 smoke 验证语义，未做大规模源数量压测。
- 包模式“解析为空即不推送”与自定义“空=全部”语义不同，需在后续改动中保持区分。

## Regression Risks

- 删除包后必须清理所有用户选择中的悬空 `packIds`。
- 停用包只影响投递解析，不得清除用户选择。
- 旧客户端仅传 `sourceIds` 时仍按自定义语义处理。

## Required Rework

- 无。
