# F12.5 — Durable room queue

Authenticated room members can read the queue. Only the host can add or remove ready, owner-owned cloud tracks. Host operations are serialized with a room row lock; queue positions are unique, capacity is 200 and advance uses a compare-and-swap room revision.

`POST /v1/rooms/:id/next` requires opt-in room sharing, pops the first available track and schedules it 3 seconds in the future. An unavailable/deleted cloud track cannot be played.

This is **not yet a collaborative DJ queue**. Guest suggestions, voting, cross-owner media rights, presence, and precise realtime are future phases.
