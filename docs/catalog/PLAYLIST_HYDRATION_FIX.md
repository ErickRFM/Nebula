# Private playlist hydration — catalog limit regression

## Root cause and fix
`AccountPlaylistTracks` loaded `GET /v1/library/cloud` (legacy hard limit of 500 newest entries) and joined its IDs against `GET /v1/playlists/:id/items` in the browser. Correctly saved tracks older than the first 500 became **Referencia no disponible**. It also transferred up to 500 tracks just to display a short playlist.

The owner-protected playlist-items endpoint now uses SQL `LEFT JOIN` directly against its referenced `cloud_tracks` and `external_library_items`, constrained by the authenticated owner and ready status. The response preserves existing item IDs and adds `cloud` and `external` metadata. Raw R2 object keys are omitted; signed covers (when configured) expire after 3600s and replies are `no-store`.

The React playlist now consumes these entries directly, no longer downloads two full catalogs, and invalidates pending requests if the selected playlist or account changes. Removing and playing a private track preserves the existing account authorization checks and signed R2 audio URL renewal.

## Tests
- Database fixture includes 501 newer owner-owned cloud files plus one older ready song in a playlist. Confirm legacy catalog does not return the older song, but the playlist endpoint does and does not leak its R2 object key.
- An unrelated user's request for the playlist returns 404.
- Existing playlist create/rename/delete, external references and Playwright flows continue under CI.

## Playlist pagination

The authenticated `GET /v1/playlists/:id/items` now supports `?limit=50&cursor=<playlist-item-uuid>`. It returns `{items,hasMore,nextCursor}`; clients without query parameters retain the legacy 500-item default to avoid changing older app behavior. The web app requests 50 and displays **Mostrar más canciones**.

Pagination compares PostgreSQL `(created_at,id)` tuples against the selected cursor row directly in SQL to preserve microsecond timestamps. A cursor must exist within the already-authorized playlist. This rejects deleted/foreign cursors with HTTP 400 after the owner check and prevents duplicate or missing rows when many entries share close creation times. The integration test loads 502 items across 11 pages and asserts every ID appears once.

## Remaining
Automatic infinite scrolling, playlist order reconfiguration, and syncing the currently playing queue after playlist edits are later work. No migration or new env vars are needed.
