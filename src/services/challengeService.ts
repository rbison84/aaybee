import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export interface ChallengeMovie {
  id: string;
  title: string;
  year: number;
  posterUrl: string;
}

export interface ChallengeResults {
  matchPercent: number;
  kendallTau: number;
  agreements: { rank: number; movie: ChallengeMovie }[];
  disagreements: { movie: ChallengeMovie; creatorRank: number; challengerRank: number }[];
  biggestDisagreement?: { movie: ChallengeMovie; creatorRank: number; challengerRank: number };
}

export interface FriendChallenge {
  id: string;
  code: string;
  creator_id: string | null;
  creator_name: string;
  movies: ChallengeMovie[];
  creator_ranking: string[];
  challenger_name: string | null;
  challenger_id: string | null;
  challenger_ranking: string[] | null;
  match_percent: number | null;
  results: ChallengeResults | null;
  status: 'pending' | 'active' | 'complete';
  created_at: string;
  expires_at: string;
  completed_at: string | null;
}

// ============================================
// CONSTANTS
// ============================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// ============================================
// HELPERS
// ============================================

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Compute Kendall tau distance between two rankings.
 * Returns a value from 0 (identical) to 1 (reversed).
 */
function kendallTauDistance(rankingA: string[], rankingB: string[]): number {
  const n = rankingA.length;
  if (n < 2) return 0;

  const posB = new Map<string, number>();
  rankingB.forEach((id, i) => posB.set(id, i));

  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const biPos = posB.get(rankingA[i]);
      const bjPos = posB.get(rankingA[j]);
      if (biPos === undefined || bjPos === undefined) continue;

      if (biPos < bjPos) concordant++;
      else if (biPos > bjPos) discordant++;
    }
  }

  const totalPairs = (n * (n - 1)) / 2;
  return totalPairs > 0 ? discordant / totalPairs : 0;
}

/**
 * Compute results from two rankings of the same movies.
 */
function computeResults(
  movies: ChallengeMovie[],
  creatorRanking: string[],
  challengerRanking: string[],
): ChallengeResults {
  const movieMap = new Map(movies.map(m => [m.id, m]));
  const creatorPos = new Map(creatorRanking.map((id, i) => [id, i]));
  const challengerPos = new Map(challengerRanking.map((id, i) => [id, i]));

  const agreements: ChallengeResults['agreements'] = [];
  const disagreements: ChallengeResults['disagreements'] = [];

  for (const id of creatorRanking) {
    const cRank = creatorPos.get(id)!;
    const chRank = challengerPos.get(id);
    const movie = movieMap.get(id);
    if (chRank === undefined || !movie) continue;

    if (cRank === chRank) {
      agreements.push({ rank: cRank + 1, movie });
    } else {
      disagreements.push({
        movie,
        creatorRank: cRank + 1,
        challengerRank: chRank + 1,
      });
    }
  }

  // Sort disagreements by magnitude
  disagreements.sort((a, b) =>
    Math.abs(b.creatorRank - b.challengerRank) - Math.abs(a.creatorRank - a.challengerRank)
  );

  const tau = kendallTauDistance(creatorRanking, challengerRanking);
  // Convert Kendall tau distance to a match percent (0 distance = 100% match)
  const matchPercent = Math.round((1 - tau) * 100);

  return {
    matchPercent,
    kendallTau: tau,
    agreements,
    disagreements,
    biggestDisagreement: disagreements[0] || undefined,
  };
}

// ============================================
// SERVICE
// ============================================

