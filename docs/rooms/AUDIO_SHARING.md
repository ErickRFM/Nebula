# Room audio access (F12.3)

Room members are **not** automatically authorized to stream the owner's R2 files.

1. Host selects a ready, owner-owned cloud track in the room timeline.
2. Host explicitly enables sharing with `POST /v1/rooms/:id/sharing` and `{ "enabled": true, "rightsConfirmed": true }`.
3. Authenticated members request `GET /v1/rooms/:id/audio`.
4. Server checks membership, room active state, current track, owner and `share_enabled`.
5. Server returns a **300-second** presigned R2 GET URL. It is never persisted in the database.
6. Host can disable sharing, close the room or rotate invitation codes.

**Important:** signed URLs are bearer capabilities and can remain usable until expiry after revocation. Sharing must only be enabled for audio the host is authorized to redistribute to participants. This is not a DRM system and does not provide per-user revocation of an already-issued URL. Production R2 e2e and real multi-device audio QA remain pending.

## Per-track consent when changing shared audio

When sharing is enabled, changing the selected track through `POST /v1/rooms/:id/timeline` requires `rightsConfirmed: true` for the **new** track. The check is part of the same revision-guarded SQL UPDATE; a stale request cannot bypass it. Pausing, resuming or seeking the same track does not require re-confirmation. Removing the track does not require confirmation. The owner UI sends confirmation after the user checks the rights box. Queue entries already require explicit rights confirmation when added.

A confirmation is the host's assertion, not an independent license verification. This control reduces accidental sharing and is not authorization to redistribute copyrighted music.
