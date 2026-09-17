# Specs

本目录保存 SDD（规格驱动开发）迭代的规格、实施计划与验收记录。完整流程与硬性约束见根目录 [AGENTS.md](../AGENTS.md)。

## 命名方式

```text
spec-XXX-short-name
```

例如 `specs/spec-001-user-auth/`。

## 目录结构

```text
specs/
├── README.md
├── _template/
│   ├── spec.md
│   ├── plan.md
│   └── acceptance.md
└── spec-XXX-short-name/
    ├── spec.md
    ├── plan.md
    ├── acceptance.md
    └── rework.md          # 可选
```

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `spec.md` | 定义要实现什么，以及怎样才算正确完成 |
| `plan.md` | 描述如何实施已确认的 Spec：涉及模块、修改顺序、数据流、接口、测试、风险 |
| `acceptance.md` | 记录独立验收结果 |
| `rework.md` | 记录返工目标与范围（可选） |

`plan.md` 可以随代码调研完善，但不得绕过 Spec 改变需求本身。

## 生命周期

1. 起草 `spec.md` 与 `plan.md`，确认影响实施结果的关键决策。
2. 实施（多 Agent 模式下由实施 Agent 执行）。
3. 实施完成后，由独立验收 Agent 验收并产出 `acceptance.md`。
4. 验收失败进入返工流程，重新验收，直到 PASS。

## 验收结果

`acceptance.md` 的 Result 只能是：

```text
PASS
```

或：

```text
FAIL
```

验收 Agent 发现问题时返回问题，不修改业务代码。

## 返工规则

验收失败时：

1. 协调 Agent 读取完整 Acceptance Report，整理明确返工目标。
2. 必要时创建或更新 `rework.md`。
3. 创建新的实施 Agent 返工。
4. 返工完成后创建新的独立验收 Agent 重新验收，不得复用上一验收结论。
