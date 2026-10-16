# Audius C04 · Public ungated stream (best effort)

- Search on `https://api.audius.co/v1/tracks/search` with explicit `filter_tracks=public` and `gate_condition=ungated`.
- Show a stream button ONLY when track metadata confirms `is_stream_gated === false` and release is not scheduled.
- Playback URL: the documented `/v1/tracks/{id}/stream` public endpoint. Browser clients request the provider directly; response redirects, CORS and availability still depend on Audius.
- Never use `canDownload` or `canStorePrivateCopy` for Audius without independent rights authorization.
- Block gated/premium/future releases from being presented as playable.
- Cross-browser live-stream validation is required before marking this provider as fully production-ready.
