# F04 · Account UI and cloud playlist metadata

The web app contains a **Cuenta** screen with register/login, a 15-minute in-memory bearer token, logout, server playlist creation/list/delete, and explicit error handling.

The web client uses `NEXT_PUBLIC_API_URL` at build time; configure it only with a trusted API endpoint. The server must permit the exact web origin in `API_CORS_ORIGIN`.

**Limits:** No login persistence across refresh, no refresh tokens/revocation, no 2FA/password reset, no audio upload to the server, no remote playlist tracks, no device synchronization. Login results are never saved in localStorage, IndexedDB or URL. These are required before a public production launch.

The browser E2E suite runs against a disposable PostgreSQL service and API in GitHub Actions; no production data is accessed.
