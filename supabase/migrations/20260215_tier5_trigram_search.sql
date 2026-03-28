-- Widen tier constraint from 1-4 to 1-5
ALTER TABLE movies DROP CONSTRAINT IF EXISTS movies_tier_check;
ALTER TABLE movies ADD CONSTRAINT movies_tier_check CHECK (tier >= 1 AND tier <= 5);

-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram GIN index on title for fast fuzzy search
CREATE INDEX IF NOT EXISTS idx_movies_title_trgm ON movies USING GIN (title gin_trgm_ops);
