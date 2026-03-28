-- ============================================
-- SHARE CODES — stores metadata for OG-rich share links
-- ============================================

CREATE TABLE IF NOT EXISTS share_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(8) UNIQUE NOT NULL,
  "type" VARCHAR(20) NOT NULL, -- 'daily', 'vs', 'challenge', 'ranking'
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  image_data JSONB, -- data needed to render OG image
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Anyone can read share codes (they're public links)
ALTER TABLE share_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_codes_read" ON share_codes FOR SELECT USING (true);
CREATE POLICY "share_codes_insert" ON share_codes FOR INSERT WITH CHECK (true);

-- ============================================
-- FRIEND CHALLENGES — link-based 10-movie ranking challenge
-- ============================================

CREATE TABLE IF NOT EXISTS friend_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(8) UNIQUE NOT NULL,
  creator_id UUID REFERENCES auth.users(id),
  creator_name TEXT NOT NULL,

  -- The movies to rank (array of {id, title, year, posterUrl})
  movies JSONB NOT NULL,

  -- Creator's ranking (array of movie IDs in rank order)
  creator_ranking TEXT[] NOT NULL,

  -- Challenger response
  challenger_name TEXT,
  challenger_id UUID REFERENCES auth.users(id),
  challenger_ranking TEXT[],

  -- Results
  match_percent REAL,
  results JSONB, -- {agreements, disagreements, kendallTau}

  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  -- pending: waiting for challenger
  -- active: challenger is ranking
  -- complete: both done

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  completed_at TIMESTAMPTZ
);

ALTER TABLE friend_challenges ENABLE ROW LEVEL SECURITY;

-- Anyone can read challenges by code (for link sharing)
CREATE POLICY "challenges_read" ON friend_challenges FOR SELECT USING (true);

-- Anyone can create challenges
CREATE POLICY "challenges_insert" ON friend_challenges FOR INSERT WITH CHECK (true);

-- Anyone can update (challenger joins, submits ranking)
CREATE POLICY "challenges_update" ON friend_challenges FOR UPDATE USING (true);

-- Index for fast code lookups
CREATE INDEX IF NOT EXISTS idx_friend_challenges_code ON friend_challenges(code);
CREATE INDEX IF NOT EXISTS idx_share_codes_code ON share_codes(code);
