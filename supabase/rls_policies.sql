-- Aaybee Row Level Security Policies
-- Run this AFTER schema.sql

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

-- ============================================
-- MOVIES POLICIES (Public read, authenticated insert)
-- ============================================

-- Anyone can read movies (including anonymous)
DROP POLICY IF EXISTS "Movies are viewable by everyone" ON movies;
CREATE POLICY "Movies are viewable by everyone"
  ON movies FOR SELECT
  USING (true);

-- Authenticated users can insert new movies (for lazy-loading from TMDb)
DROP POLICY IF EXISTS "Authenticated users can insert movies" ON movies;
CREATE POLICY "Authenticated users can insert movies"
  ON movies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only service role can update/delete movies
-- (No policy needed - defaults to deny)

-- ============================================
-- USER_PROFILES POLICIES
-- ============================================

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profile is auto-created by trigger, but allow manual insert as fallback
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================
-- USER_MOVIES POLICIES
-- ============================================

-- Users can view their own movie data
DROP POLICY IF EXISTS "Users can view own movies" ON user_movies;
CREATE POLICY "Users can view own movies"
  ON user_movies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own movie data
DROP POLICY IF EXISTS "Users can insert own movies" ON user_movies;
CREATE POLICY "Users can insert own movies"
  ON user_movies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own movie data
DROP POLICY IF EXISTS "Users can update own movies" ON user_movies;
CREATE POLICY "Users can update own movies"
  ON user_movies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own movie data
DROP POLICY IF EXISTS "Users can delete own movies" ON user_movies;
CREATE POLICY "Users can delete own movies"
  ON user_movies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- COMPARISONS POLICIES
-- ============================================

-- Users can view their own comparisons
DROP POLICY IF EXISTS "Users can view own comparisons" ON comparisons;
CREATE POLICY "Users can view own comparisons"
  ON comparisons FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own comparisons
DROP POLICY IF EXISTS "Users can insert own comparisons" ON comparisons;
CREATE POLICY "Users can insert own comparisons"
  ON comparisons FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Comparisons are immutable - no update/delete policies
-- (Historical record should not be modified)

-- ============================================
-- GLOBAL_MOVIE_STATS POLICIES
-- ============================================
ALTER TABLE global_movie_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can read global stats (public data)
DROP POLICY IF EXISTS "Global stats are viewable by everyone" ON global_movie_stats;
CREATE POLICY "Global stats are viewable by everyone"
  ON global_movie_stats FOR SELECT
  USING (true);

-- Authenticated users can insert global stats (for recalculation)
DROP POLICY IF EXISTS "Authenticated can insert global stats" ON global_movie_stats;
CREATE POLICY "Authenticated can insert global stats"
  ON global_movie_stats FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update global stats (for recalculation)
DROP POLICY IF EXISTS "Authenticated can update global stats" ON global_movie_stats;
CREATE POLICY "Authenticated can update global stats"
  ON global_movie_stats FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- USER_MOVIES AGGREGATION POLICY
-- ============================================
-- Allow reading ALL user_movies for global aggregation and recommendations
DROP POLICY IF EXISTS "Users can read all movies for aggregation" ON user_movies;
CREATE POLICY "Users can read all movies for aggregation"
  ON user_movies FOR SELECT
  TO authenticated
  USING (true);
