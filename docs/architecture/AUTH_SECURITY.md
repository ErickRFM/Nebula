# NÉBULA · Authentication & Session Security (Fase 01)

Status: **implemented in code and migrations**, validated by unit tests and integration tests that run in CI against a disposable PostgreSQL. Live deployment (Vercel + Render + R2) is **not yet configured** (see `docs/audits/NEBULA_BASELINE.md` §7).

## 1. Threat model

NÉBULA is a **private** music library. The attacker we defend against is any unauthenticated party (or an unauthorized account) trying to enumerate, download or stream content. There is no public catalog, no public registration and no anonymous read path.

## 2. Account model

Roles (`users.role`, CHECK `owner|member`):

- **OWNER** — created only through the bootstrap CLI. Can administer accounts (invite members, list accounts) and, in later phases, the library and storage.
- **MEMBER** — created only by accepting a private invitation. No administration rights.

## 3. Enrollment (no public registration)

- `POST /v1/auth/register` is **disabled by default** (`NEBULA_ALLOW_REGISTRATION=false`) and returns `403 registration_closed`. `GET /v1/auth/config` reports `{registrationOpen}` so the web UI can decide whether to offer the register form (it is only enabled for disposable/test environments).
- The first **OWNER** is created out-of-band:
  ```bash
  DATABASE_URL=... NEBULA_OWNER_EMAIL=owner@example.com NEBULA_OWNER_PASSWORD='...' npm run owner:bootstrap
  ```
  The script refuses to run if an owner already exists and never touches Git.
- Additional accounts are created through invitations:
  1. OWNER calls `POST /v1/admin/invites` (optionally pinning an email) and receives a one-time token.
  2. The invited person calls `POST /v1/auth/accept-invite` with the token, email and password, and is signed in.
  Invite tokens are random 256-bit values; only their SHA-256 hash is stored, and they expire after 7 days and are single-use.

## 4. Sessions and tokens

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access (JWT) | 15 min (`API_ACCESS_TTL_SECONDS`) | client memory only | authorize API calls (`Authorization: Bearer`) |
| Refresh | 30 days (`API_REFRESH_TTL_DAYS`) | **HttpOnly** cookie (`nebula_refresh`, path `/v1/auth`) or native secure storage | obtain new access tokens |

- Claims: `{ sub, role, sid }`. `sid` is the current session id.
- `requireAuth` verifies the JWT **and** re-loads the session row: revoked or expired sessions are rejected immediately, so revoking a session invalidates its outstanding access tokens.
- Refresh **rotation**: every refresh revokes the current session row and issues a new one in the same `family_id`.
- **Reuse detection**: presenting an already-rotated/revoked refresh token revokes the entire token family (`revoked_reason = reuse_detected`), assuming theft.

## 5. Session lifecycle endpoints

- `POST /v1/auth/logout` — revokes the caller's session and clears the cookie.
- `GET /v1/auth/sessions` — lists the account's active sessions (device, IP, timestamps, `current`).
- `DELETE /v1/auth/sessions/:id` — revokes one owned session.
- `POST /v1/auth/sessions/revoke-all` — revokes every session except the current one.

## 6. Cookies, CORS and CSRF

- Refresh/logout use a single origin-restricted CORS policy with `credentials:true`; the allowed origin is exactly `API_CORS_ORIGIN`.
- Cookie attributes are configurable: `API_COOKIE_SECURE`, `API_COOKIE_SAME_SITE`, `API_COOKIE_DOMAIN`. Cross-site deployments (Vercel web + Render API) require `Secure` + `SameSite=None`.
- Cookie-authenticated endpoints (`refresh`, `logout`) **require** the `x-nebula-client` header. This forces a CORS preflight and blocks classic cross-site form CSRF, which cannot set custom headers.

## 7. Audit trail

Sensitive actions are recorded in `audit_events`: `account_registered`, `login_succeeded`, `login_failed`, `logout`, `token_refreshed`, `refresh_failed`, `session_family_revoked`, `session_revoked`, `sessions_revoked_all`, `invite_created`, `invite_accepted`, `invite_rejected`. Actor, target, IP and user-agent are captured.

## 8. Not implemented (blocked or deferred)

- **Email verification / password reset** — require a transactional email provider that is not configured. No fake "email sent" flow is presented.
- **2FA, account lockout** — deferred.
- **Native secure storage (Keychain/Keystore)** — belongs to the mobile phases.

## 9. Configuration reference

| Variable | Default | Meaning |
|---|---|---|
| `NEBULA_ALLOW_REGISTRATION` | `false` | enable public registration (keep false in production) |
| `API_ACCESS_TTL_SECONDS` | `900` | access-token lifetime |
| `API_REFRESH_TTL_DAYS` | `30` | refresh/session lifetime |
| `API_COOKIE_NAME` | `nebula_refresh` | refresh cookie name |
| `API_COOKIE_SECURE` | `NODE_ENV==='production'` | `Secure` flag |
| `API_COOKIE_SAME_SITE` | `lax` (dev) / `none` (secure) | `SameSite` policy |
| `API_COOKIE_DOMAIN` | unset | cookie domain for shared subdomains |
| `NEBULA_OWNER_EMAIL`, `NEBULA_OWNER_PASSWORD` | — | bootstrap CLI only (`OWNER_EMAIL`/`OWNER_PASSWORD` accepted as fallback) |
