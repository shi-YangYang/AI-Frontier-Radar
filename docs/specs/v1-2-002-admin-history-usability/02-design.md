# V1.2 Admin History Usability - Design

## Feature ID

`v1-2-002-admin-history-usability`

## Overview

Keep the current server-rendered `/admin` HTML and vanilla browser JavaScript.

Add:

- timestamp display formatter
- poll-run error modal
- server-side pagination for poll runs and delivery events

## Timestamp Formatting

Add a browser-side function:

```text
formatDateTime(value) -> "2026/5/18 10:45:32"
```

Rules:

- Accepts ISO timestamp strings from API.
- Uses browser local timezone.
- Returns `-` for null/empty/invalid values.
- Uses numeric year/month/day/hour/minute/second with two-digit time parts.

Apply this formatter to:

- watch account `lastPolledAt`
- poll run `startedAt`
- poll run `finishedAt`
- delivery event `createdAt`
- delivery event `sentAt`

## Poll Error Modal

Current database:

- `poll_runs.error_summary: string | null`

Design:

- Keep `error_summary` in API response.
- Remove it from the visible table columns.
- Add operation column.
- If `errorSummary` exists, show button `查看错误`.
- Button opens modal.
- Modal parses `errorSummary` into account/error rows.

Parsing strategy:

- Split by ` | ` into entries.
- Split each entry by first `:`.
- If no account separator exists, show the full text under "错误详情".

Tradeoff:

- This avoids migration for V1.2.
- It is less robust than a future `poll_run_account_results` table.

## Pagination API

Current endpoints:

- `GET /admin/api/poll-runs`
- `GET /admin/api/delivery-events`

Extend with query parameters:

```text
?page=1&pageSize=10
```

Response shape should remain admin JSON wrapper:

```json
{
  "ok": true,
  "data": {
    "pollRuns": [],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 0,
      "totalPages": 0
    }
  }
}
```

Delivery events use the same pagination object.

## Repository Changes

Add methods:

- `PollRunRepository.listPage({ page, pageSize })`
- `PollRunRepository.countAll()`
- `DeliveryEventRepository.listPage({ page, pageSize })`
- `DeliveryEventRepository.countAll()`

Keep existing `listRecent()` for compatibility.

## Admin Page UI

Add separate pagination state:

- `pollRunsPage`
- `pollRunsPageSize`
- `deliveryEventsPage`
- `deliveryEventsPageSize`

Add controls below each table:

- Previous page
- Current page / total pages
- Next page
- Total count

## Security

No change to local-only admin route guard.

Do not expose secrets in modal or API.

## Compatibility

No database migration required.

Existing rows can still be displayed.
