# NÉBULA V2 — Scale, metadata, resumable playback and Party Sound QA

**Base audited:** `main@5e918d07000ad2d4746ee484c648c241370a4ade`. Reconfirm commit and migration state before any production release.

## Implemented in this PR
- **Cloud search at scale:** `GET /v1/library/cloud/search?q=&limit=25&cursor=` is authenticated and applies user ownership, ready status, normalized Spanish-diacritic search, and stable `created_at, id` keyset pagination. Supports empty query for browsing, 1–50 results and no `OFFSET` scans. `GET /v1/library/cloud/pending` returns pending items without transferring the legacy 500-item list. Old endpoints remain for compatibility. The text-matching expression is not full-text indexed yet; huge user libraries still warrant PostgreSQL trigram/full-text search with performance measurements.
- **Private uploads:** migration `0014_cloud_catalog_v2.sql` adds `album`, `genre`, nullable `sha256`, owner-specific hash uniqueness and a pagination index. Existing songs retain defaults. Browser computes SHA-256 for newly uploaded files (up to 100 MB), refuses incompatible/oversized files, and skips identical files under the same account. Another user may legitimately own the same bytes. Hashes of earlier uploads remain null until backfilled; no destructive merge of duplicates.
- **Metadata/art:** bounded ID3v2.3/v2.4 & ID3v1, FLAC Vorbis comments and M4A/iTunes metadata; embedded PNG/JPEG artwork up to 256 KiB is stored with local IndexedDB entries, with filename fallback on malformed files. Large images never become data URLs. R2 database retains album/genre but **does not yet store permanent cloud artwork**; cross-device artwork needs a separate signed image-object workflow.
- **Playback continuity:** the existing `useLocalAudio` player accepts transient private R2 URL renewers, obtains new authenticated leases, restores timestamp and paused/playing state, retries after temporary outages and avoids changing the provider playback model. The room player already renews its own leases. Signed links remain short-lived and logout cannot revoke a previously issued URL until it expires.
- **Party Sound QA:** a per-room local analyzer accepts a 2-channel single-clock recording, reports median and P95 absolute acoustic delay, and exports anonymizable JSON with route and device descriptions. Analysis requires actual equipment; no physical evidence is created by CI.

## Required deployment sequence
1. Verify migrations through `0013` already applied in the intended NÉBULA Supabase project. Apply `0014` **before** deploying the updated API; never run this on SIII or another project.
2. Run CI: `npm run db:migrate` against disposable test PostgreSQL; `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` and Android APK build.
3. Deploy the API backend and verify `/v1/health`; verify `/v1/library/cloud/search` returns 401 without auth and paged data only for the owner, and that duplicates return HTTP 409.
4. Deploy the matching Web/Android version. Confirm SHA in Vercel and test an owner MP3, FLAC and M4A from a real account. Do not report production DONE if Vercel is still quota-blocked.

## Physical acceptance matrix — NOT yet executed
1. Two phones A/B, independent NÉBULA accounts and a host-owned R2 test file, same stable Wi-Fi.
2. Compare connection RTT/clock offset, play/pause/next and reconnect; check temporary audio URL renewal after five minutes and media controls in background and screen off.
3. Repeat on Bluetooth A2DP on phone B; record OS, firmware, codec and physical setup. Captures must use **one reference recorder** with separately isolated channels.
4. Record ten impulse trials, import stereo WAV into the QA panel, export JSON. Use P95, median and per-output calibration; do not claim guaranteed phase synchronization.
5. Repeat on different Wi-Fi/cellular networks with controlled packet loss, verify room auth, invite invalidation, host transfer and audio rights confirmations.

## Work that still cannot be marked 100%
- Permanent cover storage for R2 + independent cloud thumbnail pipeline.
- Streaming SHA-256 hashing for constrained mobile RAM; WebCrypto currently buffers a selected file (max 100 MB) in memory.
- Retryable multipart uploads and real background mobile audio/cross-platform recovery.
- Indexed full-text search benchmark for libraries substantially above 10,000 entries.
- Actual tests on two phones, Bluetooth, locked screen and acoustic measurements.

Reference: `docs/rooms/PHYSICAL_QA.md`, `docs/rooms/ACOUSTIC_QA.md`, Issue #64.
