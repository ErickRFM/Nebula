# NÉBULA API — Contracts (Fase 01)

Base path `/v1`. All bodies are JSON. Errors are `{ "error": "<code>" }`.

Authentication: send `Authorization: Bearer <accessToken>` on protected routes. Cookie-authenticated routes additionally require the header `x-nebula-client: <id>`.

## Public

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | — | `200 {status,database}` | `503` degraded |
| GET | `/auth/config` | — | `200 {registrationOpen}` | — |
| POST | `/auth/login` | `{email,password}` | `200 {user,accessToken,expiresInSeconds}` + refresh cookie | `400 invalid_credentials_format`, `401 invalid_credentials`, `429 rate_limited` |
| POST | `/auth/register` | `{email,password}` | `201 {user,accessToken,expiresInSeconds}` + cookie | `403 registration_closed` (default), `409 account_already_exists` |
| POST | `/auth/accept-invite` | `{token,email,password}` | `201 {user,accessToken,expiresInSeconds}` + cookie | `400 invalid_invite_payload`, `401 invalid_invite`, `409 account_already_exists` |
| POST | `/auth/refresh` | optional `{refreshToken}` | `200 {accessToken,expiresInSeconds}` + rotated cookie | `400 missing_client_header`, `401 missing_refresh_token`/`invalid_refresh_token`/`refresh_token_reused`/`refresh_token_expired` |
| POST | `/auth/logout` | — | `204` | `400 missing_client_header` |

`user` = `{ id, email, role }` where `role` is `owner|member`.

## Authenticated (Bearer)

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/me` | — | `200 {user}` |
| GET | `/auth/sessions` | — | `200 {items:[{id,userAgent,ip,createdAt,lastUsedAt,expiresAt,current}]}` |
| DELETE | `/auth/sessions/:id` | — | `204` / `404 session_not_found` |
| POST | `/auth/sessions/revoke-all` | — | `200 {revoked:true}` |
| GET | `/playlists` | — | `200 {items:[{id,name,createdAt}]}` |
| POST | `/playlists` | `{name}` | `201 {playlist}` |
| PATCH | `/playlists/:id` | `{name}` | `200 {playlist}` / `404 playlist_not_found` |
| DELETE | `/playlists/:id` | — | `204` / `404 playlist_not_found` |

Catalog and library routes (added by the catalog phases) are likewise Bearer-protected: `GET /discovery/providers`, `GET /discovery/search?q=&page=&limit=&provider=`, `GET /metadata/musicbrainz?q=&limit=`, `GET|POST /library/external`, `DELETE /library/external/:provider/:externalId`.

## Owner only (Bearer, `role=owner`)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/admin/invites` | `{email?}` | `201 {invite:{id,email,expiresAt}, token}` |
| GET | `/admin/users` | — | `200 {items:[{id,email,role,createdAt}]}` |

Non-owner calls to owner routes return `403 forbidden`. Unauthenticated calls return `401 unauthorized`.

## Shared error codes

`unauthorized`, `forbidden`, `rate_limited`, `server_error`.

## Status

Implemented and covered by integration tests in CI (health, registration policy, owner bootstrap/invite, member provisioning, role enforcement, session listing, refresh rotation with reuse detection, logout revocation). Audio/storage endpoints (phases 03–05) are not part of this contract yet.
