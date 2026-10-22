# Specs

本目录保存 SDD（规格驱动开发）迭代记录与历史摘要。完整流程与硬性约束见根目录 [AGENTS.md](../AGENTS.md)。

## 目录结构

```text
specs/
├── README.md
├── history.md          # 已完成迭代的一句话摘要
└── _template/
    ├── spec.md
    ├── plan.md
    └── acceptance.md
```

历史 Spec 的详细 `spec.md` / `plan.md` / `acceptance.md` 已按维护策略归档，可在引入 `history.md` 前的 Git 历史中查看。

## 历史归档

`history.md` 按迭代顺序记录已完成的 Spec，每条一句话摘要；新增 Spec 前先查阅，避免重复定义已实现能力。

## 新建 Spec

新迭代仍按 `spec-XXX-short-name/` 创建，至少包含 `spec.md` 与 `plan.md`；实施完成后产生 `acceptance.md`，发生返工时可扩展 `rework.md`。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `spec.md` | 定义要实现什么，以及怎样才算正确完成 |
| `plan.md` | 描述如何实施已确认的 Spec |
| `acceptance.md` | 记录独立验收结果 |
| `rework.md` | 记录返工目标与范围（可选） |

`plan.md` 可以随代码调研完善，但不得绕过 Spec 改变需求本身。

## 生命周期

1. 起草 `spec.md` 与 `plan.md`，确认影响实施结果的关键决策。
2. 实施。
3. 实施完成后由独立验收 Agent 验收并产出 `acceptance.md`。
4. 验收失败进入返工流程，重新验收，直到 PASS。
5. 完成后将一句话摘要补入 `history.md`；详细文件可按项目维护策略归档到 Git 历史。

## 验收结果

`acceptance.md` 的 Result 只能是 `PASS` 或 `FAIL`；模板见 `_template/acceptance.md`。验收 Agent 发现问题时返回问题，不修改业务代码。

## 返工规则

1. 协调 Agent 读取完整 Acceptance Report，整理明确返工目标。
2. 必要时创建或更新 `rework.md`。
3. 创建新的实施 Agent 返工。
4. 返工完成后创建新的独立验收 Agent 重新验收，不得复用上一验收结论。
