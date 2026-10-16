CREATE TABLE IF NOT EXISTS external_library_items (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(20) NOT NULL CHECK (provider IN ('jamendo','openverse','audius')),
  external_id varchar(160) NOT NULL,
  title varchar(200) NOT NULL,
  artist varchar(200) NOT NULL,
  artwork_url text,
  source_url text NOT NULL,
  license_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, external_id)
);
CREATE INDEX IF NOT EXISTS external_library_user_created_idx
 ON external_library_items(user_id,created_at DESC);
