CREATE TABLE IF NOT EXISTS cloud_tracks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  title varchar(200) NOT NULL,
  artist varchar(200) NOT NULL DEFAULT 'Mi música',
  mime_type varchar(80) NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 104857600),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cloud_tracks_user_created_idx ON cloud_tracks (user_id, created_at DESC);

-- Supabase public schema must never expose private music metadata via PostgREST.
ALTER TABLE public.cloud_tracks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cloud_tracks FROM anon, authenticated;
