-- Group Decide Tables
-- Run this migration to enable group decide functionality

-- Decide Rooms - main room state
CREATE TABLE IF NOT EXISTS decide_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(4) NOT NULL,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'preferences', 'building', 'tournament', 'recap', 'result')),
  preferences JSONB,
  pool JSONB DEFAULT '[]'::jsonb,
  current_round INTEGER DEFAULT 0,
  current_match INTEGER DEFAULT 0,
  round_winners JSONB DEFAULT '[]'::jsonb,
  round_losers JSONB DEFAULT '[]'::jsonb,
  champion JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT unique_active_code UNIQUE (code, expires_at)
);

-- Index for room code lookups
CREATE INDEX IF NOT EXISTS idx_decide_rooms_code ON decide_rooms(code);
CREATE INDEX IF NOT EXISTS idx_decide_rooms_expires ON decide_rooms(expires_at);
CREATE INDEX IF NOT EXISTS idx_decide_rooms_host ON decide_rooms(host_id);

-- Room Members
CREATE TABLE IF NOT EXISTS decide_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES decide_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(50) NOT NULL,
  is_host BOOLEAN DEFAULT FALSE,
  vetoes_remaining INTEGER DEFAULT 1,
  joined_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_room_user UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decide_room_members_room ON decide_room_members(room_id);

-- Preference Votes
CREATE TABLE IF NOT EXISTS decide_preference_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES decide_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_room_user_pref UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decide_preference_votes_room ON decide_preference_votes(room_id);

-- Match Votes
CREATE TABLE IF NOT EXISTS decide_match_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES decide_rooms(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  match_index INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice VARCHAR(1) NOT NULL CHECK (choice IN ('A', 'B')),
  voted_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_room_match_user UNIQUE (room_id, round, match_index, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decide_match_votes_room_round ON decide_match_votes(room_id, round, match_index);

-- Veto Actions (for displaying who vetoed what)
CREATE TABLE IF NOT EXISTS decide_veto_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES decide_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name VARCHAR(50) NOT NULL,
  vetoed_movie_id VARCHAR(50) NOT NULL,
  replacement_movie_id VARCHAR(50),
  round INTEGER NOT NULL,
  vetoed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decide_veto_actions_room ON decide_veto_actions(room_id);

-- Enable Row Level Security
ALTER TABLE decide_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE decide_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE decide_preference_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE decide_match_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE decide_veto_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for decide_rooms
CREATE POLICY "Anyone can view rooms" ON decide_rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create rooms" ON decide_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Host can update room" ON decide_rooms FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Host can delete room" ON decide_rooms FOR DELETE USING (auth.uid() = host_id);

-- RLS Policies for decide_room_members
CREATE POLICY "Anyone can view members" ON decide_room_members FOR SELECT USING (true);
CREATE POLICY "Authenticated users can join rooms" ON decide_room_members FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can update own membership" ON decide_room_members FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON decide_room_members FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for decide_preference_votes
CREATE POLICY "Room members can view votes" ON decide_preference_votes FOR SELECT USING (true);
CREATE POLICY "Users can submit own votes" ON decide_preference_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own votes" ON decide_preference_votes FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for decide_match_votes
CREATE POLICY "Room members can view match votes" ON decide_match_votes FOR SELECT USING (true);
CREATE POLICY "Users can submit own match votes" ON decide_match_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own match votes" ON decide_match_votes FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for decide_veto_actions
CREATE POLICY "Anyone can view veto actions" ON decide_veto_actions FOR SELECT USING (true);
CREATE POLICY "Users can create veto actions" ON decide_veto_actions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE decide_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE decide_room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE decide_preference_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE decide_match_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE decide_veto_actions;

-- Cleanup function for expired rooms
CREATE OR REPLACE FUNCTION cleanup_expired_decide_rooms()
RETURNS void AS $$
BEGIN
  DELETE FROM decide_rooms WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
