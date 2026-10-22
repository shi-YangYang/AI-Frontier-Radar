# AGENTS 规范升级与分支适配

## Context

项目原有 `AGENTS.md` 为早期长版规范；用户提供新版通用规范，要求据此更新 `AGENTS.md` 与 `README.md`。仓库实际主分支为 `master`（远端 HEAD、CI 与 CD 均指向它），而新版通用模板默认写 `main`。新版规范还把 `.ai/rules/web-design.md` 列为 Web 界面强制规则，但仓库此前没有该文件。

## Decision

- 采用新版 `AGENTS.md`，保留本项目的显式配置：`project_mode: EXISTING`、`business_code_dir: src, web/admin`、`multi_agent: true`。
- 规范中的默认主分支由 `main` 适配为仓库实际的 `master`，PR 流程为 `dev → master`。
- 接入 `.ai/rules/web-design.md`，作为 Web 界面文案与信息设计的项目规则。
- `spec-022`～`spec-031` 的验收记录按追溯验收补记，明确标注其非原始实施时点的独立验收。

## Reason

保持规范与仓库真实分支、目录和 CI/CD 配置一致，避免 Agent 执行不存在的 `origin/main` 同步命令；补齐被规范引用但缺失的规则文件，使必读清单可执行。

## Alternatives

- 保留旧版规范：与用户提供的新版不一致，且缺少 Git 授权边界、S0–S3 验证、代码组织等规则。
- 直接将主分支改名为 `main`：影响远端、CI/CD、PR 历史与部署配置，超出文档更新范围。
- 不补 `.ai/rules/web-design.md`：会在必读清单中留下悬空引用。

## Consequences

后续 Agent 按 `dev` 开发、`dev → master` 提 PR；Web 界面改动需遵循 web-design 规则；追溯验收记录不得冒充原始独立验收。若未来仓库主分支正式改为 `main`，需同步更新 `AGENTS.md`、README、CI/CD 与远端配置。
