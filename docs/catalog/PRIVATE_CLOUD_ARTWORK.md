# Private album covers in Cloudflare R2 — NÉBULA V2

## Implementation

- Migration `0015_cloud_private_artwork.sql` adds nullable `cloud_tracks.cover_object_key`; existing music remains unchanged.
- New authenticated endpoints:
  - `POST /v1/library/cloud/:id/cover-ticket` validates PNG/JPEG, 12–262144 bytes and confirms the ready music track belongs to the current account; returns a 10-minute signed PUT.
  - `POST /v1/library/cloud/:id/cover-complete` independently checks owner, a ready track, object presence, size and content type in R2 before storing the artwork key. It returns a 1-hour private signed GET.
- Search, browse, playlist metadata now project the ephemeral `coverUrl`, never expose the storage key.
- A track's cover is stored at `users/<owner uuid>/<track uuid>.png` or `.jpg` in the *same private bucket*. R2 signing is restricted to exact image/png and image/jpeg; SVG/HTML/GIF cannot be signed as covers.
- Browser imports small embedded ID3/FLAC/M4A covers when uploading authorized audio. Art failure never deletes an otherwise successfully uploaded song.
- Existing cloud tracks expose a manual Change Cover action; both search and playback reuse the signed cover URL, not a second database.

## Boundaries and risks

- Only the authenticated owner can issue signed artwork URLs. Signed GET may remain accessible to anyone holding the token for up to 3600 s; treat it as a bearer capability, not a public URL. Do not log full URLs.
- The browser limits covers to 256 KiB and checks their magic header. This is a client-side best-effort validation, not a complete antivirus or image transcoding service. Server verifies metadata but does not decode image pixels.
- Upload tickets for a single track and extension overwrite the same object. Do not publish cover-edit UI to untrusted operators; future work may use versioned immutable cover IDs and cleanup of aborted uploads.
- Browser images can expire after one hour if a long-lived view never reloads; on the next authenticated catalog refresh a new signed URL is created. A dedicated refresh scheduler is a future refinement.
- R2 CORS must permit signed PUT image/png and image/jpeg from allowed web origins; never use a wildcard origin with credentials.
- Neither this PR nor automated CI completes the physical acoustic QA of Party Sound.

## Release sequence
1. PostgreSQL CI passes migration 0015 after 0014, automated tests and build.
2. Apply migration 0015 only in NÉBULA Supabase project `cznvepkwccnxvqnsiusl`. Validate the column, RLS and privileges.
3. Deploy updated authenticated API first; verify R2 image PUT, HEAD and signed GET using a test track.
4. Deploy matching web commit on Vercel. If Vercel returns quota 402, do not claim web production is updated.
5. Test embedded artwork from MP3/FLAC/M4A and manual picture change on two distinct devices/accounts.
