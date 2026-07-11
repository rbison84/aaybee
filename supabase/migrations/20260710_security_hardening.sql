-- ============================================
-- SECURITY HARDENING
-- ============================================
-- 1. global_movie_stats: writes move server-side (SECURITY DEFINER RPC)
-- 2. user_movies: drop read-all policy; scoped RPCs for social features
-- 3. user_profiles: move push_token + email out of the publicly readable table
-- 4. Challenge tables: completed rows become immutable
-- 5. share_codes / challenge tables: content constraints (XSS/spam surface)
-- 6. crews: inserts must be the acting user
--
-- Run AFTER deploying the matching client build (the client switches to the
-- RPCs introduced here). Requires the og-handler + send-push deploy too.

-- ============================================
-- 1. GLOBAL_MOVIE_STATS — server-computed only
-- ============================================

DROP POLICY IF EXISTS "Authenticated can insert global stats" ON global_movie_stats;
DROP POLICY IF EXISTS "Authenticated can update global stats" ON global_movie_stats;

-- Recomputes true aggregates for one movie. Callable by any signed-in user,
-- but can only ever write honest aggregates — no arbitrary values.
CREATE OR REPLACE FUNCTION recalculate_movie_global_stats(p_movie_id TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO global_movie_stats AS g (
    movie_id, global_beta, total_global_wins, total_global_losses,
    total_global_comparisons, unique_users_count, average_user_beta,
    median_user_beta, percentile_25, percentile_75, last_calculated_at
  )
  SELECT
    p_movie_id,
    COALESCE(
      SUM(um.beta * SQRT(um.total_comparisons + 1))
        / NULLIF(SUM(SQRT(um.total_comparisons + 1)), 0),
      0
    ),
    COALESCE(SUM(um.total_wins), 0),
    COALESCE(SUM(um.total_losses), 0),
    COALESCE(SUM(um.total_wins), 0) + COALESCE(SUM(um.total_losses), 0),
    COUNT(*),
    COALESCE(AVG(um.beta), 0),
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY um.beta), 0),
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY um.beta), 0),
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY um.beta), 0),
    NOW()
  FROM user_movies um
  WHERE um.movie_id = p_movie_id
  HAVING COUNT(*) > 0
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
    last_calculated_at = EXCLUDED.last_calculated_at;
END;
$$;

