# V1.2 Admin Chinese Localization - Intake

## Feature ID

`v1-2-001-admin-chinese-localization`

## Problem

The local Web admin page still exposes English labels and status values in tables and action results.

The user wants the admin page to be fully Chinese for daily local use.

## Target User

Single local operator managing AI frontier message monitoring through `http://127.0.0.1:3000/admin`.

## Desired Outcome

Replace user-visible English in the Web admin page with Chinese text while preserving existing API contracts and storage enum values.

## Non-Goals

- No frontend framework.
- No API contract changes.
- No database migration.
- No polling or delivery state-machine changes.
- No machine translation of arbitrary provider error strings.

## Affected Modules

- `src/modules/api/controllers/admin-controller.ts`
- `src/modules/api/routes/admin-routes.ts`
- `README.md`

## Open Questions

- None for this small iteration.
