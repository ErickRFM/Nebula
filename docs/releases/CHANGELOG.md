# NÉBULA · Changelog

## Unreleased

### Added (Fase 01 — private accounts & sessions)
- OWNER/MEMBER roles and private provisioning: public registration disabled by default, `owner:bootstrap` CLI, single-use invitation flow.
- Revocable sessions: `sessions`, `invites`, `audit_events` tables (migration `0003_private_accounts.sql`).
- Refresh-token rotation with reuse detection (token families) and HttpOnly refresh cookies.
- Session endpoints: list, revoke one, revoke all others.
- Audit events for sensitive actions.
- Configurable cookie/CORS/session policy (`src/config.ts`).
- Versioned, idempotent migration runner with `schema_migrations` tracking.
- Docs: `audits/NEBULA_BASELINE.md`, `architecture/AUTH_SECURITY.md`, `api/API_CONTRACTS.md`, `roadmap/MASTER_STATUS.md`.
- Tests: token unit tests; integration tests for the full account/session lifecycle.

### Changed
- Web account screen: login-only, session persistence via refresh cookie, device/session management.
- API bootstraps from `loadConfig` with env overrides; CORS now sends credentials; `x-nebula-client` header required for cookie endpoints.
