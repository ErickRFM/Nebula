# NÉBULA Music · Cosmic Glass

Next.js + React + TypeScript foundation for a future cross-platform personal music platform.

## Quick start

Requires Node.js 20.11+ and npm 10+.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. To verify: `npm run check`. Browser smoke tests: `npx playwright install chromium` then `npm run test:e2e`.

## What works in F01

- Responsive Cosmic Glass navigation: Inicio, Buscar, Biblioteca, Playlists, Salas, Ajustes, and full-screen player.
- Real audio playback **only** after choosing your own local music files, with progress/seek/volume/next/previous, shuffle and repeat; selected files are now persisted in IndexedDB (subject to browser quota).
- Editable local playlists plus user-local favorites and preferences; examples in the catalogue are fictional preview data and **are not playable**.
- Pure TypeScript playback queue helpers with automated tests.
- Static export for web hosting and preparation for Capacitor builds.

## Not implemented yet

Authentication, PostgreSQL, cloud upload, streaming catalog, sync, realtime rooms, offline DRM/entitlements, native background audio, APK/IPA releases. Do not present prototype content as a real catalog.

## Structure

- `apps/web`: responsive Next.js client and player adapter.
- `packages/player-core`: transport-independent queue logic.
- `docs/`: architecture decisions and roadmap.
- `capacitor.config.ts`: shell preparation only; native projects are not generated or validated.

## Licensing and privacy

Only import files you own or are authorized to play. Files selected through the browser remain on the device; NÉBULA does not upload them. Imported blobs are stored in IndexedDB when permitted. Browser data clearing or storage eviction will remove the files. Object URLs are revoked on teardown. This is an engineering foundation, not a licensed streaming service.

See [ADR-001](docs/architecture/ADR-001-web-first.md) and [roadmap](docs/roadmap.md).

## Library persistence (F02 local)

Imported audio is saved to IndexedDB if permitted. Maximum supported import size is 100 MB per track and up to 50 files per selection. This is a per-file safety cap, **not** a promise about browser storage quota. Users can delete tracks in the Biblioteca view. Playlists are stored as metadata in localStorage and are not synchronized between browsers. Browser storage can be cleared, evicted, or blocked. No cloud account or remote backup yet.

## Optional server API (F03)

Run PostgreSQL, set DATABASE_URL and API_JWT_SECRET (32+ characters) using apps/api/README.md, then:

```bash
npm ci
npm run db:migrate
npm run api:dev
```

The API provides registration/login and playlist CRUD, but it is **not yet wired to the browser login screens**. API bearer tokens expire after 15 minutes and there is no refresh/revocation yet. Never put tokens in localStorage or commit secrets. The local browser library continues working without the API.

## Development database

Docker Compose and Windows PowerShell setup: [Local development](docs/local-development.md). The default database credentials in compose.yaml are **for localhost only** and must never be reused in production.
