# Spec

## 背景

投递通道的删除当前为"软删除"：有投递历史的通道行保留为 `[deleted]` 前缀 + `enabled=0` + `webhookUrl` 清空，设计目的是保留历史与换绑复用。实际产品使用中发现：解绑/换绑/删通道后，管理台通道列表会累积 `[deleted]` 残留行，观感与用户直觉（"解绑就是解绑"）不符。经评估：投递历史真正存在于 `delivery_events` 表（按 `target_key` 关联，不依赖 target 行），物理删除行不损失任何历史；重新绑定时 sync 会以相同 target_key 新建行，历史按 key 自然续上。

**用户决策（已确认）**：物理删除——删除就是删除，不留 `[deleted]` 行。

## 目标

`deliveryTargets.delete()` 改为**始终物理删除**：
1. 先把该 target 的进行中投递事件（pending / retry_wait / sending）标记为 dead（保留现有逻辑，避免发给已删除的通道）
2. 物理删除 target 行（无论有无投递历史）
3. 投递事件本身全部保留（按 target_key 关联，历史可查）

## 非目标

- 不删 delivery_events（历史保留）
- 不改用户端 / 通道注册表 / 投递 worker 逻辑
- 不做 `[deleted]` 行的保留策略（已无此类行）

## 当前行为

- `deliveryTargets.delete()`：0 历史事件 → 物理删除；有历史事件 → 软删除（`[deleted] ${displayName}`、`enabled=false`、`webhookUrl=''`）
- 调用方：用户解绑（user-controller:460）、管理端删微信账号（admin-controller:972）、管理端删通道（:1722）、换绑退役同步（wechat-target-sync:33）

## 目标行为

- `delete()`：标记进行中事件为 dead → `deleteMany` 物理删除 → 返回计数；返回结构不变（`deleted` / `deadEventsCount`）
- 换绑复用逻辑：sync 中"软删除行复用"分支（`existing.webhookUrl === ''`）成为不可达路径，保留代码（防御）或一并删除——由实施判断，保持行为一致即可
- 管理台通道列表不再出现 `[deleted]` 行；投递记录页事件仍按 `targetKey` 展示（该页本来就显示 code 形式的 targetKey）

## 边界条件

- 删除通道时仍有排队事件：置 dead 后物理删除（用户不再收到，队列不悬挂）
- 同一账号换绑后历史事件：target_key 不变，事件可查；通道行重建为新行
- 级联删除监听源（spec-009）不受影响（走事件物理清理路径）

## 技术约束

- 仅改 `delivery-target-repository.ts` 的 delete 实现；不改调用方
- 返回签名 `DeleteDeliveryTargetResult` 保持兼容

## 验收标准

- [ ] 删除有历史的通道后：行物理消失、进行中事件置 dead、已发送事件保留可查
- [ ] 用户解绑 / 换绑 / 管理员删通道后管理台无 `[deleted]` 残留行
- [ ] `npm run typecheck` 0 错误；`npm run smoke:e2e` 全绿（若有软删除断言需更新）；`npm run build` 成功

## 待确认问题

- [x] 全通道统一物理删除（用户确认：删除就是删除）
