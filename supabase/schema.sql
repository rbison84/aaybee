-- Aaybee Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. MOVIES TABLE (Global movie catalog)
-- ============================================
CREATE TABLE IF NOT EXISTS movies (
  id TEXT PRIMARY KEY,                    -- TMDb ID format: 'tmdb-603'
  tmdb_id INTEGER,                        -- Numeric TMDb ID
  title TEXT NOT NULL,
  year INTEGER,
  genres TEXT[] DEFAULT '{}',
  poster_url TEXT,
  poster_path TEXT,                       -- TMDb poster path (for different sizes)
  poster_color TEXT DEFAULT '#1a1a2e',    -- Fallback color
  emoji TEXT DEFAULT '🎬',                 -- Fallback emoji
  overview TEXT,
  vote_count INTEGER DEFAULT 0,           -- For tier calculation
  vote_average NUMERIC(3,1) DEFAULT 0,    -- TMDb rating
  tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 5),  -- 1-4 for comparisons, 5 for search-only
  collection_id INTEGER,                  -- Franchise/collection grouping
  collection_name TEXT,
  director_name TEXT,
  director_id INTEGER,
  certification TEXT,
  original_language TEXT,
  tmdb_data JSONB,                        -- Full TMDb response for future use
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for searching and filtering movies
CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);
CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_tier ON movies(tier);
CREATE INDEX IF NOT EXISTS idx_movies_vote_count ON movies(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_movies_collection_id ON movies(collection_id);

-- ============================================
-- 2. USER_PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  favorite_genres TEXT[] DEFAULT '{}',
  birth_decade INTEGER,
  movie_prime_start INTEGER,
  movie_prime_end INTEGER,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  total_comparisons INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. USER_MOVIES TABLE (Per-user movie data)
-- ============================================
CREATE TABLE IF NOT EXISTS user_movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  beta NUMERIC DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  total_comparisons INTEGER DEFAULT 0,
  times_shown INTEGER DEFAULT 0,
  last_shown_at BIGINT,                   -- Timestamp in milliseconds
  status TEXT DEFAULT 'uncompared' CHECK (status IN ('uncompared', 'known', 'uncertain', 'unknown')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_movies_user_id ON user_movies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_status ON user_movies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_movies_beta ON user_movies(user_id, beta DESC);

-- ============================================
-- 4. COMPARISONS TABLE (Comparison history)
-- ============================================
CREATE TABLE IF NOT EXISTS comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_a_id TEXT NOT NULL REFERENCES movies(id),
  movie_b_id TEXT NOT NULL REFERENCES movies(id),
  choice TEXT NOT NULL CHECK (choice IN ('A', 'B', 'skip')),
  movie_a_beta_before NUMERIC,
  movie_a_beta_after NUMERIC,
  movie_b_beta_before NUMERIC,
  movie_b_beta_after NUMERIC,
  comparison_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_comparisons_user_id ON comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created_at ON comparisons(user_id, created_at DESC);

-- ============================================
-- 5. UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS update_movies_updated_at ON movies;
CREATE TRIGGER update_movies_updated_at
  BEFORE UPDATE ON movies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_user_movies_updated_at ON user_movies;
CREATE TRIGGER update_user_movies_updated_at
  BEFORE UPDATE ON user_movies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 6. GLOBAL MOVIE STATS TABLE (Aggregated rankings)
-- ============================================
CREATE TABLE IF NOT EXISTS global_movie_stats (
  movie_id TEXT PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
  global_beta NUMERIC DEFAULT 0,
  total_global_wins INTEGER DEFAULT 0,
  total_global_losses INTEGER DEFAULT 0,
  total_global_comparisons INTEGER DEFAULT 0,
  unique_users_count INTEGER DEFAULT 0,
  average_user_beta NUMERIC DEFAULT 0,
  median_user_beta NUMERIC DEFAULT 0,
  percentile_25 NUMERIC DEFAULT 0,
  percentile_75 NUMERIC DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ranking queries
CREATE INDEX IF NOT EXISTS idx_global_stats_beta ON global_movie_stats(global_beta DESC);
CREATE INDEX IF NOT EXISTS idx_global_stats_comparisons ON global_movie_stats(total_global_comparisons DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_global_stats_updated_at ON global_movie_stats;
CREATE TRIGGER update_global_stats_updated_at
  BEFORE UPDATE ON global_movie_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 7. AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 8. FUZZY SEARCH FUNCTION (uses pg_trgm)
-- ============================================
CREATE OR REPLACE FUNCTION search_movies_fuzzy(search_query TEXT, result_limit INT DEFAULT 20)
RETURNS TABLE (
  id TEXT, tmdb_id INT, title TEXT, year INT, genres TEXT[],
  poster_url TEXT, poster_path TEXT, poster_color TEXT,
  overview TEXT, vote_count INT, vote_average NUMERIC,
  tier INT, collection_id INT, collection_name TEXT,
  director_name TEXT, director_id INT, certification TEXT,
  original_language TEXT
) LANGUAGE sql STABLE AS $$
  SELECT m.id, m.tmdb_id, m.title, m.year, m.genres,
         m.poster_url, m.poster_path, m.poster_color,
         m.overview, m.vote_count, m.vote_average,
         m.tier, m.collection_id, m.collection_name,
         m.director_name, m.director_id, m.certification,
         m.original_language
  FROM movies m
  WHERE similarity(m.title, search_query) > 0.1
     OR m.title ILIKE '%' || search_query || '%'
  ORDER BY similarity(m.title, search_query) DESC, m.vote_count DESC
  LIMIT result_limit;
$$;

-- ============================================
-- 9. RECOMMENDATION FEEDBACK TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('dismissed', 'seen_it', 'watchlisted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_feedback_user ON recommendation_feedback(user_id);

ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feedback"
  ON recommendation_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feedback"
  ON recommendation_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own feedback"
  ON recommendation_feedback FOR DELETE USING (auth.uid() = user_id);
