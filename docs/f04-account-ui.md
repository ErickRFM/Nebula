# F04 · Account UI and cloud playlist metadata

> **Superseded by F05 (private accounts).** See `docs/architecture/AUTH_SECURITY.md`. The behaviours below that describe temporary, in-memory-only sessions and open registration no longer apply.

The web app contains a **Cuenta** screen with login, session management (list/revoke devices), logout, and server playlist creation/list/delete.

The web client uses `NEXT_PUBLIC_API_URL` at build time; configure it only with a trusted API endpoint. The server must permit the exact web origin in `API_CORS_ORIGIN`.

**Behaviour (F05):** the account model is private — there is no public registration in the UI, and the login form explains that access is by invitation. The access token is held in memory only; the session persists through an HttpOnly refresh cookie that is rotated on each refresh and can be revoked from the account screen.

**Limits:** no email verification/password reset/2FA yet, and remote playlists still store only name and owner (no tracks or audio sync). These are required before a production launch.

The browser E2E suite runs against a disposable PostgreSQL service and API in GitHub Actions; no production data is accessed.
