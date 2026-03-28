-- ============================================
-- FRIENDSHIPS TABLE & POLICIES
-- ============================================
-- Run this in Supabase SQL Editor to enable the friends feature

-- Create friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id, status);

-- Enable RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own friendships (sent or received)
DROP POLICY IF EXISTS "Users can view own friendships" ON friendships;
CREATE POLICY "Users can view own friendships"
  ON friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Policy: Users can create friendships (send requests)
DROP POLICY IF EXISTS "Users can create friendships" ON friendships;
CREATE POLICY "Users can create friendships"
  ON friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update friendships they're part of (accept/decline)
DROP POLICY IF EXISTS "Users can update own friendships" ON friendships;
CREATE POLICY "Users can update own friendships"
  ON friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Policy: Users can delete friendships they're part of
DROP POLICY IF EXISTS "Users can delete own friendships" ON friendships;
CREATE POLICY "Users can delete own friendships"
  ON friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_friendships_updated_at ON friendships;
CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Allow users to search for other users by display name
-- Update user_profiles policy to allow reading basic info for friend search
DROP POLICY IF EXISTS "Users can search other profiles" ON user_profiles;
CREATE POLICY "Users can search other profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Verify
SELECT 'Friendships table created successfully!' as status;
SELECT COUNT(*) as policy_count FROM pg_policies WHERE tablename = 'friendships';
