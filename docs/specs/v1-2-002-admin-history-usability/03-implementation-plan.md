# V1.2 Admin History Usability - Implementation Plan

## Feature ID

`v1-2-002-admin-history-usability`

## Task Breakdown

| Task | Owner | Write Scope | Goal |
| --- | --- | --- | --- |
| T1 | Implementation Agent | `src/modules/storage/poll-run-repository.ts`, `src/modules/storage/delivery-event-repository.ts` | Add count and paginated list repository methods |
| T2 | Implementation Agent | `src/modules/api/controllers/admin-controller.ts`, `src/modules/api/routes/admin-routes.ts` | Add pagination query parsing, paginated API responses, timestamp formatting, error modal, and paginated table UI |
| T3 | Implementation Agent | `README.md`, `docs/specs/v1-2-002-admin-history-usability/*` | Update docs and verification notes |

## Suggested Order

1. T1
2. T2
3. T3

## Verification Commands

```powershell
npm run typecheck
npm run build
```

## Additional Smoke Checks

- `GET /admin/api/poll-runs?page=1&pageSize=10` returns pagination metadata.
- `GET /admin/api/delivery-events?page=1&pageSize=10` returns pagination metadata.
- `/admin` renders without JavaScript errors.
- Timestamps display as `YYYY/M/D HH:mm:ss`.
- A poll run with `errorSummary` shows "查看错误" and opens a modal.

## Review Focus

- No schema migration unless explicitly justified.
- Existing API consumers are only admin page internals.
- No secret exposure in modal.
- No state-machine changes.
- Pagination handles empty data.
