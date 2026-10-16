-- F12.3: room-scoped sharing is opt-in and disabled by default.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false;
