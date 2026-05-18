# Local Web Management - Implementation Plan

## Feature ID

`v1-1-001-local-web-management`

## Dependencies

- V1.0 running local service
- Existing storage repositories
- Existing scheduler manual methods
- Existing polling and delivery jobs

## Task Breakdown

| Task | Owner | Depends On | Write Scope | Goal |
| --- | --- | --- | --- | --- |
| T1 | Implementation Agent | none | `src/modules/storage/*` | Add repository reads/updates needed by admin UI |
| T2 | Implementation Agent | T1 | `src/modules/api/*`, `src/app/*` | Add admin JSON APIs and `/admin` page |
| T3 | Implementation Agent | T2 | `src/server/*`, `src/modules/scheduler/*` | Safely expose manual scheduler actions to admin API |
| T4 | Implementation Agent | T2/T3 | `scripts/*`, `README.md`, `docs/specs/.../verification/*` | Add verification smoke and docs |

## Suggested Order

1. T1
2. T2
3. T3
4. T4

## Parallelization

T1 must happen first because API depends on repository methods.

T2 and T3 may partially overlap only if their write scopes stay separated, but safer order is T2 then T3.

## Verification Commands

```powershell
npm run typecheck
npm run build
```

Additional checks:

```powershell
npm run smoke:e2e
```

If `tsx` smoke fails due local `spawn EPERM`, reviewers may accept equivalent compiled JS or Fastify inject verification with explanation.

## Coordination Review Focus

- Admin page must not leak webhook URL.
- Admin actions must reuse existing scheduler/jobs.
- Account enable/disable must preserve history.
- Adding account must not create duplicates.
- No frontend framework unless approved.
- No auth claims beyond local/private-use warning.

## Rollback Plan

Admin UI changes should be isolated to API routes and repository additions. Rollback by removing admin route registration and new repository methods if unused.
