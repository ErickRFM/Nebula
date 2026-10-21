# PS-02: Authenticated room event streaming (first delivery)

## Production-safe transport
`GET /v1/rooms/:id/events` is a bounded (23-second) SSE stream that uses the **existing NÉBULA session bearer JWT** and session-revocation guard. Only current room members can receive updates. The stream rechecks membership and closed status each second so expulsions terminate access. It emits sanitized revision and participant-count changes, not audio URLs, invite secrets, or personal information.

Browsers consume it using streaming `fetch`, with Authorization header and abortable reconnect. The previous REST state endpoint is still authoritative; periodic REST refresh remains a fallback. Frame parsing has tests for fragmentation, malformed JSON and oversized events. This integration uses no new npm dependencies or database migration.

**Not a WebSocket:** this initial low-latency transport is SSE rather than bidirectional WS. Vercel's WebSocket support is available, but a production WS adapter still requires reviewed library/lockfile changes, replay protection and load testing. SSE currently polls PostgreSQL once/sec per connected room, so monitor DB load and cap concurrent streams. Future production WS transport should use shared durable state and never rely on in-memory room state in Functions.

## Release gates
- CI migration/typecheck/unit/web/e2e.
- Unauthorized/expelled member stream must fail/close.
- Verify stream behavior in production browser network tab and on mobile networks.
- Physical Party Sound timing is explicitly NOT certified.

**Vercel routing:** `apps/web/api/index.ts` dispatches the authenticated room events GET directly to Fastify's Node HTTP request handler. Other routes continue using `inject()` to preserve the existing Vercel body adapter. Streaming through `inject()` is explicitly forbidden because it buffers until the SSE response ends.

## Authenticated WebSocket candidate (feature gated)

The gateway is `apps/web/api/room-ws.ts`, served as a Vercel Node Function. The browser obtains an ephemeral ticket via authenticated `POST /v1/rooms/:id/ws-ticket` and offers it **only as a WebSocket subprotocol**, not a URL query. The gateway consumes the ticket from `room_ws_tickets` once, rechecks session + membership on every event and disconnects after 22 seconds. Mutations remain on REST. `ws@8.22.0` is pinned in the application lockfile.

`NEXT_PUBLIC_NEBULA_WS_ENABLED=true` opts a same-origin build into this transport; this flag is off until gateway handshake, security and performance tests pass on Vercel. On WebSocket failure, the client returns to the existing authenticated SSE and REST fallbacks. No acrylic / acoustic synchronization is certified by WebSocket transport alone.
