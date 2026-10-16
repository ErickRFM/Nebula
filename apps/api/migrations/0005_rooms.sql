-- F12: private, authenticated room lifecycle. Additive migration.
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  mode varchar(16) NOT NULL CHECK (mode IN ('listening','party')),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  invite_hash varchar(64) NOT NULL UNIQUE,
  invite_expires_at timestamptz NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  track_id uuid REFERENCES cloud_tracks(id) ON DELETE SET NULL,
  playback_status varchar(16) NOT NULL DEFAULT 'paused' CHECK (playback_status IN ('playing','paused')),
  position_ms integer NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS rooms_owner_created_idx ON rooms(owner_user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('host','listener')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members(user_id, joined_at DESC);
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
-- Supabase has anon/authenticated roles; vanilla PostgreSQL CI does not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE rooms, room_members FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE rooms, room_members FROM authenticated';
  END IF;
END $$;
