# NÉBULA API · F03/F05 Private accounts

Fastify + PostgreSQL + Drizzle ORM. Private, invitation-only accounts with revocable sessions and per-user playlists.

## Run locally

1. Start PostgreSQL 16, create a database called `nebula`.
2. From the repo root: `npm install`.
3. Set `DATABASE_URL` and `API_JWT_SECRET` (at least 32 random characters).
4. Apply migrations: `npm run db:migrate -w @nebula/api` (runs every `.sql` in `migrations/` once, tracked in `schema_migrations`).
5. Create the first owner: `NEBULA_OWNER_EMAIL=... NEBULA_OWNER_PASSWORD=... npm run owner:bootstrap -w @nebula/api` (alternatively `OWNER_EMAIL`/`OWNER_PASSWORD`).
6. Run `npm run api:dev` (default port 4000).

Public registration is **disabled by default**; set `NEBULA_ALLOW_REGISTRATION=true` only for disposable/test environments.

## Endpoints

Full contracts: [`docs/api/API_CONTRACTS.md`](../../docs/api/API_CONTRACTS.md).

- `GET /v1/health`
- `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`
- `POST /v1/auth/accept-invite` (invitation only)
- `GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/:id`, `POST /v1/auth/sessions/revoke-all`
- `GET /v1/me`
- `GET|POST|PATCH|DELETE /v1/playlists[...]`
- `POST /v1/admin/invites`, `GET /v1/admin/users` (owner only)

Access tokens (JWT, 15 min) are returned in the response body; the refresh token is set as an HttpOnly cookie. `requireAuth` re-checks the session row, so revoking a session invalidates its access tokens immediately.

## Security

- Passwords: per-user random salt + Node scrypt; constant-time verification.
- Refresh tokens: 256-bit random, stored only as SHA-256 hashes, rotated on every use, with reuse detection that revokes the whole session family.
- Invitations: single-use, hashed, 7-day expiry.
- Audit events for every sensitive action.
- Inputs validated with Zod; 50 KB body limit; global and per-route rate limits.
- CORS restricted to `API_CORS_ORIGIN` with `credentials:true`; cookie endpoints require the `x-nebula-client` header (CSRF guard).
- Never commit `API_JWT_SECRET`, `DATABASE_URL`, `NEBULA_OWNER_PASSWORD` or `OWNER_PASSWORD`.

## Not yet implemented

Email verification, password reset, 2FA, account lockout, audio upload/storage, streaming, metadata workers, quotas and RBAC beyond owner/member. See the baseline audit.
