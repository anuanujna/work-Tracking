# WorkTrack

WorkTrack is an internal assignment and procurement report dashboard. It loads the latest saved report, accepts new Excel/CSV reports, and stores viewed reports through a small Python backend.

## Run locally

From this folder, run:

```powershell
python server.py
```

For hosted deployments, the server listens on all interfaces by default. Set `WORKTRACK_PORT` to the port supplied by the hosting provider. Use `WORKTRACK_HOST=127.0.0.1` only for local-only access.

Then open http://localhost:8000.

The local demo login is `admin` / `change-me-now`. Set `WORKTRACK_ADMIN_PASSWORD` before starting the server to use a different password.

To connect the login screen to the company identity provider, set its browser login URL:

```powershell
$env:WORKTRACK_COMPANY_LOGIN_URL = 'https://login.company.example/authorize?...'
python server.py
```

That provider must redirect back with an authenticated session exchange; the current local server does not pretend to authenticate an external account. Biometric login should be added through the company provider's WebAuthn/passkey support and requires HTTPS and a registered domain.

## Backend endpoints

- `GET /api/health` checks that the service is running.
- `GET /api/reports` lists saved report metadata and rows.
- `GET /api/reports/:id` returns one saved report.
- `POST /api/reports` stores a report and keeps the latest 10 reports.
- `POST /api/login` creates a secure session cookie.
- `POST /api/change-password` changes the authenticated user's password after verifying the current one.
- `GET /api/audit` returns the latest audit events.
- `POST /api/backup` creates an SQLite backup (admin only).

Reports, users, and audit events are stored in `worktrack.db`. Backups are written to the `backups` folder.

For HTTPS, provide certificate files when starting the server:

```powershell
$env:WORKTRACK_CERT = 'C:\path\server.crt'
$env:WORKTRACK_KEY = 'C:\path\server.key'
python server.py
```

The built-in SQLite implementation is suitable for a local prototype or controlled internal trial. Before production deployment, use PostgreSQL, a managed identity provider, HTTPS behind a reverse proxy, encrypted off-site backups, rate limiting, CSRF protection, and server-side file validation.
