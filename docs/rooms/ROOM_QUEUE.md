# F12.5 — Durable room queue

Authenticated room members can read the queue. Only the host can add or remove ready, owner-owned cloud tracks. Host operations are serialized with a room row lock; queue positions are unique, capacity is 200 and advance uses a compare-and-swap room revision.

`POST /v1/rooms/:id/next` requires opt-in room sharing, pops the first available track and schedules it 3 seconds in the future. An unavailable/deleted cloud track cannot be played.

This is **not yet a collaborative DJ queue**. Guest suggestions, voting, cross-owner media rights, presence, and precise realtime are future phases.

## F12.11 — Host queue reordering

`PATCH /v1/rooms/:id/queue/reorder` accepts `{ "itemIds": ["uuid", "..."] }` with a complete, unique ordered list (2–200 items). Only the current host may reorder. The server locks the room and queue rows, rejects stale or partial lists with HTTP 409, and uses a temporary disjoint positive position range to satisfy the immediate unique constraint. Reordering is atomic; no playlist or track is copied. The Rooms UI exposes up/down controls to the host. CI tests verify guest denial, stale-list rejection, persisted order and idempotent no-op.
