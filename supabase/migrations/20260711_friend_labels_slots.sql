-- ============================================
-- YOUR PEOPLE: relationship labels + invite slots
-- ============================================
-- friend_labels: how *I* label a friend (spouse, best friend, ...).
--   One-directional — each side labels independently, so it's a separate
--   owner-scoped table rather than a column on the shared friendships row.
-- friend_slots: "ghost rows" — people I want on my taste map who aren't on
--   the app yet. Powers the slot-fill invite loop.

CREATE TABLE IF NOT EXISTS friend_labels (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) <= 20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

ALTER TABLE friend_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friend_labels_own ON friend_labels;
CREATE POLICY friend_labels_own ON friend_labels
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS friend_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 40),
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_friend_slots_user ON friend_slots(user_id);

ALTER TABLE friend_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friend_slots_own ON friend_slots;
CREATE POLICY friend_slots_own ON friend_slots
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
