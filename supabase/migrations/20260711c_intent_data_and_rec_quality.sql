-- ============================================
-- INTENT DATA + REC QUALITY
-- ============================================
-- 1. comparisons.context — which surface produced each comparison
--    (daily / vs / decide / discover / onboarding). Cheap now, gold for
--    training domain-aware models later.
-- 2. watch_clicks — click-through-to-streaming intent log (the revenue
--    event, tracked in-DB independent of any analytics tool).
-- 3. rec_quality — the north-star view: of movies users responded to as
--    recommendations, how many ended up ranked in their top quartile?

-- 1. Comparison context
ALTER TABLE comparisons ADD COLUMN IF NOT EXISTS context TEXT;

-- 2. Watch click-throughs
CREATE TABLE IF NOT EXISTS watch_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  movie_id TEXT NOT NULL,
  provider TEXT,
  source TEXT,                -- trailer | decide | detail | discover
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_clicks_movie ON watch_clicks(movie_id);
CREATE INDEX IF NOT EXISTS idx_watch_clicks_user ON watch_clicks(user_id);

ALTER TABLE watch_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watch_clicks_insert ON watch_clicks;
CREATE POLICY watch_clicks_insert ON watch_clicks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No SELECT policy for clients — read with service role / SQL editor only.

-- 3. Rec-quality north star.
-- A recommendation "hit" = the user responded to a rec (any feedback row)
-- and that movie now sits in the top quartile of their ranked list.
CREATE OR REPLACE VIEW rec_quality AS
WITH user_quartiles AS (
  SELECT user_id,
         PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY beta) AS beta_p75
  FROM user_movies
  WHERE status = 'known'
  GROUP BY user_id
)
SELECT
  rf.user_id,
  rf.movie_id,
  rf.action,
  rf.created_at AS feedback_at,
  (um.movie_id IS NOT NULL) AS was_ranked,
  (um.movie_id IS NOT NULL AND um.beta >= uq.beta_p75) AS is_top_quartile
FROM recommendation_feedback rf
LEFT JOIN user_movies um
  ON um.user_id = rf.user_id AND um.movie_id = rf.movie_id AND um.status = 'known'
LEFT JOIN user_quartiles uq ON uq.user_id = rf.user_id;

REVOKE ALL ON rec_quality FROM anon, authenticated;

-- Dashboard query (run in SQL editor):
--   SELECT action, COUNT(*) AS recs,
--          ROUND(100.0 * AVG(is_top_quartile::int), 1) AS hit_rate_pct
--   FROM rec_quality GROUP BY action;