export const challengeService = {
  /**
   * Check if two users have 9+ common ranked movies.
   * Returns the common movies if so, null if not enough.
   */
  getCommonMovies: async (
    userIdA: string,
    userIdB: string,
    minCount: number = 9,
  ): Promise<ChallengeMovie[] | null> => {
    try {
      const [{ data: moviesA }, { data: moviesB }] = await Promise.all([
        supabase.from('user_movies').select('movie_id, beta').eq('user_id', userIdA).eq('status', 'known').order('beta', { ascending: false }),
        supabase.from('user_movies').select('movie_id, beta').eq('user_id', userIdB).eq('status', 'known').order('beta', { ascending: false }),
      ]);

      if (!moviesA || !moviesB) return null;

      const bSet = new Set(moviesB.map(m => m.movie_id));
      const commonIds = moviesA.filter(m => bSet.has(m.movie_id)).map(m => m.movie_id);

      if (commonIds.length < minCount) return null;

      // Pick 9 from across the ranking spectrum (top 3, mid 3, varied 3)
      const selected: string[] = [];
      const third = Math.floor(commonIds.length / 3);

      // Top 3
      for (let i = 0; i < Math.min(3, commonIds.length); i++) selected.push(commonIds[i]);
      // Mid 3
      for (let i = third; i < Math.min(third + 3, commonIds.length); i++) {
        if (!selected.includes(commonIds[i])) selected.push(commonIds[i]);
      }
      // Bottom 3
      for (let i = commonIds.length - 3; i < commonIds.length; i++) {
        if (i >= 0 && !selected.includes(commonIds[i])) selected.push(commonIds[i]);
      }

      // Trim to 9
      const finalIds = selected.slice(0, 9);

      // Fetch movie details
      const { data: movieDetails } = await supabase
        .from('movies')
        .select('id, title, year, poster_url')
        .in('id', finalIds);

      if (!movieDetails) return null;

      return finalIds.map(id => {
        const m = movieDetails.find(d => d.id === id);
        return {
          id,
          title: m?.title || 'Unknown',
          year: m?.year || 0,
          posterUrl: m?.poster_url || '',
        };
      }).filter(m => m.title !== 'Unknown');
    } catch {
      return null;
    }
  },

  /**
   * Create a friend challenge with movies from the creator's rankings.
   */
  createChallenge: async (
    creatorId: string | null,
    creatorName: string,
    movies: ChallengeMovie[],
    creatorRanking: string[],
  ): Promise<{ challenge: FriendChallenge | null; error?: string }> => {
    try {
      if (movies.length < 3) {
        return { challenge: null, error: 'Need at least 3 movies for a challenge' };
      }

      // Generate unique code
      let code = generateCode();
      for (let i = 0; i < 10; i++) {
        const { data: existing } = await supabase
          .from('friend_challenges')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!existing) break;
        code = generateCode();
      }

      // Verify code is unique
      const { data: finalCheck } = await supabase.from('friend_challenges').select('id').eq('code', code).maybeSingle();
      if (finalCheck) {
        return { challenge: null, error: 'Could not generate unique code. Please try again.' };
      }

      const { data: challenge, error } = await supabase
        .from('friend_challenges')
        .insert({
          code,
          creator_id: creatorId,
          creator_name: creatorName,
          movies,
          creator_ranking: creatorRanking,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('[ChallengeService] Create error:', error);
        return { challenge: null, error: error.message };
      }

      return { challenge };
    } catch (err) {
      console.error('[ChallengeService] Create error:', err);
      return { challenge: null, error: 'Failed to create challenge' };
    }
  },

  /**
   * Get a challenge by code.
   */
  getChallengeByCode: async (code: string): Promise<FriendChallenge | null> => {
    const { data } = await supabase
      .from('friend_challenges')
      .select('*')
      .eq('code', code.toUpperCase())
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  },

  /**
   * Join a challenge (set challenger name, mark as active).
   */
  joinChallenge: async (
    code: string,
    challengerName: string,
    challengerId?: string,
  ): Promise<{ challenge: FriendChallenge | null; error?: string }> => {
    try {
      const challenge = await challengeService.getChallengeByCode(code);
      if (!challenge) {
        return { challenge: null, error: 'Challenge not found or expired' };
      }
      if (challenge.status === 'complete') {
        return { challenge, error: undefined }; // Already done, just return results
      }
      if (challenge.creator_id && challenge.creator_id === challengerId) {
        return { challenge: null, error: "You can't join your own challenge" };
      }

      const { data: updated, error } = await supabase
        .from('friend_challenges')
        .update({
          challenger_name: challengerName,
          challenger_id: challengerId || null,
          status: 'active',
        })
        .eq('id', challenge.id)
        .select()
        .single();

      if (error) return { challenge: null, error: error.message };
      return { challenge: updated };
    } catch (err) {
      return { challenge: null, error: 'Failed to join challenge' };
    }
  },

  /**
   * Submit the challenger's ranking and compute results.
   */
  submitRanking: async (
    code: string,
    challengerRanking: string[],
  ): Promise<{ results: ChallengeResults | null; error?: string }> => {
    try {
      const challenge = await challengeService.getChallengeByCode(code);
      if (!challenge) {
        return { results: null, error: 'Challenge not found' };
      }

      const results = computeResults(
        challenge.movies,
        challenge.creator_ranking,
        challengerRanking,
      );

      const { error } = await supabase
        .from('friend_challenges')
        .update({
          challenger_ranking: challengerRanking,
          match_percent: results.matchPercent,
          results,
          status: 'complete',
          completed_at: new Date().toISOString(),
        })
        .eq('id', challenge.id);

      if (error) return { results: null, error: error.message };

      // Update friendship stats if both users are authenticated
      if (challenge.creator_id && challenge.challenger_id) {
        await challengeService.updateFriendshipStats(
          challenge.creator_id,
          challenge.challenger_id,
          results.matchPercent,
        );
      }

      return { results };
    } catch (err) {
      return { results: null, error: 'Failed to submit ranking' };
    }
  },

  /**
   * Get top ranked movies for challenge creation (from user's ranked list).
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

  /**
   * Get all challenges for a user (pending + active + complete).
   */
  getMyActiveChallenges: async (
    userId: string,
  ): Promise<FriendChallenge[]> => {
    try {
      const { data } = await supabase
        .from('friend_challenges')
        .select('*')
        .or(`creator_id.eq.${userId},challenger_id.eq.${userId}`)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Get challenge leaderboard — all completed challenges sorted by match %.
   */
  getChallengeLeaderboard: async (
    userId: string,
  ): Promise<{ name: string; matchPercent: number; code: string; date: string }[]> => {
    try {
      const { data: challenges } = await supabase
        .from('friend_challenges')
        .select('code, creator_name, challenger_name, creator_id, challenger_id, match_percent, completed_at')
        .eq('status', 'complete')
        .or(`creator_id.eq.${userId},challenger_id.eq.${userId}`)
        .order('completed_at', { ascending: false })
        .limit(50);

      if (!challenges) return [];

      return challenges.map(c => {
        const isCreator = c.creator_id === userId;
        return {
          name: isCreator ? (c.challenger_name || 'Someone') : c.creator_name,
          matchPercent: Math.round(c.match_percent || 0),
          code: c.code,
          date: c.completed_at || '',
        };
      });
    } catch {
      return [];
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
