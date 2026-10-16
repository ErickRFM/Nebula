# NÉBULA · Master Status

Last updated: 2026-10-15.

Legend: ✅ delivered & tested · 🟡 partial · ⛔ blocked (needs owner/infrastructure) · ⬜ not started

| Phase | Scope | Status | Notes |
|---|---|---|---|
| 00 | Baseline audit | ✅ | `docs/audits/NEBULA_BASELINE.md` |
| 01 | Privacy, accounts, sessions | ✅ | `AUTH_SECURITY.md`; P0-1/P0-2/P1-3 closed |
| 02 | Music model in PostgreSQL | ⬜ | only `users/playlists/sessions/invites/audit_events` exist |
| 03 | Private cloud library / import | ⛔⬜ | needs R2 credentials; adapter to be built |
| 04 | Metadata pipeline (FFmpeg) | ⛔⬜ | worker can be built; storage blocked |
| 05 | Private streaming | ⛔⬜ | needs storage |
| 06 | Playlists / favorites sync | 🟡 | server playlists are name-only |
| 07 | Search / large library | ⬜ | client filter over local library only |
| 08 | Private admin | 🟡 | owner invites + user list; storage/admin pending |
| 09 | Android / iOS | ⛔⬜ | no native project; needs SDK/signing |
| 10 | Offline / advanced audio | ⬜ | — |

## Current MVP blockers

1. **Cloudflare R2** bucket + scoped keys (upload/stream storage).
2. **Render** deployment authorization for the API service.
3. **Managed PostgreSQL** for production (currently dev/CI only).
4. **Vercel access control** for the private UI.
5. **Email provider** for verification/password reset.
6. **macOS/Xcode + Apple signing** for iOS.

No fake integrations are presented for these; code that can be built behind adapters will proceed first.

## Verified quality gates (local)

- `npm run typecheck` ✅ (web + api)
- `npm test` ✅ 16 passed, 10 integration skipped locally (run in CI with PostgreSQL)
- `npm run build` ✅ (Next static export + api tsc)
