-- Allow anonymous (guest) users to read and update VS challenges
-- The challenge code acts as the auth token — only someone who has it can find and play

-- Drop restrictive policies
DROP POLICY IF EXISTS vs_challenges_select ON vs_challenges;
DROP POLICY IF EXISTS vs_challenges_update ON vs_challenges;
DROP POLICY IF EXISTS vs_challenges_select_by_code ON vs_challenges;

-- Anyone can read challenges (needed for code lookup and guest play)
CREATE POLICY vs_challenges_select ON vs_challenges
  FOR SELECT USING (true);

-- Anyone can update challenges (guests need to submit picks)
CREATE POLICY vs_challenges_update ON vs_challenges
  FOR UPDATE USING (true);
