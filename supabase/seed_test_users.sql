-- ============================================
-- AAYBEE TEST DATA SEED
-- ============================================
-- Run this in Supabase SQL Editor
-- This populates global_movie_stats directly for testing
--
-- PREREQUISITES:
-- 1. Run schema.sql first
-- 2. Run seed_movies.sql to populate movies table
-- 3. Run rls_policies.sql
-- ============================================

-- ============================================
-- STEP 0: Check prerequisites
-- ============================================
DO $$
DECLARE
  movie_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO movie_count FROM movies;
  IF movie_count = 0 THEN
    RAISE EXCEPTION 'No movies found! Please run seed_movies.sql first.';
  END IF;
  RAISE NOTICE 'Found % movies in database', movie_count;
END $$;

-- ============================================
-- STEP 1: Add RLS policy for aggregating user_movies
-- ============================================
-- Allow authenticated users to read ALL user_movies for aggregation
-- This is needed for global rankings and recommendations

DROP POLICY IF EXISTS "Users can read others movies for recommendations" ON user_movies;
CREATE POLICY "Users can read others movies for recommendations"
  ON user_movies FOR SELECT
  TO authenticated
  USING (true);  -- Allow reading all for aggregation

-- Also allow service role / anon to read global stats
DROP POLICY IF EXISTS "Anyone can read global stats" ON global_movie_stats;
CREATE POLICY "Anyone can read global stats"
  ON global_movie_stats FOR SELECT
  USING (true);

-- Allow authenticated users to insert/update global stats (for recalculation)
DROP POLICY IF EXISTS "Authenticated users can upsert global stats" ON global_movie_stats;
CREATE POLICY "Authenticated users can upsert global stats"
  ON global_movie_stats FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- STEP 2: Populate global_movie_stats directly
-- ============================================
-- This simulates what would happen after many users have compared movies

TRUNCATE global_movie_stats;

