# V1.2 Admin Chinese Localization - Design

## Feature ID

`v1-2-001-admin-chinese-localization`

## Approach

Keep the existing server-rendered HTML page and browser-side JavaScript. Add small display-only translation helpers for:

- scheduler job names
- polling run statuses
- delivery event statuses
- known delivery target keys

## Data Contract

No API contract changes.

The frontend maps existing raw enum values to Chinese labels at render time.

## Error Handling

Common admin API validation and permission messages are changed to Chinese.

Arbitrary upstream/provider diagnostics may remain original text because they are operational evidence, not static UI copy.

## Security

No change to local-only admin guard.

No secret values are exposed.
