# Harness Manual

## 1. Purpose

This directory defines the project execution harness for V1.1 and later.

The harness exists to make Spec-Driven Development operational with coding agents. It defines:

- which documents must exist before code changes
- who makes decisions
- how work is split into agent-safe tasks
- how implementation is reviewed
- how verification evidence is recorded
- how context is restored after thread resets

V1 documents under `docs/sdd` and `docs/implementation` remain historical context. V1.1 and later work must start from this harness.

## 2. Source Of Truth Order

When documents conflict, use this precedence:

1. `constitution/mission.md`
2. `constitution/tech-stack.md`
3. `constitution/roadmap.md`
4. accepted feature spec under `docs/specs/<feature-id>/`
5. implementation plan under `docs/specs/<feature-id>/implementation-plan.md`
6. task prompts under `docs/specs/<feature-id>/tasks/`
7. code

Code does not override specs. If code and spec diverge, update the spec through a decision record before changing implementation direction.

## 3. Roles

### User

The user owns product direction and final acceptance.

The user decides:

- whether a feature is worth doing
- whether scope should expand or shrink
- whether tradeoffs are acceptable
- whether a release can be considered done

### Coordination Agent

The coordination Agent owns the harness.

The coordination Agent must:

- clarify requirements
- update or create specs
- create implementation plans
- split implementation into bounded tasks
- assign file write scopes
- review implementation results
- enforce gates
- maintain context handoff notes

The coordination Agent should not do large implementation work unless the user explicitly asks it to.

### Implementation Agent

Implementation Agents only execute assigned tasks.

Implementation Agents must:

- read required documents
- modify only authorized files
- avoid changing product direction
- report exact files changed
- provide verification evidence
- stop and escalate when specs are insufficient

## 4. Feature Directory Layout

Every feature iteration must use this layout:

```text
docs/specs/<feature-id>/
  00-intake.md
  01-spec.md
  02-design.md
  03-implementation-plan.md
  04-review-plan.md
  05-verification-plan.md
  decisions/
    ADR-0001-title.md
  tasks/
    T1-agent-prompt.md
    T2-agent-prompt.md
  reviews/
    T1-review.md
    T2-review.md
  verification/
    run-001.md
  handoff.md
```

Feature id format:

```text
v1-2-001-short-name
```

Example:

```text
docs/specs/v1-2-001-feishu-account-management/
```

## 5. Lifecycle

Every feature moves through these states:

```text
idea -> intake -> spec -> design -> plan -> tasks -> implementation -> review -> verification -> done
```

### Gate 1: Intake

Required artifact:

- `00-intake.md`

Exit criteria:

- problem is clear
- target user is clear
- non-goals are listed
- affected modules are identified
- open questions are explicit

### Gate 2: Spec

Required artifact:

- `01-spec.md`

Exit criteria:

- user-visible behavior is defined
- edge cases are listed
- non-goals are explicit
- acceptance criteria are testable

### Gate 3: Design

Required artifact:

- `02-design.md`

Exit criteria:

- data flow is defined
- impacted modules are listed
- storage/API/config changes are defined
- failure modes are covered
- migration/backward compatibility is considered

### Gate 4: Implementation Plan

Required artifact:

- `03-implementation-plan.md`

Exit criteria:

- work is split into tasks
- task dependencies are clear
- file write scopes are disjoint where possible
- verification commands are defined

### Gate 5: Agent Tasks

Required artifacts:

- `tasks/T*.md`

Exit criteria:

- each task has required reading
- each task has exact write scope
- each task has explicit non-goals
- each task has verification requirements

### Gate 6: Review

Required artifacts:

- `reviews/T*.md`

Exit criteria:

- implementation is checked against spec
- unauthorized file edits are identified
- behavior regressions are checked
- verification evidence is assessed
- result is `accepted`, `needs-fix`, or `rejected`

### Gate 7: Verification

Required artifact:

- `verification/run-*.md`

Exit criteria:

- required commands pass or failures are documented
- smoke/manual checks are recorded
- residual risks are listed
- release decision is explicit

## 6. Non-Negotiable Rules

- No implementation task without an accepted spec.
- No broad implementation prompt without file write scope.
- No feature is done without verification evidence.
- No hidden architecture change inside an implementation task.
- No changes to `constitution` without explicit user decision.
- No secret values in committed docs, code, or examples.
- No destructive database behavior without migration and rollback notes.
- No accepted version iteration without updating `README.md`.
- No accepted version iteration without updating feature `handoff.md` and `verification/acceptance.md`.
- Update `prompts/context-recovery.md` when agent workflow, startup flow, project boundary, or long-lived operating context changes.

## 7. Standard Commands

Default verification commands:

```powershell
npm run typecheck
npm run build
```

Use additional commands when relevant:

```powershell
npm run smoke:e2e
npm run prisma:migrate:deploy
npm audit --audit-level=high --registry=https://registry.npmjs.org/
```

If a command cannot run, the review must state:

- command attempted
- failure reason
- whether failure blocks acceptance

## 8. Version Entry Rule

Before starting any feature iteration, create:

```text
docs/specs/<feature-id>/00-intake.md
docs/specs/<feature-id>/01-spec.md
```

Only after those are accepted may the coordination Agent create implementation tasks.
