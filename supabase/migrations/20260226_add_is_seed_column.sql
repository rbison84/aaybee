-- Add is_seed column to user_profiles for identifying MovieLens seed users
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_seed BOOLEAN DEFAULT FALSE;

-- Index for filtering seed users
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_seed ON user_profiles(is_seed) WHERE is_seed = TRUE;
