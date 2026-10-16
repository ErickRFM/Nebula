-- F12.5: durable, owner-managed private cloud track queue.
CREATE TABLE IF NOT EXISTS room_queue_items (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES cloud_tracks(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, position)
);
CREATE INDEX IF NOT EXISTS room_queue_items_room_position_idx ON room_queue_items(room_id, position);
ALTER TABLE room_queue_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE room_queue_items FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE room_queue_items FROM authenticated';
  END IF;
END $$;
