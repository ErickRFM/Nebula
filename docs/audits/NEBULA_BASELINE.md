# NÉBULA Music — Baseline Audit (Fase 00)

- **Repository:** `https://github.com/ErickRFM/Nebula`
- **Branch audited:** `main`
- **Commit (HEAD):** `8613a4f` — *feat(f04): account portal and server playlists (#7)*
- **Audit date:** 2026-10-15
- **Method:** static repository inspection + commands executed locally (recorded below). This document records **what actually exists**, not what is planned.

> This audit is the factual starting point for the NÉBULA Private Cloud MVP. Anything marked ✅ exists and is exercised by a test or a build step; anything marked ⚠️/❌ either has a gap or does not exist.

---

## 1. Commands actually executed (evidence)

| Command | Result |
|---|---|
| `git log --oneline -8` | HEAD `8613a4f`; history: f04 #7 → lockfile #6 → f03 #5 → f02 #4 → f01 #1 → init |
| `git branch -a` | `main` = `origin/main`; feature branches `chore/reproducible-lockfile`, `feat/f01..f04`; **`feat/f05-android-preview-build` points at `8613a4f` (identical to main — no work)** |
| `git rev-list --left-right --count origin/main...main` | `0	0` (in sync, nothing ahead/behind) |
| `gh run list --repo ErickRFM/Nebula` | Latest `main` run `38800802793` = **success** (2m30s); PR runs of f04/chore also success |
| `gh pr list --state open` | **No open PRs** |
| `node --version` / `npm --version` | `v24.18.0` / `11.16.0` |
| `npm run typecheck` | ✅ web + api pass |
| `npm test` (vitest) | ✅ **12 passed, 3 skipped** (integration skipped — no `NEBULA_TEST_DATABASE_URL`) |
| `npm run build` | ✅ Next.js static export (2/2) + `tsc` API build |
| `docker ps` | ❌ Docker not available on this machine |
| `Test-NetConnection 127.0.0.1:5432` | ❌ No local PostgreSQL |

**Consequence:** unit tests and builds are verified locally. Integration tests (`apps/api/src/app.test.ts`) are **gated** and run only with a database; they execute in **GitHub Actions** (Postgres service container) but could not be re-run locally in this session.

---

## 2. What exists today (verified)

### 2.1 Monorepo
- npm workspaces: `apps/web`, `apps/api`, `packages/player-core` (`package.json`).
- TypeScript strict, shared `tsconfig.base.json`.
- Scripts: `dev`, `build`, `typecheck`, `test`, `check`, `api:dev`, `api:build`, `db:migrate`, `test:e2e`, `mobile:sync`.
- **No `lint` script and no linter configured.**

### 2.2 Web (`apps/web`)
- Next.js 15.5 / React 19, `output: 'export'` (static export → **no server routes / API routes / middleware**).
- Single route `/`; `NebulaApp.tsx` is a client-side screen state machine (inicio/buscar/biblioteca/playlists/salas/ajustes/cuenta/reproductor).
- Cosmic Glass UI. Design identity is defined and consistent.
- Player: `useLocalAudio.ts` using raw `HTMLAudioElement` + Media Session API; queue logic in `@nebula/player-core`.
- Local library: IndexedDB store `songs` (Blob audio, 100 MB/file, 50 files/selection).
- Local playlists/favorites/volume in `localStorage` (validated parse).
- Account screen fetches `/v1/*` with a Bearer token kept **only in React state** (lost on refresh).
- `NEXT_PUBLIC_API_URL` is the only public env var (non-secret).
- Fictional, **non-playable** demo catalog (`catalog.ts`) shown with "Vista previa" labels.

### 2.3 API (`apps/api`)
- Fastify 5, Postgres via `pg` + Drizzle ORM.
- Password hashing: scrypt (16-byte salt, 64-byte key, constant-time compare).
- JWT access token only (`@fastify/jwt`), `expiresIn: '15m'`, secret ≥ 32 chars enforced.
- Routes: `/v1/health`, `/v1/auth/register`, `/v1/auth/login`, `/v1/me`, and playlist CRUD (`GET/POST/PATCH/DELETE /v1/playlists`).
- Ownership checks on all playlist mutations; Zod validation on all inputs.
- Rate limiting: global 120/min, register 8/min, login 12/min.
- CORS restricted to a single configured origin, `credentials:false`. **No cookies.**
- Tables: **only** `users` and `playlists`. Migration: **only** `0001_init.sql` (applied by a custom `migrate.mjs`, no drizzle-kit journal).

### 2.4 CI/CD & Infra
- `.github/workflows/web.yml`: one job — `npm ci` → migrate → typecheck → test → build → Playwright (chromium) with a Postgres 16 service. Runs on push/PR to `main`.
- `compose.yaml`: dev-only Postgres, bound to `127.0.0.1`, hardcoded dev password.
- `.env.example`: placeholders only, no real secrets.
- `capacitor.config.ts`: root config only; **no native platform added**.

### 2.5 Tests
- Unit: player-core queue rules (7), password hashing (1), `parsePlaylists` (2), `local-library` constants (2).
- Integration: `app.test.ts` (3 tests) — health, register/login/me, cross-account playlist isolation — **gated by `NEBULA_TEST_DATABASE_URL`**.
- E2E: `nebula.spec.ts` (5 tests, desktop + mobile) — navigation, local playlist persistence, IndexedDB import persistence, PWA manifest; account/cloud test **skipped unless `NEXT_PUBLIC_API_URL` set**.

---

## 3. Findings by severity

### P0 — Security / data-loss / core blocked

| ID | Finding | Location | Impact |
|---|---|---|---|
| P0-1 | **Public open registration** with no invite/verification gate | `apps/api/src/app.ts:44` | Anyone can create an account on the private library. Directly violates the "no public registration" requirement. |
| P0-2 | **No session/refresh model** — 15-min access token, no revocation | `app.ts:36,51,65`; no `sessions` table | A leaked/issued token cannot be revoked; logout is client-only. Required for Fase 01. |
| P0-3 | **No music storage/streaming backend at all** | entire `apps/api` | The core product (private cloud library: upload → process → stream from any device) does not exist server-side. No R2/S3, no upload, no ffmpeg, no signed URLs. |
| P0-4 | **Web has no server-side protection** (static export) | `apps/web/next.config.ts` (`output:'export'`) | The UI cannot gate access server-side; privacy must be enforced by an access layer (Vercel protection / auth gateway) + the API. Not yet configured. |

### P1 — Incomplete / defective functionality

| ID | Finding | Location | Impact |
|---|---|---|---|
| P1-1 | Playlists local (localStorage) and remote (server, name-only) are **disjoint**; remote playlists have **no tracks** | `usePlaylists.ts`, `useAccount.ts`, `AccountPanel.tsx:49` | No real synchronized library. Fase 06 blocked. |
| P1-2 | Library is **browser-local only**; not visible on other devices | `local-library.ts` (IndexedDB) | Fails the MVP test "download/see from another device". |
| P1-3 | No roles (OWNER/MEMBER); no authorization beyond ownership | `app.ts` | Cannot distinguish owner/admin from invited members. |
| P1-4 | No password reset, no email verification, no session listing | `app.ts` | Account lifecycle incomplete. |
| P1-5 | No audit log; `logger:false` discards `request.log.error` | `app.ts:33,111` | No observability or security trail on a sensitive system. |
| P1-6 | Integration tests never run locally without DB; no coverage gate | `app.test.ts:7` | Regressions in DB/auth paths can pass local checks. |
| P1-7 | Demo/fictional content mixed into real screens | `catalog.ts`, `NebulaApp.tsx` | Prompt requires removing fictitious elements once real backend data exists. |

### P2 — Performance / UX / maintainability

| ID | Finding | Location | Impact |
|---|---|---|---|
| P2-1 | No linter / no `lint` script | root `package.json` | Style drift; CI does not lint. |
| P2-2 | No pagination/index strategy beyond one index; single-route client nav | `schema.ts`, `NebulaApp.tsx` | Will not scale to tens of thousands of tracks. |
| P2-3 | No security headers, no Helmet/HSTS, `logger:false` | `app.ts` | Hardening gap. |
| P2-4 | Google Fonts loaded from third-party CDN | `globals.css:1` | Privacy/offline dependency for a private app. |
| P2-5 | No TanStack Query / no shared client store; ad-hoc `fetch` | `useAccount.ts` | Duplicated remote-state logic as features grow. |
| P2-6 | No `vercel.json` / deploy config in repo | repo root | Deployment is implicit; not reproducible. |

### P3 — Optional improvements

- P3-1 No PWA service worker (only a manifest).
- P3-2 No 2FA, no account lockout after repeated failures.
- P3-3 No storage quotas / usage tracking.
- P3-4 Native `android/`/`ios/` projects never scaffolded; `feat/f05-android-preview-build` is empty.

---

## 4. Security red flags — checklist result

| Check | Status |
|---|---|
| Tokens in localStorage/IndexedDB/URL | ✅ Not present (token in React memory only) |
| `NEXT_PUBLIC_*` secrets | ✅ None (only `NEXT_PUBLIC_API_URL`) |
| Missing auth on data routes | ✅ All data routes use `requireAuth` |
| Permissive CORS | ✅ Single origin, `credentials:false` |
| Missing input validation | ✅ Zod on all inputs, 50 KB body limit |
| Real secrets committed | ✅ None (placeholders/dev-only creds) |
| **Open registration / abuse surface** | ❌ `POST /v1/auth/register` public, no verification |
| Public bucket / permanent audio URLs | ✅ N/A (no storage exists yet — must be designed private) |
| Revocable sessions | ❌ None |
| Security headers / structured logs | ❌ None |

---

## 5. Immediate fixes required before continuing

Per the master prompt, P0 items must be corrected before further work:

1. **P0-1 → close public registration**; introduce private account provisioning (invite/bootstrap).
2. **P0-2 → session model** with refresh-token rotation, server-side revocation, and logout.
3. P1-3 → OWNER/MEMBER roles; P1-5 → audit + structured logging.

P0-3/P0-4 depend on external infrastructure (Cloudflare R2, Render, Vercel access control) and are **blocked pending owner credentials/authorization** (see §7). All code, schemas, adapters, migrations and tests that do not require live infrastructure will be implemented first.

---

## 6. Fase → status at baseline

| Fase | Scope | Baseline status |
|---|---|---|
| 00 | Audit | ✅ This document |
| 01 | Privacy / accounts / sessions | ❌ Not started (P0-1, P0-2, P1-3 open) |
| 02 | Music model in PostgreSQL | ❌ Only `users`+`playlists` |
| 03 | Private cloud library / import | ❌ Browser-local only |
| 04 | Metadata pipeline | ❌ None |
| 05 | Private streaming | ❌ None |
| 06 | Playlists / favorites sync | ❌ Disjoint local/remote |
| 07 | Search / large library | ❌ None (client filter over demo catalog) |
| 08 | Private admin | ❌ None |
| 09 | Android / iOS | ❌ No native project |
| 10 | Offline / advanced audio | ❌ None |

---

## 7. External blockers (require owner decision/credentials)

| Blocker | Needed for | Status |
|---|---|---|
| Cloudflare R2 bucket + limited-access keys | Fase 03–05 (upload/stream) | **Not provided** — will implement behind a storage adapter + tests with an S3-compatible test double |
| Render account/workspace authorization | API deploy | **Not authorized** — will not create resources |
| Managed PostgreSQL instance | Fase 02+ persistence | **Not provided** — migrations + schema developed and validated in CI's Postgres |
| Vercel project access-control / domain | P0-4 UI protection | **Not configured** — will document options, not enable paid features |
| macOS/Xcode + Apple signing | iOS (Fase 09) | **Not available in this environment** |

No credentials were invented and no infrastructure was created during this audit.

---

## 8. Baseline verification result

- Typecheck: **pass**
- Unit tests: **12 pass / 3 skipped**
- Build (web static export + api tsc): **pass**
- CI on `main`: **green**
- Working tree at audit start: 2 modified generated files (`next-env.d.ts`, `tsconfig.json` touched by `next build`) — to be normalized.

**Conclusion:** the current codebase is a **well-structured, honestly-documented prototype** (local library + auth + server playlist metadata). It is **not** yet a private cloud music platform. The next block of work is Fase 01 (P0-1, P0-2, P1-3).
