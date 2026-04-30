# AI前沿消息实时监测 - API Contract

> 状态：V1 下游设计文档
>
> 上游约束文件：
> - `constitution/mission.md`
> - `constitution/tech-stack.md`
> - `constitution/roadmap.md`
>
> 依赖文档：
> - `001-product-spec.md`
> - `002-system-design.md`
> - `003-data-model.md`

## 1. 文档目标

定义 V1 内部 API 的最小契约，供实施 Agent 实现 `api` 模块时参考。

V1 的 API 不是公网产品 API，而是本地管理和运行观察接口。

## 2. API 边界

V1 API 分为两类：

- 必做接口：V1.0 必须实现
- 预留接口：为 V1.1 本地 Web 管理页准备，V1.0 可先不实现

## 3. 通用约定

## 3.1 协议

- 协议：HTTP
- 数据格式：`application/json`
- 默认时区：响应中统一返回 UTC 时间

## 3.2 响应结构

成功响应建议结构：

```json
{
  "ok": true,
  "data": {}
}
```

失败响应建议结构：

```json
{
  "ok": false,
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## 3.3 错误码建议

- `INVALID_REQUEST`
- `NOT_FOUND`
- `CONFLICT`
- `DEPENDENCY_UNREADY`
- `INTERNAL_ERROR`

## 4. 必做接口

## 4.1 GET /health

用途：

- 进程存活检查

请求：

- 无请求体

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "service": "ai-news-monitor",
    "time": "2026-04-21T09:00:00Z"
  }
}
```

语义：

- 只表示 API 进程还活着
- 不表示数据库和队列一定可用

## 4.2 GET /ready

用途：

- 依赖就绪检查

请求：

- 无请求体

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "status": "ready",
    "database": "ok",
    "queue": "ok",
    "config": "ok"
  }
}
```

失败响应示例：

```json
{
  "ok": false,
  "error": {
    "code": "DEPENDENCY_UNREADY",
    "message": "database not reachable"
  }
}
```

语义：

- 用于判断服务是否具备工作条件
- 至少检查 SQLite 文件可访问、Redis 可访问、配置有效

## 4.3 GET /config/summary

用途：

- 返回当前运行时关键配置摘要
- 方便本地确认系统读到了哪些配置

请求：

- 无请求体

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "pollIntervalSeconds": 120,
    "fetchLimitPerAccount": 10,
    "excludeReplies": true,
    "excludeReposts": true,
    "watchAccountsCount": 12,
    "deliveryTargetsCount": 1
  }
}
```

约束：

- 不能回显敏感信息，例如完整 webhook URL

## 5. 预留接口

以下接口为 V1.1 本地 Web 管理准备，V1.0 可先不实现，但接口命名应预留。

## 5.1 GET /watch-accounts

用途：

- 列出监测账号

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "acc_001",
        "xUsername": "openai",
        "enabled": true,
        "lastSeenPostId": "123456789",
        "lastPolledAt": "2026-04-21T09:00:00Z"
      }
    ]
  }
}
```

## 5.2 POST /watch-accounts

用途：

- 新增监测账号

请求体示例：

```json
{
  "xUsername": "openai"
}
```

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "id": "acc_001",
    "xUsername": "openai",
    "enabled": true
  }
}
```

约束：

- 若账号已存在，应返回 `CONFLICT`
- 首次接入账号后，后端需要按 spec 建立基线，不补发历史消息

## 5.3 PATCH /watch-accounts/:id

用途：

- 启用或停用监测账号

请求体示例：

```json
{
  "enabled": false
}
```

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "id": "acc_001",
    "enabled": false
  }
}
```

## 5.4 DELETE /watch-accounts/:id

用途：

- 删除监测账号

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "deleted": true
  }
}
```

约束：

- 删除账号不应级联删除历史投递记录
- V1 更推荐软删除或 `enabled=false`，而不是物理删除

## 5.5 GET /poll-runs

用途：

- 查看最近轮询批次

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "run_001",
        "status": "success",
        "accountsTotal": 10,
        "accountsFailed": 0,
        "newPostsDetected": 2,
        "startedAt": "2026-04-21T09:00:00Z",
        "finishedAt": "2026-04-21T09:00:12Z"
      }
    ]
  }
}
```

## 5.6 GET /delivery-events

用途：

- 查看最近消息投递状态

查询参数建议：

- `status`
- `limit`

成功响应示例：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "evt_001",
        "xPostId": "123456789",
        "targetKey": "feishu-main",
        "status": "sent",
        "attemptCount": 1,
        "sentAt": "2026-04-21T09:00:15Z"
      }
    ]
  }
}
```

## 6. 非 HTTP 接口边界

V1 还存在两个非 HTTP 接口边界：

## 6.1 PollingOrchestrator -> SourceProvider

建议输入：

- `xUsername`
- `xUserId`
- `sincePostId`
- `limit`

建议输出：

- 标准化帖子列表
- 账号元信息
- 原始响应摘要

## 6.2 PollingOrchestrator -> Delivery Queue

建议投递任务消息体：

```json
{
  "eventId": "evt_001",
  "xPostId": "123456789",
  "targetKey": "feishu-main"
}
```

要求：

- 队列消息不携带过多冗余数据
- 发送时以数据库记录为准，不以内存消息体为准

## 7. 安全与边界约束

- V1 API 默认仅用于本地或内网
- 不暴露完整 webhook 地址
- 不在 API 中返回完整原始帖子 JSON，避免过度暴露与响应膨胀
- 预留接口如果未实现，明确返回 `404` 或不注册路由

## 8. 对实施 Agent 的要求

实施 Agent 在实现 API 时必须遵守：

- 不在 V1 擅自扩大成公网管理后台
- 不返回与 spec 无关的大量原始字段
- 所有状态型返回必须来自数据库真实状态，而不是进程内缓存

## 9. 待后续明确项

- V1.1 是否真的进入本地 Web 管理页
- 是否需要 `POST /poll/run-now` 这种手动触发接口
- 是否需要 `GET /watch-accounts/:id/posts` 这类诊断接口
