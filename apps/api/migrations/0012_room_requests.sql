-- PS-10: Private DJ track suggestions. Metadata only, no media redistribution.
CREATE TABLE IF NOT EXISTS room_requests (
 id uuid PRIMARY KEY,
 room_id uuid NOT NULL,
 user_id uuid NOT NULL,
 title varchar(120) NOT NULL,
 artist varchar(120) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(room_id,id),
 FOREIGN KEY(room_id,user_id) REFERENCES room_members(room_id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS room_requests_room_created_idx ON room_requests(room_id,created_at DESC);
CREATE TABLE IF NOT EXISTS room_request_votes (
 room_id uuid NOT NULL,
 request_id uuid NOT NULL,
 user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,user_id),
 FOREIGN KEY(room_id,request_id) REFERENCES room_requests(room_id,id) ON DELETE CASCADE,
 FOREIGN KEY(room_id,user_id) REFERENCES room_members(room_id,user_id) ON DELETE CASCADE
);
ALTER TABLE room_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_request_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  EXECUTE 'REVOKE ALL ON room_requests,room_request_votes FROM anon';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  EXECUTE 'REVOKE ALL ON room_requests,room_request_votes FROM authenticated';
 END IF;
END $$;
