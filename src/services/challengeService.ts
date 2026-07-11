import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================
// The friend_challenges (10-movie ranking) format was retired — the knockout
// bracket is the only head-to-head game. What remains here are the shared
// helpers other features still use.

export interface ChallengeMovie {
  id: string;
  title: string;
  year: number;
  posterUrl: string;
}

// ============================================
// SERVICE
// ============================================

export const challengeService = {
  /**
   * Get top ranked movies for challenge creation (from user's ranked list).
   * Used to build knockout bracket pools.
   */
  getTopMoviesForChallenge: async (
    userId: string,
    count: number = 10,
  ): Promise<ChallengeMovie[]> => {
    try {
      const { data: userMovies } = await supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userId)
        .eq('status', 'known')
        .order('beta', { ascending: false })
        .limit(count * 3); // Fetch more to allow selection

      if (!userMovies || userMovies.length === 0) return [];

      const movieIds = userMovies.map(m => m.movie_id);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title, year, poster_url')
        .in('id', movieIds);

      if (!movies) return [];

      // Return in beta order
      return userMovies.map(um => {
        const movie = movies.find(m => m.id === um.movie_id);
        return {
          id: um.movie_id,
          title: movie?.title || 'Unknown',
          year: movie?.year || 0,
          posterUrl: movie?.poster_url || '',
        };
      }).filter(m => m.title !== 'Unknown');
    } catch (err) {
      console.error('[ChallengeService] getTopMovies error:', err);
      return [];
    }
  },

  /**
   * Update friendship challenge stats after completing a challenge.
   * Tracks running average match % between two users.
   * NOTE: Requires similarity_score (INT) and games_played (INT) columns on friendships table.
   * Run: ALTER TABLE friendships ADD COLUMN IF NOT EXISTS similarity_score INT DEFAULT 0;
   *      ALTER TABLE friendships ADD COLUMN IF NOT EXISTS games_played INT DEFAULT 0;
   */
  updateFriendshipStats: async (
    userIdA: string,
    userIdB: string,
    matchPercent: number,
  ): Promise<void> => {
    try {
      // Normalize order
      const [a, b] = [userIdA, userIdB].sort();

      // Check existing friendship
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, similarity_score, games_played')
        .eq('user_id', a)
        .eq('friend_id', b)
        .maybeSingle();

      if (existing) {
        const oldTotal = (existing.similarity_score || 0) * (existing.games_played || 1);
        const newGames = (existing.games_played || 1) + 1;
        const newAvg = Math.round((oldTotal + matchPercent) / newGames);
        await supabase
          .from('friendships')
          .update({ similarity_score: newAvg, games_played: newGames })
          .eq('id', existing.id);
      }
      // If no friendship exists, don't create one — they need to be friends first
    } catch (err) {
      console.error('[ChallengeService] updateFriendshipStats error:', err);
    }
  },
};

export function getMatchTier(matchPercent: number): { name: string; subtitle: string } {
  if (matchPercent >= 90) return { name: 'Cinema Soulmates', subtitle: "you'd co-direct a film" };
  if (matchPercent >= 75) return { name: 'Same Screening', subtitle: "basically the same taste in different seats" };
  if (matchPercent >= 60) return { name: 'Shared Popcorn', subtitle: "you'd survive a movie marathon" };
  if (matchPercent >= 40) return { name: 'Different Cuts', subtitle: "agree to disagree, respectfully" };
  if (matchPercent >= 20) return { name: 'Separate Theatres', subtitle: "one of you watches the credits, one doesn't" };
  return { name: 'Opposite Reels', subtitle: "did you two even watch the same movies?" };
}

export default challengeService;
