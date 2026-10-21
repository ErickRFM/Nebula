-- PS-03: room-scoped opt-in receiver registry; not physical device discovery.
CREATE TABLE IF NOT EXISTS room_devices (
  room_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  label varchar(80) NOT NULL,
  platform varchar(16) NOT NULL CHECK (platform IN ('web','android','ios','desktop')),
  output_enabled boolean NOT NULL DEFAULT false,
  playback_state varchar(16) NOT NULL DEFAULT 'idle'
    CHECK (playback_state IN ('idle','ready','buffering','playing','error')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(room_id,id),
  FOREIGN KEY(room_id,user_id) REFERENCES room_members(room_id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS room_devices_user_room_idx ON room_devices(user_id,room_id);
ALTER TABLE room_devices ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE room_devices FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE room_devices FROM authenticated';
  END IF;
END $$;
