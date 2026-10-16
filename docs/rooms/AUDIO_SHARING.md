# Room audio access (F12.3)

Room members are **not** automatically authorized to stream the owner's R2 files.

1. Host selects a ready, owner-owned cloud track in the room timeline.
2. Host explicitly enables sharing with `POST /v1/rooms/:id/sharing` and `{ "enabled": true, "rightsConfirmed": true }`.
3. Authenticated members request `GET /v1/rooms/:id/audio`.
4. Server checks membership, room active state, current track, owner and `share_enabled`.
5. Server returns a **300-second** presigned R2 GET URL. It is never persisted in the database.
6. Host can disable sharing, close the room or rotate invitation codes.

**Important:** signed URLs are bearer capabilities and can remain usable until expiry after revocation. Sharing must only be enabled for audio the host is authorized to redistribute to participants. This is not a DRM system and does not provide per-user revocation of an already-issued URL. Production R2 e2e and real multi-device audio QA remain pending.
