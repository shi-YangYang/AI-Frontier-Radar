# Spec

## 背景

部分源类型（GitHub / HF Papers / Anthropic / AI2 / Moonshot / Meta / xAI）使用 `firstRunBaseline = 'all'`：首次轮询把列表页可见的**全部历史条目**都塞进库（如 xAI 一次 79 条 2023-2025 旧文、Moonshot 26 条 2024 旧文），用户不希望初次添加即被历史内容刷屏。

用户期望：
1. 所有源统一：只关注"添加时间之后"的消息；
2. 首次添加仅锚定**最近 1 条**消息（作为基准，不刷屏）；
3. 删除监听源时，其全部消息与投递记录一并删除，不留基准。

## 目标

1. **首轮行为**：文章型源（Anthropic / AI2 / Moonshot / Meta / xAI）首次轮询只入库最新 1 条（锚定基准）并正常投递（与 RSS 语义一致）；榜单型源（GitHub Trending / HF Daily Papers）保留 `firstRunBaseline='all'`（首轮全量入库、不投递——其条目为当日榜单，无历史旧文问题，且避免下一轮把当日剩余条目当新消息补投）。后续轮询统一只入库比游标更新的条目。
2. **删除级联**：删除监听源时删除其全部帖子与关联投递记录，接口返回删除数量；界面确认文案与结果提示同步。
3. 移除不再使用的 `firstRunBaseline` 字段（接口、7 个 provider、轮询服务逻辑）。

## 非目标

- 不自动清理已入库的历史数据（存量数据需用户删除源或手动清理；删除源即是清理手段）。
- 不改变投递规则（订阅规则）、不改变保留策略（spec-008）。

## 目标行为

- 首次轮询（文章型源）：`eligible = [最新一条]`，入库并投递；榜单型源：`eligible = 全部`，入库且 `createEvents=false`。
- 后续轮询：`eligible = { xPostId > lastSeen/baseline }`（现有逻辑不变）。
- 删除源自 `DELETE /admin/api/watch-accounts/:id`：
  - 先删该源帖子的投递事件，再删帖子，最后删监听源；
  - 返回 `{ deleted: true, deletedEvents, deletedPosts }`；
  - 无帖子（未轮询过）时返回 0。

## 边界条件

- 源从未轮询（xUserId 为空）→ 无帖子可删，正常删除监听源。
- 多个源共享 authorUserId 的情况不存在（各 web 源 sourceId 含 URL 哈希或单例固定 ID）。
- 首次轮询列表为空 → 不入库，不报错。

## 技术约束

- 不改数据库结构（沿用 author_user_id 作为归属键）。
- 删除顺序必须事件先于帖子（外键 Restrict）。

## 验收标准

- [ ] 首轮仅入库最新 1 条（所有源类型）
- [ ] 删除源级联删除帖子与投递事件，且不影响其他源
- [ ] smoke 覆盖首轮锚定与删除级联
- [ ] UI 文案与提示更新；README/roadmap 同步
- [ ] 实机验证：新增源首轮 1 条；删除源后帖子与事件消失

## 待确认问题

无。
