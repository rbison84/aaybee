-- Knockout bracket challenges (VS mode)
-- Stores shared brackets so two players play the same 16 movies

CREATE TABLE IF NOT EXISTS knockout_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,

  -- The 16 movies (JSONB array of {id, title, posterUrl, year})
  movies JSONB NOT NULL,
  seed BIGINT NOT NULL,

  -- Creator
  creator_id UUID REFERENCES auth.users(id),
  creator_name TEXT NOT NULL,
  creator_picks JSONB, -- array of {round, match, winnerIdx}
  creator_winner JSONB, -- {id, title, posterUrl, year}

  -- Challenger
  challenger_id UUID REFERENCES auth.users(id),
  challenger_name TEXT,
  challenger_picks JSONB,
  challenger_winner JSONB,

  -- Results (computed when both complete)
  match_percent INTEGER,
  kendall_tau REAL,
  same_winner BOOLEAN,

  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, playing, complete

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for code lookups
CREATE INDEX IF NOT EXISTS idx_knockout_challenges_code ON knockout_challenges(code);

-- Index for user's challenges
CREATE INDEX IF NOT EXISTS idx_knockout_challenges_creator ON knockout_challenges(creator_id);
CREATE INDEX IF NOT EXISTS idx_knockout_challenges_challenger ON knockout_challenges(challenger_id);

-- RLS
ALTER TABLE knockout_challenges ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for joining via code)
CREATE POLICY "knockout_challenges_select" ON knockout_challenges
  FOR SELECT USING (true);

-- Authenticated users can insert
CREATE POLICY "knockout_challenges_insert" ON knockout_challenges
  FOR INSERT WITH CHECK (true);

-- Anyone can update (guests need to submit picks)
CREATE POLICY "knockout_challenges_update" ON knockout_challenges
  FOR UPDATE USING (true);
