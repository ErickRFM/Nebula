-- NÉBULA V2: metadata and dedup for private R2 objects.
-- Idempotent for direct Supabase application and the Node migration runner.
ALTER TABLE public.cloud_tracks
  ADD COLUMN IF NOT EXISTS album varchar(200) NOT NULL DEFAULT 'Archivos importados',
  ADD COLUMN IF NOT EXISTS genre varchar(120) NOT NULL DEFAULT 'Mis canciones',
  ADD COLUMN IF NOT EXISTS sha256 varchar(64);

-- Two accounts may store identical bytes, but one account cannot reserve
-- identical content more than once. Existing uploads have NULL hashes.
CREATE UNIQUE INDEX IF NOT EXISTS cloud_tracks_owner_sha256_unique
  ON public.cloud_tracks (user_id, sha256) WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS cloud_tracks_owner_ready_page
  ON public.cloud_tracks (user_id, created_at DESC, id DESC) WHERE status = 'ready';

-- Existing RLS and role revokes from migration 0004 remain unchanged.
