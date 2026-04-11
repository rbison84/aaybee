import { supabase } from './supabase';
import { BracketMovie, BracketPick, compareBrackets } from '../utils/movieBracket';
import { challengeService } from './challengeService';

// ============================================
// TYPES
// ============================================

export interface KnockoutChallenge {
  id: string;
  code: string;
  movies: BracketMovie[];
  seed: number;
  creator_id: string | null;
  creator_name: string;
  creator_picks: BracketPick[] | null;
  creator_winner: BracketMovie | null;
  challenger_id: string | null;
  challenger_name: string | null;
  challenger_picks: BracketPick[] | null;
  challenger_winner: BracketMovie | null;
  match_percent: number | null;
  kendall_tau: number | null;
  same_winner: boolean | null;
  status: 'waiting' | 'playing' | 'complete';
  created_at: string;
  completed_at: string | null;
}

// ============================================
// HELPERS
// ============================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ============================================
// SERVICE
// ============================================

export const knockoutService = {
  /**
   * Create a knockout challenge after Player A finishes their bracket.
   */
  async createChallenge(
    movies: BracketMovie[],
    seed: number,
    picks: BracketPick[],
    winner: BracketMovie,
    creatorId: string | null,
    creatorName: string,
  ): Promise<{ challenge: KnockoutChallenge | null; error?: string }> {
    const code = generateCode();

    const { data, error } = await supabase
      .from('knockout_challenges')
      .insert({
        code,
        movies,
        seed,
        creator_id: creatorId,
        creator_name: creatorName,
        creator_picks: picks,
        creator_winner: winner,
        status: 'waiting',
      })
      .select()
      .single();

    if (error) {
      console.error('[Knockout] Create failed:', error);
      return { challenge: null, error: error.message };
    }

    return { challenge: data as KnockoutChallenge };
  },

  /**
   * Get a knockout challenge by code.
   */
  async getChallengeByCode(code: string): Promise<KnockoutChallenge | null> {
    const { data, error } = await supabase
      .from('knockout_challenges')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) return null;
    return data as KnockoutChallenge;
  },

  /**
   * Submit challenger's picks and compute results.
   */
  async submitChallengerPicks(
    challengeId: string,
    picks: BracketPick[],
    winner: BracketMovie,
    challengerId: string | null,
    challengerName: string,
    creatorPicks: BracketPick[],
    movieCount: number,
  ): Promise<{ challenge: KnockoutChallenge | null; error?: string }> {
    // Compute taste match
    const comparison = compareBrackets(movieCount, creatorPicks, picks);

    const { data, error } = await supabase
      .from('knockout_challenges')
      .update({
        challenger_id: challengerId,
        challenger_name: challengerName,
        challenger_picks: picks,
        challenger_winner: winner,
        match_percent: comparison.matchPercent,
        kendall_tau: comparison.kendallTau,
        same_winner: comparison.sameWinner,
        status: 'complete',
        completed_at: new Date().toISOString(),
      })
      .eq('id', challengeId)
      .select()
      .single();

    if (error) {
      console.error('[Knockout] Submit failed:', error);
      return { challenge: null, error: error.message };
    }

    // Update friendship stats if both players are authenticated
    const result = data as KnockoutChallenge;
    if (result.creator_id && challengerId && result.creator_id !== challengerId) {
      challengeService.updateFriendshipStats(
        result.creator_id,
        challengerId,
        comparison.matchPercent,
      ).catch(() => {});
    }

    return { challenge: result };
  },

  /**
   * Get user's knockout challenges (as creator or challenger).
   */
  async getMyChallenges(userId: string): Promise<KnockoutChallenge[]> {
    const { data, error } = await supabase
      .from('knockout_challenges')
      .select('*')
      .or(`creator_id.eq.${userId},challenger_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return [];
    return (data || []) as KnockoutChallenge[];
  },
};

export default knockoutService;
