# NÉBULA — F12 Rooms execution status

Updated 2026-10-16. Source of truth is the current GitHub main SHA, CI and production health; do not treat code merges as physical certification.

## Integrated PRs
- #28–#33: clock and drift core, private rooms, invite rotation, R2 sharing, playback, queue, renewal, initial E2E.
- #34: OWNER invitation UI, atomic MEMBER redemption.
- #35: filtered room clock probes, per-output local calibration profiles and diagnostics.
- #36: atomic rights confirmation for changing shared tracks.
- #37: sanitized database health diagnostics.
- #38: host transfer, member moderation, shared-IP rate-limit resilience and stable room polling.
- #39: private fragment-based invite links with login return flow.
- #40: Supabase XX000 pooler diagnostics without secret exposure.
- #41: optional browser `setSinkId` audio output selection with OS fallback.
- #42: atomic host queue reorder, integration tests, and shared-Wi-Fi join limit adjustment.

Last merged main at this checkpoint: `ca0b843380a43469e95daefaf5a021c5db264cd2`. Verify before reuse.

## Verified by automated CI
- Typecheck, unit tests, DB-backed API tests, web build, API build and Playwright E2E are required on PRs.
- PR #42 completed successfully before merge.
- Prior main CI passed on `1d2237c`; check CI for newer main after each merge.
- New room tests cover host transfer, membership, queue order, rights confirmation, clock and output profile helpers.

## Production blocker — action required
- Vercel `/v1/health` returned HTTP 503 with `database=unavailable` during this session.
- Supabase SQL Editor successfully queried the dedicated NÉBULA project.
- Safe Vercel diagnostics reported `category=pooler_configuration`, `code=XX000`, `kind=pooler`, `poolerUsername=false`, `port=5432`.
- The **Production** `DATABASE_URL` pooler username needs the project suffix: `postgres.cznvepkwccnxvqnsiusl`. The existing Vercel variable is marked sensitive and cannot be decrypted through the connected tool, so it was **not** altered. Never paste the URI or password into issues, chat or Git.
- Operator: update Production `DATABASE_URL` from Supabase Connect > Session pooler in Vercel Environment Variables, redeploy, verify health=200 and OWNER login. Do not create a new database.
- Vercel READY means the deployment compiled; it does **not** prove database connectivity.

## Not complete — do not claim release
- Dedicated low-latency authenticated realtime gateway. Current browser state transport still polls (~3s).
- Physical acoustic synchronization with two phones and a Bluetooth speaker, latency/drift measurements and screen-lock/background validation.
- Full DJ/voting permissions, guest queue proposals, QR generator and native app output routing.
- End-to-end real MP3 upload/playback on R2 with cross-device permission checks.
- Cross-provider shared streaming with rights checks and source availability for every participant.
- Production health recovery, production login smoke tests and release sign-off.

## Next executable steps
1. Recover production PostgreSQL pooler configuration (requires operator action on sensitive Vercel variable).
2. Execute real R2 upload/playback and two-phone room test with owned/authorized MP3.
3. Choose and provision an authenticated realtime gateway with sustainable WebSocket/SSE transport; do not claim low-latency Party Sound until deployed.
4. Add DJ/voting and any native-only capabilities based on verified requirements.
5. Record physical evidence in `docs/rooms/PHYSICAL_QA.md`, then certify or document platform-specific limitations.

No background work is implied by this checkpoint; resume from the verified main HEAD and current PR list.

## PS-03 — Registro de salidas de sala (rama en desarrollo)

Se agregó el registro privado de dispositivos con `0008_room_devices.sql`, permisos de propietario y estados de presencia. El panel de salas permite que cada participante active expresamente **su propio** receptor y consulte los receptores registrados. Cada dispositivo necesita habilitar el audio de forma local; no se activa el altavoz de otros usuarios.

Esto no implementa todavía NSD/mDNS, transmisión Bluetooth, gateway Realtime, Media3 ni sincronización acústica certificada. Requiere migración, CI y prueba con dispositivos físicos antes de considerarse liberado.

