-- Add original_language column to movies table
ALTER TABLE movies ADD COLUMN IF NOT EXISTS original_language TEXT;

-- Backfill from tmdb_data JSONB (all seeded movies have this)
UPDATE movies SET original_language = tmdb_data->>'original_language'
WHERE original_language IS NULL AND tmdb_data IS NOT NULL;
