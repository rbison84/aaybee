-- Add missing columns to movies table for comprehensive tier system
-- Run this migration before populating movies

-- Add tmdb_id for easy reference
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;

-- Add voting stats for tier calculation
ALTER TABLE movies ADD COLUMN IF NOT EXISTS vote_count INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS vote_average NUMERIC(3,1) DEFAULT 0;

-- Add tier (1-4) computed from vote_count ranking
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 4);

-- Add poster path (TMDb's path, not full URL)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS poster_path TEXT;

-- Add collection/franchise info for tier grouping
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_id INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_name TEXT;

-- Add director info
ALTER TABLE movies ADD COLUMN IF NOT EXISTS director_name TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS director_id INTEGER;

-- Create index on tmdb_id for lookups
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);

-- Create index on tier for filtering
CREATE INDEX IF NOT EXISTS idx_movies_tier ON movies(tier);

-- Create index on vote_count for sorting
CREATE INDEX IF NOT EXISTS idx_movies_vote_count ON movies(vote_count DESC);

-- Create index on collection_id for franchise grouping
CREATE INDEX IF NOT EXISTS idx_movies_collection_id ON movies(collection_id);
