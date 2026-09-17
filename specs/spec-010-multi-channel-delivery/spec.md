# Spec

## 背景

当前投递通道只有飞书 Webhook（`feishu_webhook`），用户希望多渠道并发投递，并且可以按渠道过滤内容（不同通道收到不同内容）。

## 目标

### A. 新增渠道（共 4 种）

| channelType | 渠道 | 请求 | 成功判定 | 额外配置 |
| --- | --- | --- | --- | --- |
| `wecom_webhook` | 企业微信机器人 | POST `{"msgtype":"markdown","markdown":{"content":text}}` | `errcode === 0` | 无 |
| `dingtalk_webhook` | 钉钉机器人 | POST `{"msgtype":"markdown","markdown":{"title","text}}` | `errcode === 0` | 可选加签：`secret` → `timestamp` + `sign`(HMAC-SHA256, base64, urlencode) |
| `bark` | Bark（iOS 推送） | POST 完整推送地址 JSON `{title, body, url}` | `code === 200` | 无（webhookUrl 即 `https://api.day.app/<key>`） |
| `generic_webhook` | 通用 Webhook | POST JSON `{author, title, url, postedAt, text}` | HTTP 2xx | 无 |

- 保留既有 `feishu_webhook`。
- 目标表新增 `config_json` 列存扩展配置（当前仅钉钉 `secret`）。
- 每个目标沿用既有重试策略（网络/5xx 可重试，业务码错误不可重试）。

### B. 分渠道订阅规则

- 订阅规则新增 `targetKeys: string[]`：空数组 = 全部通道（兼容既有规则）。
- 投递判定：帖子文本命中任一启用规则后，只为「命中规则指定（或未指定=全部）的通道」创建投递事件；多条规则命中的通道取并集。
- 既有语义不变：无启用规则 = 全量投递到所有启用通道；有规则但未命中 = 不投递。
- 规则保存时校验 `targetKeys` 必须是已存在的目标（或空）；界面提供通道多选。

### C. 管理台

- 「飞书配置」页签改为「投递通道」：新建时选渠道类型（URL 占位与提示随类型变化；钉钉显示加签密钥输入）；列表显示渠道类型标签；测试按钮对各渠道发送测试消息。
- 订阅规则编辑器增加「生效通道」多选（默认全部通道）。

## 非目标

- 不做 Telegram / Discord / Slack（本轮范围外）。
- 不做每通道自定义消息模板（通用 Webhook 固定字段）。
- 不做通道级限流。

## 边界条件

- 未知 channelType 的投递事件：标记死信（不可重试），错误信息明确。
- 规则引用的目标被删除：保存时拒绝；历史规则中的失效 targetKey 忽略（等价于不投递）。
- 钉钉未配置 secret：不附加签名。
- Bark `code !== 200`：不可重试错误，记录 `message/code`。

## 技术约束

- 不新增依赖（签名用 `node:crypto`，HTTP 复用 `createJsonHttpClient`）。
- 数据库迁移仅新增列（SQLite `ALTER TABLE ADD COLUMN`），不改既有数据。

## 验收标准

- [ ] 4 个新渠道可创建/测试/投递，payload 与成功判定正确（mock 断言）
- [ ] 钉钉加签正确（timestamp + sign 存在且可校验）
- [ ] 分渠道规则：指定通道的规则只投该通道；未命中不投递；无规则全量
- [ ] 界面可配置渠道与规则通道范围；README/roadmap 同步
- [ ] smoke 全绿 + 实机验证

## 待确认问题

无。
