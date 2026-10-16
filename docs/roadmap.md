# NÉBULA · Roadmap

- **F00 (design/spec)**: product boundaries, visual UI concepts, licensing policy. Design approved conceptually; rights handling still requires implementation and legal review.
- **F01 (this PR)**: reproducible Next.js workspace, React Cosmic Glass shell, seven navigable areas, functional in-browser local audio, typed queue rules, tests and CI.
- **F02 local**: persistent browser library, editable playlists and responsive E2E QA (delivered).
- **F03 API foundation**: Fastify, PostgreSQL, schema, account registration/login, bearer JWT and per-user playlist CRUD (delivered).
- **F05 private accounts**: public registration disabled by default, OWNER bootstrap CLI, invitation-only provisioning, OWNER/MEMBER roles, revocable sessions with refresh-token rotation and reuse detection, audit events (delivered). See `docs/architecture/AUTH_SECURITY.md`.
- **F06 cloud library**: private object storage (Cloudflare R2), upload/import pipeline, FFmpeg metadata worker, authorized streaming (next).
- **F07 sync**: playlists/favorites/history synchronized from PostgreSQL; IndexedDB becomes a cache.
- **F08 native**: Capacitor Android/iOS adapters; Media3/AVFoundation background playback and Bluetooth physical QA.
- **F09 offline**: secure offline downloads, device control and rights enforcement.

The web UI, the local browser library and the API are functional. Private cloud storage, streaming and native playback do not exist yet. Do not present prototype content as a real catalog.
