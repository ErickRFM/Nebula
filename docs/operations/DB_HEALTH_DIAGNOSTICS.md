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

## Safe Supabase pooler diagnostics

Some pooler failures use SQLSTATE `XX000`. Known message patterns are classified internally as `pooler_configuration` (tenant/username mismatch), `credentials`, or `pooler_capacity`. The original message is **never** logged.

The health log also emits a safe connection shape: `valid`, `kind` (pooler/direct/other), `poolerUsername` boolean, and port. It does **not** emit hostname, username, database, password or URI. For a Supabase pooler, expect `kind=pooler` and `poolerUsername=true`. Never copy the full URI into chat.
