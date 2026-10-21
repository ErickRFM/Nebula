-- NÉBULA V2: additive private catalog, no rewriting audio objects.
ALTER TABLE public.cloud_tracks
  ADD COLUMN IF NOT EXISTS album varchar(200) NOT NULL DEFAULT 'Archivos importados',
  ADD COLUMN IF NOT EXISTS genre varchar(120) NOT NULL DEFAULT 'Mis canciones',
  ADD COLUMN IF NOT EXISTS sha256 varchar(64);

ALTER TABLE public.cloud_tracks
  ADD CONSTRAINT cloud_tracks_sha256_hex CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');

-- Two users may upload the same file. Only identical files belonging to one
-- user must be rejected. Pending uploads also reserve hashes to avoid races.
CREATE UNIQUE INDEX IF NOT EXISTS cloud_tracks_owner_sha256_unique
  ON public.cloud_tracks (user_id, sha256) WHERE sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS cloud_tracks_owner_ready_page
  ON public.cloud_tracks (user_id, created_at DESC, id DESC) WHERE status = 'ready';

-- Existing RLS and revokes from 0004 remain in force.
