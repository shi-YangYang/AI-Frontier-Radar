# V1.2 Admin Chinese Localization - Spec

## Feature ID

`v1-2-001-admin-chinese-localization`

## Scope

Localize `/admin` user-visible UI text to Chinese.

## Functional Requirements

- `FR-001`: Table headers on `/admin` must be Chinese.
- `FR-002`: Account enabled/disabled values must be Chinese.
- `FR-003`: Polling and delivery status values displayed on the page must be Chinese.
- `FR-004`: Manual action result notices must be Chinese.
- `FR-005`: Admin route access-denied messages must be Chinese.
- `FR-006`: Common admin API validation error messages must be Chinese.
- `FR-007`: Existing API payload field names and database enum values must remain unchanged.

## Acceptance Criteria

- `AC-001`: `/admin` no longer shows English table headers such as `username`, `enabled`, `status`, or `created_at`.
- `AC-002`: Status values such as `pending`, `sent`, `failed`, `retry_wait`, and `completed` are displayed as Chinese labels.
- `AC-003`: Manual polling and delivery buttons still work and show Chinese completion/skipped/failure labels.
- `AC-004`: `npm run typecheck` passes.
- `AC-005`: `npm run build` passes.

## Non-Goals

- Do not translate technical identifiers such as usernames, post IDs, environment variables, URLs, or API field names in JSON.
- Do not translate arbitrary provider error details persisted in `last_error`; they may be original diagnostic text.