REVOKE ALL ON FUNCTION recalculate_movie_global_stats(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recalculate_movie_global_stats(TEXT) TO authenticated;

-- Bulk recalculation: service role only (run from admin scripts / cron)
CREATE OR REPLACE FUNCTION recalculate_all_global_stats()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_movie_id TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR v_movie_id IN
    SELECT DISTINCT movie_id FROM user_movies WHERE total_comparisons > 0
  LOOP
    PERFORM recalculate_movie_global_stats(v_movie_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION recalculate_all_global_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recalculate_all_global_stats() TO service_role;

-- ============================================
-- 2. USER_MOVIES — drop read-all, add scoped RPCs
-- ============================================

DROP POLICY IF EXISTS "Users can read all movies for aggregation" ON user_movies;

-- Known (ranked) movies for a bounded set of users. This is the data that
-- powers every social feature (taste match, challenges, discovery, friend
-- rankings). Statuses other than 'known' stay private to the owner.
CREATE OR REPLACE FUNCTION get_known_rankings(
  target_ids UUID[],
  per_user_limit INTEGER DEFAULT NULL
)
RETURNS TABLE (user_id UUID, movie_id TEXT, beta NUMERIC, total_comparisons INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.user_id, r.movie_id, r.beta, r.total_comparisons
  FROM (
    SELECT um.user_id, um.movie_id, um.beta, um.total_comparisons,
           ROW_NUMBER() OVER (PARTITION BY um.user_id ORDER BY um.beta DESC) AS rn
    FROM user_movies um
    WHERE um.user_id = ANY(target_ids[1:200])
      AND um.status = 'known'
  ) r
  WHERE per_user_limit IS NULL OR r.rn <= per_user_limit
  ORDER BY r.user_id, r.beta DESC;
$$;

REVOKE ALL ON FUNCTION get_known_rankings(UUID[], INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_known_rankings(UUID[], INTEGER) TO authenticated;

-- Betas + rank position for one movie across a bounded set of users
-- (replaces the N+1 rank-count loop in friendService)
CREATE OR REPLACE FUNCTION get_movie_rankings_for_users(
  p_movie_id TEXT,
  target_ids UUID[]
)
RETURNS TABLE (user_id UUID, beta NUMERIC, rank INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT um.user_id, um.beta,
         (SELECT COUNT(*)::INTEGER + 1
          FROM user_movies x
          WHERE x.user_id = um.user_id
            AND x.status = 'known'
            AND x.beta > um.beta) AS rank
  FROM user_movies um
  WHERE um.movie_id = p_movie_id
    AND um.status = 'known'
    AND um.user_id = ANY(target_ids[1:200]);
$$;

REVOKE ALL ON FUNCTION get_movie_rankings_for_users(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_movie_rankings_for_users(TEXT, UUID[]) TO authenticated;

-- ============================================
-- 3. USER_PROFILES — remove secrets from the public row
-- ============================================

-- 3a. Push tokens move to an owner-only table (send-push function reads it
-- with the service role).
CREATE TABLE IF NOT EXISTS user_push_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_own ON user_push_tokens;
CREATE POLICY push_tokens_own ON user_push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migrate existing tokens, then drop the exposed column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'push_token'
  ) THEN
    INSERT INTO user_push_tokens (user_id, token)
    SELECT id, push_token FROM user_profiles WHERE push_token IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;

    ALTER TABLE user_profiles DROP COLUMN push_token;
  END IF;
END $$;

-- 3b. Email: contact matching goes through an RPC that only returns emails
-- the caller already has. The plaintext column comes off the public table.
CREATE OR REPLACE FUNCTION match_users_by_email(p_emails TEXT[])
RETURNS TABLE (id UUID, display_name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, p.display_name, LOWER(u.email)
  FROM auth.users u
  JOIN user_profiles p ON p.id = u.id
  WHERE LOWER(u.email) IN (SELECT LOWER(e) FROM UNNEST(p_emails[1:500]) AS e)
    AND p.display_name IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION match_users_by_email(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_users_by_email(TEXT[]) TO authenticated;

DROP INDEX IF EXISTS idx_user_profiles_email;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS email;

-- ============================================
-- 4. CHALLENGE TABLES — completed rows are immutable
-- ============================================
-- The share code remains the access token for guest flows, but finished
-- results can no longer be overwritten by anyone holding the code.

DROP POLICY IF EXISTS "challenges_update" ON friend_challenges;
CREATE POLICY "challenges_update" ON friend_challenges
  FOR UPDATE USING (status <> 'complete') WITH CHECK (true);

DROP POLICY IF EXISTS "knockout_challenges_update" ON knockout_challenges;
CREATE POLICY "knockout_challenges_update" ON knockout_challenges
  FOR UPDATE USING (status <> 'complete') WITH CHECK (true);

DROP POLICY IF EXISTS "decide_sessions_update" ON decide_sessions;
CREATE POLICY "decide_sessions_update" ON decide_sessions
  FOR UPDATE USING (status <> 'complete') WITH CHECK (true);

-- ============================================
-- 5. CONTENT CONSTRAINTS — cap spam/XSS payload surface
-- ============================================
-- NOT VALID: applies to new rows only, so the migration can't fail on
-- pre-existing data.

DO $$
BEGIN
  BEGIN
    ALTER TABLE share_codes ADD CONSTRAINT share_codes_type_check
      CHECK ("type" IN ('daily', 'vs', 'challenge', 'ranking')) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE share_codes ADD CONSTRAINT share_codes_title_len
      CHECK (char_length(title) <= 150) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE share_codes ADD CONSTRAINT share_codes_desc_len
      CHECK (description IS NULL OR char_length(description) <= 300) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE share_codes ADD CONSTRAINT share_codes_code_format
      CHECK (code ~ '^[A-Za-z0-9]{4,8}$') NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE friend_challenges ADD CONSTRAINT friend_challenges_names_len
      CHECK (char_length(creator_name) <= 50
             AND (challenger_name IS NULL OR char_length(challenger_name) <= 50)) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE knockout_challenges ADD CONSTRAINT knockout_challenges_names_len
      CHECK (char_length(creator_name) <= 50
             AND (challenger_name IS NULL OR char_length(challenger_name) <= 50)) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TABLE decide_sessions ADD CONSTRAINT decide_sessions_names_len
      CHECK (char_length(person1_name) <= 50
             AND (person2_name IS NULL OR char_length(person2_name) <= 50)) NOT VALID;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================
-- 6. STREAK SYNC — streaks survive device switches
-- ============================================
-- (Not security, but shipped in the same release: dailyStreakService now
-- pushes/merges these columns.)

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS streak_current INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS streak_longest INTEGER DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS streak_last_date TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS streak_total_days INTEGER DEFAULT 0;

-- ============================================
-- 7. CREWS — inserts must be the acting user
-- ============================================

DROP POLICY IF EXISTS "crews_insert" ON crews;
CREATE POLICY "crews_insert" ON crews
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "crew_members_insert" ON crew_members;
CREATE POLICY "crew_members_insert" ON crew_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "crew_daily_picks_insert" ON crew_daily_picks;
CREATE POLICY "crew_daily_picks_insert" ON crew_daily_picks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
