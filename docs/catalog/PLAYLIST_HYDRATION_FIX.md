# Private playlist hydration — catalog limit regression

## Root cause and fix
`AccountPlaylistTracks` loaded `GET /v1/library/cloud` (legacy hard limit of 500 newest entries) and joined its IDs against `GET /v1/playlists/:id/items` in the browser. Correctly saved tracks older than the first 500 became **Referencia no disponible**. It also transferred up to 500 tracks just to display a short playlist.

The owner-protected playlist-items endpoint now uses SQL `LEFT JOIN` directly against its referenced `cloud_tracks` and `external_library_items`, constrained by the authenticated owner and ready status. The response preserves existing item IDs and adds `cloud` and `external` metadata. Raw R2 object keys are omitted; signed covers (when configured) expire after 3600s and replies are `no-store`.

The React playlist now consumes these entries directly, no longer downloads two full catalogs, and invalidates pending requests if the selected playlist or account changes. Removing and playing a private track preserves the existing account authorization checks and signed R2 audio URL renewal.

## Tests
- Database fixture includes 501 newer owner-owned cloud files plus one older ready song in a playlist. Confirm legacy catalog does not return the older song, but the playlist endpoint does and does not leak its R2 object key.
- An unrelated user's request for the playlist returns 404.
- Existing playlist create/rename/delete, external references and Playwright flows continue under CI.

## Remaining
This fixes **catalog-induced invisibility**, not the separate cap of 500 **entries per playlist**. Paginating large playlists and atomic playlist reorder are later work, ideally with keyset pagination and proper per-playlist ordered positions. No migration or new env vars are needed.
