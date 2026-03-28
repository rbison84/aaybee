-- Fix VS challenges: add UNIQUE constraint on code, tighten RLS policies,
-- add CHECK constraints on status and mode columns.

-- 1. Add UNIQUE constraint on code (prevents duplicate codes from concurrent inserts)
ALTER TABLE vs_challenges ADD CONSTRAINT vs_challenges_code_unique UNIQUE (code);

-- 2. Add CHECK constraints for valid status and mode values
ALTER TABLE vs_challenges ADD CONSTRAINT vs_challenges_status_check
  CHECK (status IN ('pending', 'selecting', 'challenged_comparing', 'challenger_comparing', 'complete'));

ALTER TABLE vs_challenges ADD CONSTRAINT vs_challenges_mode_check
  CHECK (mode IN ('auto', 'manual'));

-- 3. Replace overly permissive RLS policies with scoped ones
-- Drop the wide-open policies from 20260310
DROP POLICY IF EXISTS vs_challenges_select ON vs_challenges;
DROP POLICY IF EXISTS vs_challenges_update ON vs_challenges;

-- SELECT: anyone can read (code acts as the secret for joining)
CREATE POLICY vs_challenges_select ON vs_challenges
  FOR SELECT TO authenticated, anon
  USING (true);

-- UPDATE for authenticated users: participants can always update,
-- and any authenticated user can update a pending challenge (to join it,
-- since challenged_id is still NULL at that point)
CREATE POLICY vs_challenges_update_auth ON vs_challenges
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = challenger_id
    OR auth.uid() = challenged_id
    OR status = 'pending'
  );

-- UPDATE for anonymous (guest) users: only challenges in joinable/playable states,
-- and only specific fields via column-level function
CREATE POLICY vs_challenges_update_anon ON vs_challenges
  FOR UPDATE TO anon
  USING (status IN ('pending', 'selecting', 'challenged_comparing'));
