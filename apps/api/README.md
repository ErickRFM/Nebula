# NÉBULA API · F03 Foundation

Fastify + PostgreSQL + Drizzle ORM. Database-backed account identity and per-user playlist management.

## Run locally

1. Start PostgreSQL 16, create a database called `nebula`.
2. From the repo root: `npm install`.
3. Set `DATABASE_URL` and `API_JWT_SECRET` (at least 32 random characters).
4. Run `npm run db:migrate -w @nebula/api`.
5. Run `npm run api:dev` (default port 4000).

## Endpoints

- `GET /v1/health`
- `POST /v1/auth/register` -> `{email,password}`
- `POST /v1/auth/login` -> `{email,password}`
- `GET /v1/me` (Bearer)
- `GET /v1/playlists` (Bearer)
- `POST /v1/playlists` -> `{name}` (Bearer)
- `PATCH /v1/playlists/:id` -> `{name}` (Bearer)
- `DELETE /v1/playlists/:id` (Bearer)

`accessToken` expires after 15 minutes. There is **no refresh-token/session revocation flow yet**. Tokens are returned in the response body and must be held securely by clients: do not put them in localStorage or URLs. App authentication integration is not delivered in this foundation. Every playlist operation checks `user_id` to avoid cross-account access.

## Security

- Passwords use individual random salts and Node scrypt.
- JWT signature uses server-only API_JWT_SECRET; never commit it.
- Inputs validated with Zod, API rate limit applied globally and to sign-in/registration.
- CORS restricted to API_CORS_ORIGIN (default localhost web).
- User-owned media upload, encrypted offline downloads, refresh-token rotation, quotas, RBAC and abuse controls remain future work.
