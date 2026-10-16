# NÉBULA — Vercel API (same origin)

The web remains a Next.js static export (Capacitor-compatible). Vercel builds
the \`apps/web/api/index.ts\` Node Function and rewrites \`/v1/*\` to it.
This function delegates requests to the existing Fastify API via \`app.inject\`,
so the authorization, provider integrations and routes are not duplicated.

## Production environment variables (Vercel project nebula)

- \`DATABASE_URL\` (Sensitive): **Supabase NÉBULA project only**, preferably
  its **transaction pooler** URI; never use the SII database.
- \`API_JWT_SECRET\` (Sensitive): random secret, 32+ characters.
- \`NEXT_PUBLIC_USE_SAME_ORIGIN_API=true\` (Plain): enables \`/v1\` in the web UI.
- \`API_CORS_ORIGIN=https://nebula-er-i1.vercel.app\` (Plain).
- \`API_COOKIE_SECURE=true\`, \`API_COOKIE_SAME_SITE=lax\` (Plain).
- \`NEBULA_ALLOW_REGISTRATION=false\` (Plain; default false).
- Optional \`JAMENDO_CLIENT_ID\` for Jamendo; Audius and Openverse do not require
  it.

After configuring environment variables, deploy \`main\` again so that the
\`NEXT_PUBLIC_*\` build-time value is included in the browser bundle.

## Verification

- \`GET https://nebula-er-i1.vercel.app/v1/health\` should return
  \`{"status":"ok","database":"connected"}\`.
- \`GET /v1/auth/config\` returns the public-registration flag (false).
- \`GET /v1/discovery/search?q=test\` returns 401 without a session.
- With a bootstrapped OWNER account, login, search, save an external reference,
  and create a playlist through the UI.

The account bootstrap remains an explicit one-time operation. Do **not** enable
public registration in production just to test the search UI.

For mobile static builds, omit \`NEXT_PUBLIC_USE_SAME_ORIGIN_API\` and configure
\`NEXT_PUBLIC_API_URL\` to the HTTPS API origin.
