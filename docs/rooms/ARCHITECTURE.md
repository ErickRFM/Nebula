# F12 — Rooms / Party Sound (implementation status)

## What is implemented in this PR
- `@nebula/room-sync`: pure four-timestamp clock estimation, RTT filtering, authoritative timeline projection, device output latency/calibration, bounded drift correction and monotonic revision gating.
- Unit tests for malformed probes, outliers, pause/scheduled starts and drift.

## What this does **not** implement
This package **does not create rooms, play audio, transmit audio, connect Bluetooth speakers, or provide realtime transport**. No real-device latency measurements exist yet. Do not advertise Party Sound as working.

## Architecture and constraints
1. Each device plays an individually authorized audio source; room events synchronize state, **not copyrighted audio bytes**.
2. Use a durable PostgreSQL room snapshot, server-issued revision and server effective timestamp. Future gateway must authenticate participants and reject replay.
3. Realtime transport must use a persistent gateway or managed provider; Vercel Functions are not a persistent WebSocket host. Polling is a viable degraded fallback but cannot guarantee tight acoustic sync.
4. Clock samples use a monotonic client clock with an explicit wall-clock bridge where needed; never compare unrelated monotonic epochs directly.
5. Browser autoplay requires a user gesture; Bluetooth audio routing is controlled by the OS and varies by device. Audio output latency and acoustic propagation require physical calibration.
6. Local IndexedDB files cannot be accessed on another device. Private R2 playback must authorize each room participant explicitly; never leak the owner's signed URLs.
7. Prefer low-RTT clock probes and schedule starts ahead of time. Rate correction is bounded to 2%; seek on larger drift. On pause/track change reset playbackRate to 1.
8. Validate permission/licensing before enabling a track in a shared room.

## Next integration work
- PostgreSQL schema: rooms, memberships, invite codes, timeline revisions, queue, device timing profiles.
- Authenticated REST lifecycle with transactional authorization and rate limits.
- Frontend join/create/leave, playback and clock-probe adapter.
- Realtime gateway with reconnection and replay protection.
- Audio output selection when supported, user-controlled Bluetooth pairing and calibration.
- CI E2E + physical measurements across Android, iOS and Bluetooth speakers.

**Release gate:** only mark Rooms/Party Sound verified after real audio on multiple devices, permission tests, reconnection tests and measured acoustic drift.
