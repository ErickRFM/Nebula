# ADR-001 · Next.js web-first + mobile native adapters

**Status:** Accepted · 2026-10-15

## Decision

- Next.js App Router + TypeScript serves as the shared UI and browser client.
- The initial build is static-exportable (`output: export`) for Capacitor; API/database/WebSockets will be hosted separately.
- Shared playback rules live in `packages/player-core`, while concrete engines are platform adapters.
- Web playback uses `HTMLAudioElement`; native Android Media3/iOS AVFoundation adapters are future stages and must not be represented as completed.
- This foundation only plays user-selected local audio within the current browser session. Example songs are visual placeholders, not licensed streams.

## Consequences

- No Next.js dynamic server routes, Server Actions, or filesystem-backed uploads in the mobile export.
- The API must enforce ownership, rights, quotas and signed streaming URLs before cloud import is enabled.
- Capacitor iOS builds require macOS/Xcode; both mobile platforms require physical background-audio validation.
