import { supabase } from './supabase';
import { BracketMovie, BracketPick, compareBrackets } from '../utils/movieBracket';
import { challengeService } from './challengeService';
import { notificationService } from './notificationService';

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
  challenged_user_id: string | null;
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
   * If challengedUserId is provided, this is a directed friend challenge.
   */
  async createChallenge(
    movies: BracketMovie[],
    seed: number,
    picks: BracketPick[],
    winner: BracketMovie,
    creatorId: string | null,
    creatorName: string,
    challengedUserId?: string | null,
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
        challenged_user_id: challengedUserId || null,
        status: 'waiting',
      })
      .select()
      .single();

    if (error) {
      console.error('[Knockout] Create failed:', error);
      return { challenge: null, error: error.message };
    }

    // Push notify the challenged user
    const result = data as KnockoutChallenge;
    if (challengedUserId) {
      notificationService.notifyKnockoutChallenge(challengedUserId, creatorName, code).catch(() => {});
    }

    return { challenge: result };
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

    const result = data as KnockoutChallenge;
    if (result.creator_id && challengerId && result.creator_id !== challengerId) {
      challengeService.updateFriendshipStats(
        result.creator_id,
        challengerId,
        comparison.matchPercent,
      ).catch(() => {});
    }

    // Notify creator that challenge was completed
    if (result.creator_id) {
      notificationService.notifyKnockoutCompleted(
        result.creator_id,
        challengerName,
        comparison.matchPercent,
        result.code,
      ).catch(() => {});
    }

    return { challenge: result };
  },

  /**
   * Direct an existing challenge to a specific friend.
   * Creates a new knockout_challenges row with the same movies/seed/picks
   * so each friend gets their own challenge to respond to.
   */
  async directChallengeToFriend(
    sourceChallenge: KnockoutChallenge,
    friendId: string,
    creatorName: string,
  ): Promise<{ success: boolean; code?: string }> {
    const code = generateCode();

    const { data, error } = await supabase
      .from('knockout_challenges')
      .insert({
        code,
        movies: sourceChallenge.movies,
        seed: sourceChallenge.seed,
        creator_id: sourceChallenge.creator_id,
        creator_name: sourceChallenge.creator_name,
        creator_picks: sourceChallenge.creator_picks,
        creator_winner: sourceChallenge.creator_winner,
        challenged_user_id: friendId,
        status: 'waiting',
      })
      .select()
      .single();

    if (error) {
      console.error('[Knockout] directChallengeToFriend failed:', error);
      return { success: false };
    }

    // Send push notification with the new code
    notificationService.notifyKnockoutChallenge(friendId, creatorName, code).catch(() => {});

    return { success: true, code };
  },

  /**
   * Get user's knockout challenges (as creator, challenger, or challenged target).
   */
  async getMyChallenges(userId: string): Promise<KnockoutChallenge[]> {
    const { data, error } = await supabase
      .from('knockout_challenges')
      .select('*')
      .or(`creator_id.eq.${userId},challenger_id.eq.${userId},challenged_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) return [];
    return (data || []) as KnockoutChallenge[];
  },

  /**
   * Get pending challenges directed at a specific user (where creator played, user hasn't).
   */
  async getPendingChallengesForUser(userId: string): Promise<KnockoutChallenge[]> {
    const { data, error } = await supabase
      .from('knockout_challenges')
      .select('*')
      .eq('challenged_user_id', userId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as KnockoutChallenge[];
  },

  /**
   * Get count of unviewed completed challenges for a user.
   * "Unviewed" = completed challenges where user is creator or challenger,
   * completed after their last picks submission.
   */
  async getReadyGamesCount(userId: string): Promise<number> {
    // Challenges directed at user that are waiting (they need to play)
    const { count: pendingCount } = await supabase
      .from('knockout_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('challenged_user_id', userId)
      .eq('status', 'waiting');

    // Challenges user created that are now complete (friend played back)
    const { count: completedCount } = await supabase
      .from('knockout_challenges')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .eq('status', 'complete')
      .not('challenger_id', 'is', null);

    return (pendingCount || 0) + (completedCount || 0);
  },
};

export default knockoutService;
