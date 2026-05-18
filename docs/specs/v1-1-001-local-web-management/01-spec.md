# Local Web Management - Spec

## Feature ID

`v1-1-001-local-web-management`

## Status

`draft`

## Summary

V1.1 增加一个本地 Web 管理页，用于管理监控账号和观察运行状态。页面只面向本地/内网单用户使用，不做公网安全模型。

## User Stories

- As the project owner, I want to view all watch accounts, so that I know which accounts are currently monitored.
- As the project owner, I want to add a watch account from a web page, so that I do not need to edit code or environment variables.
- As the project owner, I want to enable or disable an account, so that I can adjust monitoring without deleting history.
- As the project owner, I want to see recent polling and delivery status, so that I can understand whether the service is working.
- As the project owner, I want to manually trigger a polling run, so that I can test changes immediately.

## Functional Requirements

- `FR-001`: Provide a local Web page at `/admin`.
- `FR-002`: The page must show current service status summary.
- `FR-003`: The page must show watch accounts from SQLite, including enabled state and last poll status.
- `FR-004`: The page must allow adding a new X username.
- `FR-005`: The page must normalize usernames by removing leading `@`.
- `FR-006`: Adding an existing username must not duplicate rows.
- `FR-007`: The page must allow enabling and disabling accounts.
- `FR-008`: Disabling an account must preserve baseline, last seen, and historical delivery data.
- `FR-009`: The page must show recent poll runs.
- `FR-010`: The page must show recent delivery events.
- `FR-011`: The page must provide a manual "run polling now" action.
- `FR-012`: The page must provide a manual "run delivery now" action.
- `FR-013`: Manual actions must reuse existing scheduler/job logic and must not bypass state machines.
- `FR-014`: The page must not reveal full Feishu webhook URL.
- `FR-015`: The page must work without Redis, matching current V1.0 behavior.

## Edge Cases

- `EC-001`: Adding `@openai` and `openai` should refer to the same account.
- `EC-002`: Adding an invalid X username should show a clear error.
- `EC-003`: If polling is already running, manual polling should be skipped or return an already-running status.
- `EC-004`: If delivery worker is already running, manual delivery should be skipped or return an already-running status.
- `EC-005`: If browser scraping fails for an account, the account row should show the last error.
- `EC-006`: If no accounts exist, the page should show an empty state and allow adding one.

## Non-Goals

- No authentication in V1.1.
- No public deployment hardening.
- No Feishu interactive app.
- No multi-target delivery management.
- No frontend framework unless explicitly approved.
- No deletion of historical data.
- No Redis/BullMQ migration in this feature.

## Acceptance Criteria

- `AC-001`: Given the service is running, when the user opens `/admin`, then the admin page renders.
- `AC-002`: Given accounts exist in SQLite, when `/admin` loads, then the page shows enabled state and last poll status for each account.
- `AC-003`: Given a user enters `@openai`, when they submit add account, then one `openai` account exists in SQLite.
- `AC-004`: Given an enabled account, when the user disables it, then future polling excludes that account.
- `AC-005`: Given a disabled account, when the user enables it, then future polling includes that account.
- `AC-006`: Given the user clicks run polling now, then existing polling orchestration is invoked once.
- `AC-007`: Given the user clicks run delivery now, then existing delivery worker job is invoked once.
- `AC-008`: Given the page displays config summary, then full webhook URL is not displayed.

## Observability

- Admin page shows summary counts.
- Manual action responses show success/skipped/failure.
- Server logs still include polling summary.
- API endpoints return structured JSON for admin actions.

## Security And Privacy

- The page is intended for local/private network use only.
- Do not expose full Feishu webhook.
- Do not expose browser cookies/profile content.
- Do not expose raw X payload JSON on the admin page.

## Compatibility

- Existing SQLite data must continue working.
- Existing environment-driven seed sync must not delete historical rows.
- Existing `/health`, `/ready`, `/config/summary` must remain available.
- Existing scheduler must continue running.

## Required Decisions

- [ ] Whether `/admin` should be plain server-rendered HTML or static HTML + JSON APIs.
- [ ] Whether manual trigger APIs should be under `/admin/api/*` or `/api/*`.
