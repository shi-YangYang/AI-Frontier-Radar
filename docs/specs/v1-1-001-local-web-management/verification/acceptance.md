# V1.1 Local Web Management - Acceptance

## Feature ID

`v1-1-001-local-web-management`

## Status

Accepted.

## Accepted Scope

- Local admin page is available at `http://127.0.0.1:3000/admin`.
- Watch accounts are managed through the local Web page instead of command-line edits.
- `WATCH_ACCOUNTS_SOURCE=database` is the recommended default for ongoing use.
- `env` and `file` watch-account sources are retained only as startup seed import paths.
- Admin routes are restricted to localhost access.
- Manual polling and manual delivery actions reuse the existing scheduler/job paths.

## User-Visible Capabilities

- View runtime summary.
- View watch accounts and enabled state.
- Add a watch account by X handle, such as `openai` or `@openai`.
- Enable or disable watch accounts.
- View recent polling runs.
- View recent delivery events.
- Trigger one polling run manually.
- Trigger one delivery worker run manually.

## Security Boundary

This project is only for personal local AI frontier public information monitoring and Feishu notification.

It does not implement hacking, login bypass, CAPTCHA solving, anti-detection bypass, private data collection, or bulk abuse.

The browser source uses normal browser access to public pages as a personal notification tool.

## Verification

Coordinator review accepted the implementation after two P1 findings were fixed:

- Web-added accounts are no longer disabled by startup seed sync.
- `/admin` and `/admin/api/*` are protected by localhost-only access checks.

Verified commands:

```powershell
npm run typecheck
npm run build
```

Both passed during review.

Additional implementation-agent smoke coverage reported:

- `GET /admin` returns HTML for localhost.
- Non-local `/admin` requests return `403`.
- Non-local `/admin/api/summary` requests return structured `403` JSON.
- Web-added accounts remain enabled after seed sync is run again.

## Operational Notes

Start locally with:

```powershell
cd F:\AI前沿消息
notepad .env
npm run local
```

Then open:

```text
http://127.0.0.1:3000/admin
```

Keep account management in `/admin`. Do not rely on editing `WATCH_ACCOUNTS` for normal ongoing account changes.
