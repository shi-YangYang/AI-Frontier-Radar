# V1.2 Admin History Usability - Acceptance

## Scope

- `/admin` watch account timestamp formatting.
- Recent poll run timestamp formatting, error action column, error modal, and pagination.
- Recent delivery event timestamp formatting and pagination.
- Admin API pagination metadata for poll runs and delivery events.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `GET /admin/api/poll-runs?page=1&pageSize=10`: passed with pagination `{ page: 1, pageSize: 10, total: 1, totalPages: 1 }` against a temporary SQLite database.
- `GET /admin/api/delivery-events?page=1&pageSize=10`: passed with pagination `{ page: 1, pageSize: 10, total: 1, totalPages: 1 }` against a temporary SQLite database.
- `/admin` render check: passed with Fastify injection. Verified pagination containers, error modal markup, `formatDateTime()`, `parseErrorSummary()`, `查看错误`, and absence of the poll table `错误摘要` header literal.
- Browser click check: attempted with Playwright, blocked by local `spawn EPERM` when launching Chromium.

## Result

Implementation verification passed for required commands and API/HTML checks.

## Residual Risk

- V1.2 error detail parsing depends on the existing free-text `poll_runs.error_summary` format.
- Full browser interaction verification could not be completed in this environment because Chromium launch was blocked by local permissions.