INSERT INTO global_movie_stats (
  movie_id,
  global_beta,
  total_global_wins,
  total_global_losses,
  total_global_comparisons,
  unique_users_count,
  average_user_beta,
  median_user_beta,
  percentile_25,
  percentile_75,
  last_calculated_at
) VALUES
  -- Top Tier (universally loved)
  ('tmdb-278', 2.45, 312, 48, 360, 14, 2.35, 2.40, 1.80, 2.60, NOW()),   -- Shawshank Redemption
  ('tmdb-155', 2.32, 298, 62, 360, 14, 2.22, 2.30, 1.70, 2.50, NOW()),   -- Dark Knight
  ('tmdb-238', 2.28, 290, 70, 360, 13, 2.18, 2.25, 1.60, 2.45, NOW()),   -- Godfather
  ('tmdb-27205', 2.15, 275, 85, 360, 14, 2.05, 2.10, 1.50, 2.35, NOW()), -- Inception
  ('tmdb-157336', 2.08, 268, 92, 360, 12, 1.98, 2.05, 1.40, 2.30, NOW()),-- Interstellar
  ('tmdb-603', 2.02, 262, 98, 360, 13, 1.92, 2.00, 1.35, 2.25, NOW()),   -- Matrix

  -- High Tier
  ('tmdb-680', 1.85, 245, 115, 360, 12, 1.75, 1.80, 1.20, 2.10, NOW()),  -- Pulp Fiction
  ('tmdb-240', 1.78, 238, 122, 360, 10, 1.68, 1.75, 1.10, 2.00, NOW()),  -- Godfather II
  ('tmdb-550', 1.72, 232, 128, 360, 11, 1.62, 1.70, 1.00, 1.95, NOW()),  -- Fight Club
  ('tmdb-389', 1.68, 228, 132, 360, 9, 1.58, 1.65, 0.95, 1.90, NOW()),   -- 12 Angry Men
  ('tmdb-120', 1.65, 225, 135, 360, 10, 1.55, 1.62, 0.90, 1.85, NOW()),  -- LOTR Fellowship
  ('tmdb-424', 1.62, 222, 138, 360, 9, 1.52, 1.60, 0.85, 1.82, NOW()),   -- Schindler's List

  -- Good Tier
  ('tmdb-299534', 1.55, 215, 145, 360, 11, 1.45, 1.52, 0.80, 1.75, NOW()),-- Endgame
  ('tmdb-13', 1.52, 212, 148, 360, 12, 1.42, 1.50, 0.75, 1.72, NOW()),   -- Forrest Gump
  ('tmdb-769', 1.48, 208, 152, 360, 9, 1.38, 1.45, 0.70, 1.68, NOW()),   -- Goodfellas
  ('tmdb-497', 1.45, 205, 155, 360, 10, 1.35, 1.42, 0.65, 1.65, NOW()),  -- Green Mile
  ('tmdb-807', 1.42, 202, 158, 360, 10, 1.32, 1.40, 0.60, 1.62, NOW()),  -- Se7en
  ('tmdb-299536', 1.38, 198, 162, 360, 11, 1.28, 1.35, 0.55, 1.58, NOW()),-- Infinity War
  ('tmdb-24428', 1.35, 195, 165, 360, 10, 1.25, 1.32, 0.50, 1.55, NOW()),-- Avengers
  ('tmdb-872585', 1.32, 192, 168, 360, 8, 1.22, 1.30, 0.45, 1.52, NOW()),-- Oppenheimer

  -- Mid Tier (mixed opinions)
  ('tmdb-11', 1.25, 185, 175, 360, 9, 1.15, 1.22, 0.40, 1.45, NOW()),    -- Star Wars ANH
  ('tmdb-1891', 1.22, 182, 178, 360, 8, 1.12, 1.20, 0.35, 1.42, NOW()),  -- Empire Strikes Back
  ('tmdb-121', 1.18, 178, 182, 360, 8, 1.08, 1.15, 0.30, 1.38, NOW()),   -- LOTR Two Towers
  ('tmdb-122', 1.15, 175, 185, 360, 8, 1.05, 1.12, 0.25, 1.35, NOW()),   -- LOTR Return King
  ('tmdb-694', 1.12, 172, 188, 360, 10, 1.02, 1.10, 0.20, 1.32, NOW()),  -- Shining
  ('tmdb-597', 1.08, 168, 192, 360, 11, 0.98, 1.05, 0.15, 1.28, NOW()),  -- Titanic
  ('tmdb-862', 1.05, 165, 195, 360, 9, 0.95, 1.02, 0.10, 1.25, NOW()),   -- Toy Story
  ('tmdb-354912', 1.02, 162, 198, 360, 9, 0.92, 1.00, 0.05, 1.22, NOW()),-- Coco
  ('tmdb-12', 0.98, 158, 202, 360, 9, 0.88, 0.95, 0.00, 1.18, NOW()),    -- Finding Nemo
  ('tmdb-313369', 0.95, 155, 205, 360, 10, 0.85, 0.92, -0.05, 1.15, NOW()),-- La La Land

  -- Lower-Mid Tier
  ('tmdb-419430', 0.88, 148, 212, 360, 8, 0.78, 0.85, -0.15, 1.08, NOW()),-- Get Out
  ('tmdb-493922', 0.85, 145, 215, 360, 8, 0.75, 0.82, -0.20, 1.05, NOW()),-- Hereditary
  ('tmdb-118340', 0.82, 142, 218, 360, 8, 0.72, 0.80, -0.25, 1.02, NOW()),-- Guardians Galaxy
  ('tmdb-152601', 0.78, 138, 222, 360, 7, 0.68, 0.75, -0.30, 0.98, NOW()),-- Her
  ('tmdb-585', 0.75, 135, 225, 360, 8, 0.65, 0.72, -0.35, 0.95, NOW()),  -- Monsters Inc
  ('tmdb-4348', 0.72, 132, 228, 360, 8, 0.62, 0.70, -0.40, 0.92, NOW()), -- Pride & Prejudice
  ('tmdb-508', 0.68, 128, 232, 360, 8, 0.58, 0.65, -0.45, 0.88, NOW()),  -- Love Actually
  ('tmdb-489', 0.65, 125, 235, 360, 7, 0.55, 0.62, -0.50, 0.85, NOW()),  -- Good Will Hunting
  ('tmdb-637', 0.62, 122, 238, 360, 8, 0.52, 0.60, -0.55, 0.82, NOW()),  -- Life is Beautiful

  -- Lower Tier
  ('tmdb-863', 0.55, 115, 245, 360, 7, 0.45, 0.52, -0.65, 0.75, NOW()),  -- Toy Story 2
  ('tmdb-10193', 0.52, 112, 248, 360, 7, 0.42, 0.50, -0.70, 0.72, NOW()),-- Toy Story 3
  ('tmdb-140607', 0.48, 108, 252, 360, 7, 0.38, 0.45, -0.75, 0.68, NOW()),-- Force Awakens
  ('tmdb-284054', 0.45, 105, 255, 360, 7, 0.35, 0.42, -0.80, 0.65, NOW()),-- Black Panther
  ('tmdb-539', 0.42, 102, 258, 360, 8, 0.32, 0.40, -0.85, 0.62, NOW()),  -- Psycho
  ('tmdb-73', 0.38, 98, 262, 360, 6, 0.28, 0.35, -0.90, 0.58, NOW()),    -- American History X
  ('tmdb-114', 0.35, 95, 265, 360, 7, 0.25, 0.32, -0.95, 0.55, NOW()),   -- Pretty Woman

  -- Lower Tier (polarizing)
  ('tmdb-346698', 0.28, 88, 272, 360, 9, 0.18, 0.25, -1.05, 0.48, NOW()),-- Barbie
  ('tmdb-502356', 0.22, 82, 278, 360, 7, 0.12, 0.20, -1.15, 0.42, NOW()),-- Mario
  ('tmdb-111', 0.15, 75, 285, 360, 6, 0.05, 0.12, -1.25, 0.35, NOW()),   -- Scarface
  ('tmdb-311', 0.08, 68, 292, 360, 5, -0.02, 0.05, -1.35, 0.28, NOW())   -- Once Upon Time America

ON CONFLICT (movie_id) DO UPDATE SET
  global_beta = EXCLUDED.global_beta,
  total_global_wins = EXCLUDED.total_global_wins,
  total_global_losses = EXCLUDED.total_global_losses,
  total_global_comparisons = EXCLUDED.total_global_comparisons,
  unique_users_count = EXCLUDED.unique_users_count,
  average_user_beta = EXCLUDED.average_user_beta,
  median_user_beta = EXCLUDED.median_user_beta,
  percentile_25 = EXCLUDED.percentile_25,
  percentile_75 = EXCLUDED.percentile_75,
  last_calculated_at = NOW();

-- ============================================
-- VERIFY DATA
-- ============================================
SELECT
  m.title,
  m.year,
  g.global_beta,
  g.unique_users_count,
  g.total_global_comparisons
FROM global_movie_stats g
JOIN movies m ON m.id = g.movie_id
ORDER BY g.global_beta DESC
LIMIT 20;

-- Show count
SELECT COUNT(*) as total_movies_with_stats FROM global_movie_stats;
