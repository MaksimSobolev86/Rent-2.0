-- Run once if login fails with: column "photo_url" does not exist
ALTER TABLE owners ADD COLUMN IF NOT EXISTS photo_url TEXT;
