-- Favorites are private per-user references, never copies of external audio.
CREATE TABLE IF NOT EXISTS favorite_items (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 cloud_track_id uuid REFERENCES cloud_tracks(id) ON DELETE CASCADE,
 external_item_id uuid REFERENCES external_library_items(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT favorite_items_one_source CHECK (
 (cloud_track_id IS NOT NULL AND external_item_id IS NULL) OR
 (cloud_track_id IS NULL AND external_item_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS favorite_items_owner_cloud ON favorite_items(user_id,cloud_track_id) WHERE cloud_track_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS favorite_items_owner_external ON favorite_items(user_id,external_item_id) WHERE external_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS favorite_items_owner_created ON favorite_items(user_id,created_at);
ALTER TABLE favorite_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON TABLE favorite_items FROM anon'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON TABLE favorite_items FROM authenticated'; END IF;
END $$;
