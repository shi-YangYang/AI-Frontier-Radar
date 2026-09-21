# Spec

## 背景

登录目前只支持账号密码。管理员希望通过钉钉扫码登录接入 SSO：登录页提供"钉钉登录"按钮（管理员开启后可见），扫码授权后以钉钉身份进入雷达。管理员可在设置中配置钉钉应用凭据并决定是否开启该入口。

## 目标

1. 管理端可配置钉钉登录：AppKey（client_id）、AppSecret、启用开关（存 SQLite `app_settings`，密钥脱敏展示）。
2. 登录页在启用后显示"钉钉登录"按钮：位于【登录】按钮下方，中间用分割线区分；按钮为钉钉蓝（#0089FF）+ 钉钉 logo（已获取 Remix Icon `dingding-fill` SVG）。
3. 点击按钮走钉钉 OAuth 2.0 授权码流程（`login.dingtalk.com/oauth2/auth` → authCode → `POST /v1.0/oauth2/userAccessToken` → `GET /v1.0/contact/users/me`），登录成功建立既有会话。
4. 账号映射（用户已确认）：**首次钉钉登录自动创建普通用户**（unionId 唯一定位），管理员可在用户管理中调整角色/删除；同一钉钉账号再次登录映射到同一用户。

## 非目标

- 不做钉钉通讯录同步、组织架构、部门管理
- 不做 refresh_token 续期持久化（登录即用完即弃，不存储用户级 token）
- 不做手机号/邮箱取回（仅 nick + unionId + openId）
- 不做钉钉工作通知推送（投递通道已有企微/钉钉机器人 webhook）
- 不做已绑定钉钉用户的解绑 UI（首版保持简单）

## 当前行为

- 登录仅支持用户名 + 密码（`POST /auth/login`，session cookie）
- 用户表无任何第三方身份字段

## 目标行为

- `GET /auth/providers`（公开）：返回 `{ dingtalk: { enabled: boolean } }`
- `GET /auth/dingtalk/start`：生成 state（httpOnly cookie 保存，10 分钟有效），302 跳转钉钉授权页（scope=openid, prompt=consent，redirect_uri = 请求 origin + `/auth/dingtalk/callback`）
- `GET /auth/dingtalk/callback`：校验 state → authCode 换 accessToken → `/contact/users/me` 取 unionId/nick → 按 unionId 查找/创建用户（自动创建=普通用户）→ 设置 session → 重定向 `/`（管理员 302 `/`，普通用户 302 `/portal`）
- 失败（state 不匹配/钉钉接口错误/未启用）→ 302 `/login?error=dingtalk` 并展示提示
- 管理端 `GET/PUT /admin/api/settings/dingtalk`：读取（secret 脱敏）与保存；启用开关与凭据独立保存
- 设置页「用户」tab 新增「钉钉登录」分区：说明列 + 表单（AppKey / AppSecret 脱敏输入 / 启用开关 + 保存）
- 登录页：`providers.dingtalk.enabled` 时渲染分割线 + 钉钉按钮

## 功能需求

1. **配置存储**：`app_settings.dingtalk` = `{ appKey, appSecret, enabled }`；未配置或未启用时 `providers` 返回 disabled，登录按钮隐藏，`/auth/dingtalk/*` 拒绝
2. **OAuth 流程**：
   - state 双提交 cookie（随机 32 字节 hex），回调校验一致后失效
   - authCode 一次性使用，钉钉接口错误透出明确错误码
   - unionId 唯一索引；冲突时映射到已有用户
3. **用户创建**：username 取 `dingtalk_<nick 哈希前缀>`（唯一化），密码字段置空（该账号不能用密码登录，除非管理员重置密码）；session 与密码登录一致。中文昵称清洗为空时 username 兜底 `ding_<unionId sha256 前 8 位>`（可区分且稳定）；昵称存 `users.nickname`（migration 20260921010000），用户管理列表与侧栏/绑定端问候语优先显示昵称，登录时昵称变化自动刷新
4. **登录页 UI**：分割线（1px hairline + "或"）+ 蓝色按钮（#0089FF 白字 + logo SVG 18px），宽度与登录按钮一致；中英文 i18n
5. **脱敏**：AppSecret 回显仅显示末 4 位；保存时传空则保持原值；不写入日志
6. **CorpId（可选，用户确认）**：设置页增加可选 CorpId 输入；配置后授权 URL 追加 `exclusiveLogin=true` 与 `exclusiveCorpId=<CorpId>`（钉钉「专属账号登录」），仅本企业成员可扫码；未配置则任何钉钉账号可扫码。设置页样式（tab 拆分等）按现有工作区实现为准
7. **回调 Cookie（缺陷修复）**：成功回调的多个 Set-Cookie 必须以独立响应头发送（Fastify 数组形式），不得用逗号拼接单个头（浏览器会丢弃后续 cookie 导致登录静默失败回登录页）

## 边界条件

- 钉钉开放平台要求 redirect_uri 与应用登记 URL 完全一致：README 说明管理员需在钉钉后台登记 `<站点地址>/auth/dingtalk/callback`；本地调试登记 `http://127.0.0.1:3000/auth/dingtalk/callback`
- 启用开关开启但 AppSecret 为空 → providers 仍 disabled（视为未配置）
- 回调带 `error` 参数 → 明确跳转登录页错误提示
- 钉钉接口超时（10s）/非 200 → 登录失败提示，不崩溃
- 已被管理员删除的用户再次钉钉登录 → 视为新用户重新创建（unionId 曾被删除用户占用时正常复用）

## 技术约束

- 不新增运行时依赖：用项目内 `src/lib/http` 的 fetch；logo 用内联 SVG（无图片请求）
- Prisma migration 新增 `users.dingtalk_union_id`（可空、唯一）
- 密钥不写日志、不进 Git；错误信息不回显完整响应体

## 兼容性要求

- 密码登录完全不受影响
- 微信绑定/portal/管理端无回归
- 中英文 i18n 同步

## 验收标准

- [ ] 管理员可在设置页配置 AppKey/AppSecret 与启用开关，secret 脱敏回显
- [ ] 可选 CorpId：配置后授权 URL 携带 exclusiveLogin/exclusiveCorpId（仅本企业成员可扫）；未配置时不携带
- [ ] 启用后登录页出现分割线 + 钉钉蓝色按钮（含 logo）；停用后隐藏
- [ ] 钉钉扫码登录成功 → 自动创建普通用户并进入 `/portal`；再次登录映射同一账号
- [ ] 管理员可将该用户提升为 admin，钉钉登录后进入管理端
- [ ] state 校验失败/未启用时回调拒绝并提示
- [ ] `npm run typecheck` + `npm run smoke:e2e` 通过
- [ ] README 记录钉钉应用创建与回调地址登记步骤

## 待确认问题

- [x] 账号映射：自动创建普通用户（用户确认）
- [ ] （可选，暂不做）unionId 白名单限制
