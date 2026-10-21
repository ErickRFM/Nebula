-- NÉBULA: durable per-account playlist membership for already-owned cloud files
-- and references saved in the user's external library.
-- No migration or deletion of browser-local playlists.
CREATE TABLE IF NOT EXISTS playlist_items (
 id uuid PRIMARY KEY,
 playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 cloud_track_id uuid REFERENCES cloud_tracks(id) ON DELETE CASCADE,
 external_item_id uuid REFERENCES external_library_items(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT playlist_items_one_source CHECK (
   (cloud_track_id IS NOT NULL AND external_item_id IS NULL)
   OR (cloud_track_id IS NULL AND external_item_id IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_unique_cloud ON playlist_items(playlist_id,cloud_track_id) WHERE cloud_track_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_unique_external ON playlist_items(playlist_id,external_item_id) WHERE external_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS playlist_items_playlist_created ON playlist_items(playlist_id,created_at,id);
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  EXECUTE 'REVOKE ALL ON TABLE playlist_items FROM anon';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  EXECUTE 'REVOKE ALL ON TABLE playlist_items FROM authenticated';
 END IF;
END $$;
