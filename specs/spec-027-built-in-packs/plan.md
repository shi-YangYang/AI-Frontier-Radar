# Plan

## 涉及模块

| 模块 | 改动 |
| --- | --- |
| `src/config/source-groups.ts` | 5 个内置包的种子源清单与主题定义 |
| `src/modules/storage/source-pack-seed.ts` | 扩展幂等 seed：改名、ensure 源、建包、补挂/收敛成员 |
| `src/server/start-server.ts` | 注入运行时 RSS 代理下的 YouTube 解析器 |
| `web/admin/src/pages/AccountsPage.vue` | 包列表省略号截断、移除上移/下移、增加「查看详情」入口 |
| `web/admin/src/components/PackDetailModal.vue` | 只读包详情弹层 |
| `scripts/smoke-e2e.ts` | 种子幂等、改名、补挂、YouTube 失败恢复用例 |

## 修改顺序

1. 固化 5 个包的种子源清单（论文/AI/机器人/脑机/融资）。
2. 扩展 `seedSourcePacks`：存量「AI 消息」改名「论文包」；逐条 ensure 源；创建 4 个新包并挂成员。
3. 对已存在的内置包做成员收敛补挂；管理员自建包不参与。
4. 管理端包列表与详情弹层调整。
5. 补 smoke 用例并回归。

## 数据流

```text
服务启动
  → seedSourcePacks（幂等）
  → 论文包改名 / 建包
  → ensure X、RSS、YouTube 源（YouTube 走 resolver；失败记日志跳过）
  → 挂载成员 / 补挂缺失成员
  → 下次启动重试失败项
```

## 接口变化

无新增 API；复用既有 source-packs CRUD 与用户端包订阅接口。

## 测试计划

- `npm run typecheck`
- `npm run build`
- `npm run smoke:e2e`：5 包创建、重复 seed 幂等、存量改名、成员补挂、YouTube 全部失败不阻塞
- 手动：管理端包列表无横向滚动，详情弹层成员与平台徽标正确

## 风险

- YouTube 解析依赖网络与代理，失败时允许部分成员缺失，不能阻塞启动。
- 内置包成员收敛会在重启后补回管理员手工删除的种子成员（Spec 已确认为有意语义）。
- 新增源首轮只锚定，避免历史内容轰炸。

## 预计涉及文件

- `src/config/source-groups.ts`
- `src/modules/storage/source-pack-seed.ts`
- `src/server/start-server.ts`
- `web/admin/src/pages/AccountsPage.vue`
- `web/admin/src/components/PackDetailModal.vue`
- `scripts/smoke-e2e.ts`
