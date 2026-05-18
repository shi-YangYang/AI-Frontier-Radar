# V1.2 Admin History Usability - Spec

## Feature ID

`v1-2-002-admin-history-usability`

## Scope

Improve `/admin` history table readability and navigation.

## Functional Requirements

- `FR-001`: In the watch account table, `lastPolledAt` must display as `YYYY/M/D HH:mm:ss`, for example `2026/5/18 10:45:32`.
- `FR-002`: In the recent poll runs table, `startedAt` and `finishedAt` must display as `YYYY/M/D HH:mm:ss`.
- `FR-003`: In the recent delivery events table, `createdAt` and `sentAt` must display as `YYYY/M/D HH:mm:ss`.
- `FR-004`: The recent poll runs table must remove the visible "错误摘要" column.
- `FR-005`: The recent poll runs table must add an "操作" column.
- `FR-006`: For poll runs with account errors, the operation column must show a "查看错误" button.
- `FR-007`: Clicking "查看错误" must open a modal dialog listing each failed account and its error message.
- `FR-008`: Poll runs without errors must not show an active error button.
- `FR-009`: Recent poll runs must support pagination.
- `FR-010`: Recent delivery events must support pagination.
- `FR-011`: Pagination must allow at least previous page, next page, current page, total count, and page size display.
- `FR-012`: Pagination must be implemented without a frontend framework.
- `FR-013`: Existing polling and delivery behavior must not change.
- `FR-014`: Existing storage enum values and API field names may remain English internally.

## Display Rules

- Timestamp display uses the browser local timezone.
- Empty timestamp displays `-`.
- The target output shape is `2026/5/18 10:45:32`.
- Technical identifiers remain unchanged, including usernames, post IDs, target keys, and API fields.

## Error Modal Rules

- Source of truth for V1.2 is `poll_runs.error_summary`.
- Modal should parse common summary format: `username: error | username2: error`.
- If parsing is ambiguous, show the original error text as one detail item.
- Do not expose webhook, token, cookie, or browser profile content.

## Pagination Rules

- Default page size: `10`.
- Allowed page size range: `1-100`.
- Page number starts from `1`.
- Invalid page/pageSize inputs must be normalized or rejected with a clear admin API error.

## Acceptance Criteria

- `AC-001`: Watch account `lastPolledAt` uses `YYYY/M/D HH:mm:ss` format.
- `AC-002`: Poll run `startedAt` and `finishedAt` use `YYYY/M/D HH:mm:ss` format.
- `AC-003`: Delivery event `createdAt` and `sentAt` use `YYYY/M/D HH:mm:ss` format.
- `AC-004`: Poll run table no longer displays the "错误摘要" column.
- `AC-005`: Poll run rows with errors expose "查看错误"; clicking it opens a modal with per-account error details.
- `AC-006`: Poll run list supports previous/next pagination.
- `AC-007`: Delivery event list supports previous/next pagination.
- `AC-008`: `npm run typecheck` passes.
- `AC-009`: `npm run build` passes.

## Non-Goals

- No new charting or dashboard widgets.
- No global search/filter in V1.2.
- No new database schema unless implementation review proves parsing `error_summary` is inadequate.
