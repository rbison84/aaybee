-- WATCHLIST TABLE & POLICIES
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    movie_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('recommendation', 'manual', 'friend')),
    source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    source_user_name TEXT,
    notes TEXT,
    is_rewatch BOOLEAN DEFAULT false,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_added_at ON watchlist(user_id, added_at DESC);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own watchlist" ON watchlist;
CREATE POLICY "Users can view own watchlist"
    ON watchlist FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add to own watchlist" ON watchlist;
CREATE POLICY "Users can add to own watchlist"
    ON watchlist FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete from own watchlist" ON watchlist;
CREATE POLICY "Users can delete from own watchlist"
    ON watchlist FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own watchlist" ON watchlist;
CREATE POLICY "Users can update own watchlist"
    ON watchlist FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

SELECT 'Watchlist table created successfully!' as status;
