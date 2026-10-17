# Production database health diagnostics

The public `GET /v1/health` response remains generic (no connection details). If the database probe fails, Vercel runtime logs now emit `[nebula:health] database probe failed` with a **sanitized SQLSTATE / network code and category only**.

- `credentials`: verify the database password, pooler user, URL encoding and Vercel environment scope **without copying secrets into tickets or chat**.
- `network`: check DNS, region reachability and Supabase pooler availability.
- `timeout`: check connection limits, pooler saturation and network.
- `tls`: check TLS trust and pooler settings.
- `schema`: check migration consistency.
- `unknown`: inspect provider diagnostics securely; do not print connection strings.

A successful Supabase SQL Editor query proves the database itself works but does **not** prove that the deployed Vercel `DATABASE_URL` can authenticate. Production failures must be diagnosed from sanitized logs, not by repeatedly creating databases or pasting URIs.

**Release gate:** `/v1/health` returns 200 with `database=connected` and OWNER login succeeds after each deployment. If health is degraded, block release.
