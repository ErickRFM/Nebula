# WebSocket end-to-end smoke test

The CI integration suite now opens a **real network WebSocket connection** to the NÉBULA Node gateway using disposable PostgreSQL data. It checks an authenticated room event, single-use ticket consumption and replay rejection. SSE also rechecks the underlying session for revocation or expiry on every tick. The tests execute only against CI PostgreSQL, without production account credentials.

These results prove gateway wiring for Node 22 and local Fastify/Postgres, **not** the complete Vercel production handshake, long-lived reliability or synchronized acoustic playback. Leave `NEXT_PUBLIC_NEBULA_WS_ENABLED` disabled until a controlled production canary with authenticated accounts confirms those behaviors.
