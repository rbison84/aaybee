-- Two-person Decide sessions
-- Each person does a 16-movie knockout to 4, then 8 movies enter negotiation

CREATE TABLE IF NOT EXISTS decide_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,

  -- Person 1 (creator)
  person1_id UUID REFERENCES auth.users(id),
  person1_name TEXT NOT NULL,
  person1_movies JSONB, -- their 16 knockout movies
  person1_picks JSONB,  -- their knockout bracket picks
  person1_final4 JSONB, -- their 4 surviving movies

  -- Person 2 (joiner)
  person2_id UUID REFERENCES auth.users(id),
  person2_name TEXT,
  person2_movies JSONB,
  person2_picks JSONB,
  person2_final4 JSONB,

  -- Negotiation phase
  negotiation_movies JSONB, -- combined 8 movies (4 from each)
  negotiation_pairs JSONB,  -- array of pairs [{movieA, movieB}, ...]
  negotiation_log JSONB,    -- array of {pair_index, proposer, proposed_movie, response: 'agree'|'disagree', advancing_movie}
  current_proposer INTEGER DEFAULT 1, -- 1 or 2
  current_pair_index INTEGER DEFAULT 0,

  -- Result
  winner_movie JSONB,

  -- Status: waiting_p2, p1_knockout, p2_knockout, negotiating, complete
  status TEXT NOT NULL DEFAULT 'waiting_p2',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decide_sessions_code ON decide_sessions(code);
CREATE INDEX IF NOT EXISTS idx_decide_sessions_p1 ON decide_sessions(person1_id);
CREATE INDEX IF NOT EXISTS idx_decide_sessions_p2 ON decide_sessions(person2_id);

ALTER TABLE decide_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decide_sessions_select" ON decide_sessions FOR SELECT USING (true);
CREATE POLICY "decide_sessions_insert" ON decide_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "decide_sessions_update" ON decide_sessions FOR UPDATE USING (true);
