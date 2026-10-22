# 历史 Spec 收敛为 history.md

## Context

当前 `specs/` 下有 30 个已完成 Spec 目录，包含详细的 `spec.md` / `plan.md` / `acceptance.md`，日常维护与检索成本偏高。用户要求将历史 Spec 压缩到单个 `specs/history.md`，每个 Spec 一句话，并删除旧目录。

## Decision

- 新建 `specs/history.md`，按阶段列出 30 个 Spec 的一句话摘要，并注明 `spec-015` 为历史跳号。
- 删除 `specs/spec-*` 目录；保留 `specs/README.md`、`specs/_template/`，以及新 Spec 按目录创建的约定。
- 历史详细记录以本决策提交前的 Git 历史为准；`specs/README.md` 与 `AGENTS.md` 同步说明归档规则。

## Reason

减少当前工作树噪音，保留可快速浏览的迭代脉络，同时通过 Git 保留完整的需求、计划与验收证据。

## Alternatives

- 保留全部目录：信息完整，但维护与浏览成本高。
- 只压缩部分 Spec：结构不一致，检索边界模糊。
- 完全删除历史：会丢失可追溯的迭代脉络，不可接受。

## Consequences

后续新增 Spec 仍按 `spec-XXX-short-name/` 创建，完成后将一句话摘要补入 `history.md`；需要查看验收证据、实施计划或边界讨论时使用 Git 历史。删除是工作树层面的不可逆变更，但已由提交保留可恢复性。
