import { supabase } from '../services/supabase';

// ============================================
// HOT TAKE GENERATOR
// ============================================
// Turns a disagreement (user ranks A over B against the grain) into an
// identity-flex share line backed by global data:
//   "only ~12% of players rank Speed over Heat. i'm one of them."
// The percentage is the Bradley-Terry probability implied by the global
// betas of the two movies.

export interface HotTakeResult {
  /** e.g. "only ~12% of players rank Speed over Heat. i'm one of them." */
  line: string;
  /** Estimated % of players who agree with the user's ordering (0-100) */
  agreePercent: number;
  /** True when the take is actually contrarian (<40% agree) */
  isSpicy: boolean;
}

/**
 * Probability that a random player ranks A over B, from global betas.
 */
function globalAgreeProbability(globalBetaA: number, globalBetaB: number): number {
  return 1 / (1 + Math.exp(globalBetaB - globalBetaA));
}

/**
 * Build a hot-take line for "user ranks movieA over movieB".
 * Returns null when global stats are missing or the take isn't contrarian
 * enough to be interesting (>=40% of players agree).
 */
export async function buildHotTake(
  movieAId: string,
  movieATitle: string,
  movieBId: string,
  movieBTitle: string,
): Promise<HotTakeResult | null> {
  try {
    const { data: stats } = await supabase
      .from('global_movie_stats')
      .select('movie_id, global_beta, unique_users_count')
      .in('movie_id', [movieAId, movieBId]);

    if (!stats || stats.length < 2) return null;

    const statsA = stats.find(s => s.movie_id === movieAId);
    const statsB = stats.find(s => s.movie_id === movieBId);
    if (!statsA || !statsB) return null;

    // Need a minimum of real data behind both movies for the stat to mean anything
    if ((statsA.unique_users_count || 0) < 3 || (statsB.unique_users_count || 0) < 3) {
      return null;
    }

    const agreeProb = globalAgreeProbability(statsA.global_beta || 0, statsB.global_beta || 0);
    const agreePercent = Math.round(agreeProb * 100);
    const isSpicy = agreePercent < 40;

    if (!isSpicy) return null;

    const shownPercent = Math.max(1, agreePercent);
    return {
      line: `only ~${shownPercent}% of players rank ${movieATitle} over ${movieBTitle}. i'm one of them.`,
      agreePercent,
      isSpicy,
    };
  } catch {
    return null;
  }
}
