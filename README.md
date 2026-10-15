# NÉBULA Music · Cosmic Glass

Next.js + React + TypeScript foundation for a future cross-platform personal music platform.

## Quick start

Requires Node.js 20.11+ and npm 10+.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. To verify: `npm run check`.

## What works in F01

- Responsive Cosmic Glass navigation: Inicio, Buscar, Biblioteca, Playlists, Salas, Ajustes, and full-screen player.
- Real audio playback **only** after choosing your own local music files, with progress/seek/volume/next/previous, shuffle and repeat.
- User-local favorites and preferences; examples in the catalogue are fictional preview data and **are not playable**.
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

Only import files you own or are authorized to play. Files selected through the browser remain on the device; NÉBULA F01 does not upload them. Object URLs are revoked on teardown. This is an engineering foundation, not a licensed streaming service.

See [ADR-001](docs/architecture/ADR-001-web-first.md) and [roadmap](docs/roadmap.md).
