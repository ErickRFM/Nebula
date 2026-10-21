-- NÉBULA C10: allow saving metadata references from Internet Archive.
-- This migration only broadens the provider validation; it does NOT copy music,
-- alter ownership, remove existing references, or add public data access.
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace
  WHERE ns.nspname='public' AND rel.relname='external_library_items'
    AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%provider%'
  ORDER BY con.conname LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.external_library_items DROP CONSTRAINT %I',constraint_name);
  END IF;
END $$;
ALTER TABLE public.external_library_items
  ADD CONSTRAINT external_library_items_provider_check
  CHECK (provider IN ('jamendo','openverse','audius','internetarchive'));
