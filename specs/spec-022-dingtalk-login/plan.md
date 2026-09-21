# Plan

## 涉及模块

- `prisma/schema.prisma` + migration：`users.dingtalk_union_id`（可空唯一）
- `src/config`：app_settings 读取 `dingtalk` 配置（provider）
- `src/modules/auth`：钉钉 OAuth 客户端（start/callback/state）、用户 upsert
- `src/modules/api`：路由 `/auth/providers`、`/auth/dingtalk/start|callback`、管理端 settings dingtalk 读写、session 重定向
- `src/modules/api/controllers/admin-controller.ts`：钉钉设置读写（脱敏）
- `web/admin/src/pages/LoginPage.vue`：providers 拉取 + 分割线 + 钉钉按钮
- `web/admin/src/pages/SettingsPage.vue`：用户 tab 新增钉钉登录分区
- `web/admin/src/i18n.ts`：中英文案
- `README.md`：钉钉应用创建步骤与回调地址说明

## 修改顺序

1. Prisma migration（先跑 migrate dev 生成 SQL）
2. 配置层：`app_settings.dingtalk` 读写（复用现有 settings 存储模式）
3. 后端 OAuth：state cookie → 钉钉授权页跳转；回调换 token → users/me → upsert → session
4. API 路由 + 管理端设置接口
5. 前端：LoginPage 按钮、SettingsPage 用户 tab 分区、i18n
6. README + typecheck + smoke:e2e

## 数据流

```
登录页按钮 → GET /auth/dingtalk/start (set state cookie)
  → 302 login.dingtalk.com/oauth2/auth (client_id, redirect_uri, state, scope=openid)
  → 用户扫码 → 302 /auth/dingtalk/callback?authCode&state
  → 校验 state → POST api.dingtalk.com/v1.0/oauth2/userAccessToken
  → GET api.dingtalk.com/v1.0/contact/users/me (unionId, nick)
  → users 表按 dingtalk_union_id upsert（新建=普通用户，username=dingtalk_xxxx）
  → set session cookie → 302 /portal 或 /
```

## 接口变化

- 新增公开路由：`GET /auth/providers`、`GET /auth/dingtalk/start`、`GET /auth/dingtalk/callback`
- 新增管理路由：`GET /admin/api/settings/dingtalk`、`PUT /admin/api/settings/dingtalk`
- 用户表新增字段（migration）

## 测试计划

- `npm run typecheck`
- `npm run smoke:e2e`（钉钉真实 OAuth 无法离线测试；smoke 覆盖 providers 接口、设置读写脱敏、回调未启用拒绝路径）
- 手动验收：真实钉钉应用扫码（用户提供 AppKey/Secret 后）

## 风险

- redirect_uri 必须与钉钉后台登记完全一致 → README 写清步骤
- 自动创建用户的 username 冲突 → 加后缀去重
- 钉钉接口不可用 → 回调明确失败提示，不影响密码登录

## 预计涉及文件

- `prisma/schema.prisma`、`prisma/migrations/xxx_dingtalk/`
- `src/config/*`、`src/modules/auth/dingtalk.ts`（新增）、`src/modules/api/routes/auth-routes.ts`、`src/modules/api/controllers/admin-controller.ts`、`src/modules/api/routes/admin-routes.ts`
- `web/admin/src/pages/LoginPage.vue`、`SettingsPage.vue`、`i18n.ts`
- `README.md`
