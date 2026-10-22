# NÉBULA V2 — Immutable R2 artwork tickets and recovery

## Fix (PR after #70)

Before this change, a cover was uploaded to a fixed `users/<owner>/<track-id>.png` or `.jpg`. A cancelled or superseded signed PUT could overwrite the live object before its commit, while the database still pointed at the old image.

The new flow uses **versioned immutable keys**:

1. An authenticated owner requests `POST /v1/library/cloud/:id/cover-ticket` with exact type and size.
2. The API issues a unique R2 object key, an AWS signed PUT and a **10-minute signed opaque token**. The token binds the owner ID, track ID, object key, expected prior cover, content type, size and expiration. HMAC is domain-separated from AWS signing; the secret is never returned.
3. Browser uploads directly to private R2 using the returned PUT. It calls `POST /v1/library/cloud/:id/cover-complete` with only the token.
4. API validates the token, checks owner and ready track, HEAD-verifies object existence and exact content type/size, then does a conditional SQL update (**compare-and-swap** against previous cover key). Competing older uploads return HTTP 409 without overwriting or deleting the winner.
5. Successful repeated confirmations are idempotent. A prior cover is deleted best effort **only after** the new pointer commits. A signed GET is returned with 1-hour expiry.
6. Browser cover images recover from expired GETs via `GET /v1/library/cloud/:id/cover` (owner-scoped). They retry once, never store bearer URLs persistently and fall back to an icon if renewal fails. Results from previous accounts are ignored.

## Security and operation

- No schema change after `0015`; no new environment variables. `R2_SECRET_ACCESS_KEY` is used for HMAC with a distinct context string.
- Validate only PNG/JPEG (up to 256 KiB) and rate-limit cover-ticket requests.
- Never log or persist a cover ticket or signed R2 URL. Avoid analytics collection of signed URL query strings.
- The old web client cannot complete a cover ticket with the new endpoint. Roll out the new API and web together during a short maintenance window; **do not deploy the API alone while an old web build is live**. Supabase migration `0015` must already be applied.
- Aborted or superseded unique R2 objects are **unreferenced but not yet garbage collected**. A future scheduled, operator-reviewed cleanup must list stale image objects and cross-check database references before deletion. Never apply a blanket R2 lifecycle rule to the full user's music prefix.
- A signed image GET is a bearer URL that may remain usable until its TTL. This is not instant revocation.
- Physical upload of artwork from two phones and acoustic Party Sound QA remain separate release checks.

## Tests

Unit tests validate owner and track scoping, non-reuse of keys, signature tampering, expiry, size/type. PostgreSQL API integration tests verify unauthorized accounts, invalid types, R2 size mismatch, stale-ticket CAS 409, idempotent retry and that the private object key is not disclosed.

Release gate: merge only with CI typecheck + unit + PostgreSQL migrate/API integration + build + Playwright desktop/mobile + Android APK success. Confirm full production deployment SHA in Vercel before calling the release live.
