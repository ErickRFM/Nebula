CREATE TABLE IF NOT EXISTS room_ws_tickets (
 token_hash varchar(64) PRIMARY KEY,
 room_id uuid NOT NULL, user_id uuid NOT NULL,
 session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (room_id,user_id) REFERENCES room_members(room_id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS room_ws_tickets_expiry_idx ON room_ws_tickets(expires_at);
ALTER TABLE room_ws_tickets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON room_ws_tickets FROM anon'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON room_ws_tickets FROM authenticated'; END IF;
END $$;
