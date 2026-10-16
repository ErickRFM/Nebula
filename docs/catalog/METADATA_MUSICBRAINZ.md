# MusicBrainz / Cover Art Archive (C02)

The MusicBrainz endpoint is **metadata-only**. It is NOT a music streaming provider. It never gives a right to reproduce, download, copy or transcode a recording.

- `GET /v1/metadata/musicbrainz?q=...` requires a NÉBULA session (JWT).
- Fixed upstream `https://musicbrainz.org/ws/2/recording`; never user-supplied URLs.
- Minimum 1100ms between outgoing requests within one Node process, identifiable User-Agent, timeout, bounded query and result count.
- If deployed with multiple instances, enforce the public API's aggregate rate limit via Redis or a single worker before scaling.
- Candidate cover URLs are guesses, may 404; do not treat as confirmed artwork.
- Metadata matching must require human review before overwriting manually edited title/album fields.
- No music files are downloaded.
