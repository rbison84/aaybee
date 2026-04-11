-- Add challenged_user_id to knockout_challenges for directed friend challenges
ALTER TABLE knockout_challenges ADD COLUMN IF NOT EXISTS challenged_user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_knockout_challenges_challenged ON knockout_challenges(challenged_user_id);
