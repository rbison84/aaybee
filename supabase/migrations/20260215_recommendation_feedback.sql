-- Recommendation feedback table: persists dismissals/actions server-side
-- so they survive app reinstalls and sync across devices

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('dismissed', 'seen_it', 'watchlisted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_feedback_user ON recommendation_feedback(user_id);

-- RLS
ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feedback"
  ON recommendation_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feedback"
  ON recommendation_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own feedback"
  ON recommendation_feedback FOR DELETE USING (auth.uid() = user_id);
