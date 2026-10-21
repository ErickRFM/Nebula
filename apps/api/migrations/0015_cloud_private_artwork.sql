-- An album cover is another private R2 object under the same user's prefix.
-- Audio objects, auth and RLS remain unchanged.
ALTER TABLE public.cloud_tracks ADD COLUMN IF NOT EXISTS cover_object_key text;
