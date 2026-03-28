-- aaybee vs: async movie taste challenges between friends
-- Challenge someone to compare 10 movie pairs and get a compatibility score

CREATE TABLE IF NOT EXISTS vs_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(6) NOT NULL,
  challenger_id UUID NOT NULL REFERENCES auth.users(id),
  challenged_id UUID REFERENCES auth.users(id), -- null if non-aaybee user
  challenged_name VARCHAR(100), -- display name for non-aaybee users
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending: waiting for challenged to join
  -- selecting: challenged is selecting 10 movies from pool
  -- challenged_comparing: challenged is doing A/B picks
  -- challenger_comparing: challenger is doing A/B picks
  -- complete: both done, results ready
  mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- auto: both on aaybee, computed from rankings
  -- manual: challenged picks from pool and compares
  pool JSONB DEFAULT '[]'::jsonb, -- 16 movies for selection (manual mode)
  selected_movies JSONB DEFAULT '[]'::jsonb, -- 10 movies chosen by challenged
  pairs JSONB DEFAULT '[]'::jsonb, -- 10 pairs [{movieA, movieB, challengerPick, challengedPick}]
  current_pair INTEGER DEFAULT 0, -- which pair the challenged is on
  challenger_current_pair INTEGER DEFAULT 0, -- which pair the challenger is on
  score INTEGER, -- 0-10 compatibility score
  results JSONB, -- detailed results for reveal
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  completed_at TIMESTAMPTZ
);

-- Index for code lookup
CREATE INDEX IF NOT EXISTS idx_vs_challenges_code ON vs_challenges(code) WHERE status != 'complete';

-- Index for user's challenges
CREATE INDEX IF NOT EXISTS idx_vs_challenges_challenger ON vs_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_vs_challenges_challenged ON vs_challenges(challenged_id);

-- RLS policies
ALTER TABLE vs_challenges ENABLE ROW LEVEL SECURITY;

-- Anyone can view challenges they're part of
CREATE POLICY vs_challenges_select ON vs_challenges
  FOR SELECT USING (
    auth.uid() = challenger_id OR auth.uid() = challenged_id
  );

-- Challenger can create
CREATE POLICY vs_challenges_insert ON vs_challenges
  FOR INSERT WITH CHECK (auth.uid() = challenger_id);

-- Both parties can update (challenger sets up, challenged responds)
CREATE POLICY vs_challenges_update ON vs_challenges
  FOR UPDATE USING (
    auth.uid() = challenger_id OR auth.uid() = challenged_id
  );

-- Allow anyone to view by code (for joining)
CREATE POLICY vs_challenges_select_by_code ON vs_challenges
  FOR SELECT USING (true);
