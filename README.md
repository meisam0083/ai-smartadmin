# AI SmartAdmin — مدیر هوشمند شبکه‌های اجتماعی

Work in progress. This repository is **not yet production-ready**. No live publishing, database migration, Netlify deployment, or Android PWA installation has been verified.

## Current implementation
- Responsive Persian RTL dashboard with light/dark themes and honest empty states.
- Shared Jalali/Persian display formatting in `src/lib/locale.ts`.
- PWA manifest, install banner, SVG icon and network-first service worker. PNG 192/512 icons and device tests are pending.
- PostgreSQL schema in `db/schema.sql` for users, sessions, connections, RSS, content, publishing jobs and audit events.
- Netlify serverless health endpoint and first-user registration/login/logout/me endpoints. Secrets remain server-side.

## Setup
1. Configure a persistent PostgreSQL database and execute `db/schema.sql`.
2. Configure Netlify environment variables from `.env.example`. Generate `TOKEN_ENCRYPTION_KEY` using 32 cryptographically secure random bytes encoded as Base64. Never use a `VITE_` prefix for secrets.
3. `npm install && npm run build`.
4. Deploy with Netlify. The configured domain is a target, not a verified deployment.

## API
- `GET /api/health` — database connectivity (no secrets returned)
- `POST /api/auth?action=register` — initial account only; registration closes after first user
- `POST /api/auth?action=login` — HTTP-only secure cookie
- `POST /api/auth?action=logout`
- `GET /api/auth?action=me`

## Before production
Implement rate limiting, CSRF/origin checks for state-changing endpoints, atomic first-user bootstrap, migrations and integration tests, connection CRUD, Gemini, RSS, scheduler, queue and real UI authentication. The endpoints are a foundation and must not be considered a finished secure deployment. Do not publish test posts to public channels without explicit permission.
