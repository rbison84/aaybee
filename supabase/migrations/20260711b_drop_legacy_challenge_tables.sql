-- ============================================
-- RETIRE LEGACY HEAD-TO-HEAD FORMATS
-- ============================================
-- The knockout bracket (knockout_challenges) is now the only head-to-head
-- game. This drops the two retired formats:
--   vs_challenges     — pool-based pick-per-pair VS (score /10)
--   friend_challenges — 10-movie ranking challenge (links never resolved
--                       in-app; format was unreachable end-to-end)
-- Old /vs/CODE and /challenge/CODE links degrade gracefully: the app shows
-- "challenge not found" and lands on the challenge home; OG previews show
-- a generic card.

DROP TABLE IF EXISTS vs_challenges;
DROP TABLE IF EXISTS friend_challenges;
