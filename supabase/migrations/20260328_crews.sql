-- CREWS — persistent social groups for daily play
CREATE TABLE IF NOT EXISTS crews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(8) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  creator_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID REFERENCES crews(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(crew_id, user_id)
);

CREATE TABLE IF NOT EXISTS crew_daily_picks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_id UUID REFERENCES crews(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  daily_number INTEGER NOT NULL,
  ranking TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(crew_id, user_id, daily_number)
);

-- RLS
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crews_read" ON crews FOR SELECT USING (true);
CREATE POLICY "crews_insert" ON crews FOR INSERT WITH CHECK (true);

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_members_read" ON crew_members FOR SELECT USING (true);
CREATE POLICY "crew_members_insert" ON crew_members FOR INSERT WITH CHECK (true);
CREATE POLICY "crew_members_delete" ON crew_members FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE crew_daily_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crew_daily_picks_read" ON crew_daily_picks FOR SELECT USING (true);
CREATE POLICY "crew_daily_picks_insert" ON crew_daily_picks FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crews_code ON crews(code);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_daily_picks_crew_day ON crew_daily_picks(crew_id, daily_number);
