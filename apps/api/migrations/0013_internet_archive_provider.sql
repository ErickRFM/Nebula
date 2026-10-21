-- NÉBULA C10: extend the existing allowed providers; no stored music is moved.
-- Migration is repeatable and executes transactionally in the migration runner.
ALTER TABLE public.external_library_items
  DROP CONSTRAINT IF EXISTS external_library_items_provider_check;
ALTER TABLE public.external_library_items
  ADD CONSTRAINT external_library_items_provider_check
  CHECK (provider IN ('jamendo','openverse','audius','internetarchive'));
