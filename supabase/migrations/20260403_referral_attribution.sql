-- Referral attribution: track who invited whom
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id);

-- Email column for contact book matching
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Backfill existing emails from auth.users
UPDATE user_profiles SET email = au.email
FROM auth.users au
WHERE user_profiles.id = au.id AND user_profiles.email IS NULL;
