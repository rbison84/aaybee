import { supabase } from './supabase';
import { BracketMovie, BracketPick, createVsBracket } from '../utils/movieBracket';
import { notificationService } from './notificationService';

// ============================================
// TYPES
// ============================================

export interface NegotiationEntry {
  pairIndex: number;
  proposer: 1 | 2;
  proposedMovie: BracketMovie;
  response: 'agree' | 'disagree' | 'pending';
  advancingMovie: BracketMovie | null;
}

export interface DecideSession {
  id: string;
  code: string;
  person1_id: string | null;
  person1_name: string;
  person1_movies: BracketMovie[] | null;
  person1_picks: BracketPick[] | null;
  person1_final4: BracketMovie[] | null;
  person2_id: string | null;
  person2_name: string | null;
  person2_movies: BracketMovie[] | null;
  person2_picks: BracketPick[] | null;
  person2_final4: BracketMovie[] | null;
  negotiation_movies: BracketMovie[] | null;
  negotiation_pairs: { movieA: BracketMovie; movieB: BracketMovie }[] | null;
  negotiation_log: NegotiationEntry[] | null;
  current_proposer: number;
  current_pair_index: number;
  winner_movie: BracketMovie | null;
  status: 'waiting_p2' | 'p1_knockout' | 'p2_knockout' | 'negotiating' | 'complete';
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

/**
 * Build 4 pairs from 8 movies for the negotiation round.
 * Person 1's movies are interleaved with Person 2's.
 */
function buildNegotiationPairs(
  p1Final: BracketMovie[],
  p2Final: BracketMovie[]
): { movieA: BracketMovie; movieB: BracketMovie }[] {
  // Pair each of P1's movies with one of P2's movies
  const pairs: { movieA: BracketMovie; movieB: BracketMovie }[] = [];
  for (let i = 0; i < Math.min(p1Final.length, p2Final.length); i++) {
    pairs.push({ movieA: p1Final[i], movieB: p2Final[i] });
  }
  return pairs;
}

// ============================================
// SERVICE
// ============================================

export const decideSessionService = {
  /**
   * Create a new decide session. Person 1 starts their knockout immediately.
   */
  async createSession(
    person1Id: string | null,
    person1Name: string,
    person1Movies: BracketMovie[],
  ): Promise<{ session: DecideSession | null; error?: string }> {
    const code = generateCode();

    const { data, error } = await supabase
      .from('decide_sessions')
      .insert({
        code,
        person1_id: person1Id,
        person1_name: person1Name,
        person1_movies: person1Movies,
        status: 'p1_knockout',
      })
      .select()
      .single();

    if (error) {
      console.error('[DecideSession] Create failed:', error);
      return { session: null, error: error.message };
    }

    return { session: data as DecideSession };
  },

  /**
   * Get session by code.
   */
  async getByCode(code: string): Promise<DecideSession | null> {
    const { data } = await supabase
      .from('decide_sessions')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    return data as DecideSession | null;
  },

  /**
   * Person 1 completes their knockout — saves their final 4.
   */
  async submitPerson1Knockout(
    sessionId: string,
    picks: BracketPick[],
    final4: BracketMovie[],
  ): Promise<{ session: DecideSession | null; error?: string }> {
    const { data, error } = await supabase
      .from('decide_sessions')
      .update({
        person1_picks: picks,
        person1_final4: final4,
        status: 'waiting_p2',
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) return { session: null, error: error.message };
    return { session: data as DecideSession };
  },

  /**
   * Person 2 joins and gets their 16 movies (no overlap with Person 1).
   */
  async joinSession(
    sessionId: string,
    person2Id: string | null,
    person2Name: string,
    person2Movies: BracketMovie[],
  ): Promise<{ session: DecideSession | null; error?: string }> {
    const { data, error } = await supabase
      .from('decide_sessions')
      .update({
        person2_id: person2Id,
        person2_name: person2Name,
        person2_movies: person2Movies,
        status: 'p2_knockout',
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) return { session: null, error: error.message };
    return { session: data as DecideSession };
  },

  /**
   * Person 2 completes their knockout — saves final 4 and builds negotiation pairs.
   */
  async submitPerson2Knockout(
    sessionId: string,
    picks: BracketPick[],
    final4: BracketMovie[],
    person1Final4: BracketMovie[],
  ): Promise<{ session: DecideSession | null; error?: string }> {
    const pairs = buildNegotiationPairs(person1Final4, final4);
    const allMovies = [...person1Final4, ...final4];

    const { data, error } = await supabase
      .from('decide_sessions')
      .update({
        person2_picks: picks,
        person2_final4: final4,
        negotiation_movies: allMovies,
        negotiation_pairs: pairs,
        negotiation_log: [],
        current_proposer: 1,
        current_pair_index: 0,
        status: 'negotiating',
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) return { session: null, error: error.message };
    return { session: data as DecideSession };
  },

  /**
   * Proposer makes their pick for the current pair.
   */
  async submitProposal(
    sessionId: string,
    proposedMovie: BracketMovie,
    pairIndex: number,
    proposer: 1 | 2,
  ): Promise<{ session: DecideSession | null; error?: string }> {
    // Fetch current session
    const { data: current } = await supabase
      .from('decide_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!current) return { session: null, error: 'Session not found' };

    const log: NegotiationEntry[] = [...(current.negotiation_log || [])];
    log.push({
      pairIndex,
      proposer,
      proposedMovie,
      response: 'pending',
      advancingMovie: null,
    });

    const { data, error } = await supabase
      .from('decide_sessions')
      .update({ negotiation_log: log })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) return { session: null, error: error.message };

    // Notify the responder it's their turn
    const session = data as DecideSession;
    const responderId = proposer === 1 ? session.person2_id : session.person1_id;
    const proposerName = proposer === 1 ? session.person1_name : (session.person2_name || 'Partner');
    if (responderId) {
      notificationService.notifyDecideTurn(
        responderId, proposerName, proposedMovie.title, session.code,
      ).catch(() => {});
    }

    return { session };
  },

  /**
   * Responder agrees or disagrees with the proposal.
   * If agree: proposed movie advances, same proposer continues.
   * If disagree: OTHER movie advances, responder becomes proposer.
   */
  async submitResponse(
    sessionId: string,
    response: 'agree' | 'disagree',
  ): Promise<{ session: DecideSession | null; error?: string }> {
    const { data: current } = await supabase
      .from('decide_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!current) return { session: null, error: 'Session not found' };

    const log: NegotiationEntry[] = [...(current.negotiation_log || [])];
    const pairs = current.negotiation_pairs || [];
    const lastEntry = log[log.length - 1];
    if (!lastEntry || lastEntry.response !== 'pending') {
      return { session: null, error: 'No pending proposal' };
    }

    const pair = pairs[lastEntry.pairIndex];
    if (!pair) return { session: null, error: 'Pair not found' };

    let advancingMovie: BracketMovie;
    let nextProposer = current.current_proposer;

    if (response === 'agree') {
      // Proposed movie advances, proposer stays
      advancingMovie = lastEntry.proposedMovie;
    } else {
      // Other movie advances, responder becomes proposer
      advancingMovie = pair.movieA.id === lastEntry.proposedMovie.id ? pair.movieB : pair.movieA;
      nextProposer = current.current_proposer === 1 ? 2 : 1;
    }

    lastEntry.response = response;
    lastEntry.advancingMovie = advancingMovie;

    const nextPairIndex = current.current_pair_index + 1;

    // Check if negotiation round is complete
    const advancedMovies = log
      .filter(e => e.advancingMovie)
      .map(e => e.advancingMovie!);

    // If we've gone through all pairs in current round
    if (nextPairIndex >= pairs.length) {
      if (advancedMovies.length === 1) {
        // We have a winner!
        const { data, error } = await supabase
          .from('decide_sessions')
          .update({
            negotiation_log: log,
            winner_movie: advancedMovies[0],
            status: 'complete',
            completed_at: new Date().toISOString(),
          })
          .eq('id', sessionId)
          .select()
          .single();

        if (error) return { session: null, error: error.message };
        return { session: data as DecideSession };
      }

      // Build next round of pairs from advanced movies
      const nextPairs: { movieA: BracketMovie; movieB: BracketMovie }[] = [];
      for (let i = 0; i < advancedMovies.length; i += 2) {
        if (i + 1 < advancedMovies.length) {
          nextPairs.push({ movieA: advancedMovies[i], movieB: advancedMovies[i + 1] });
        } else {
          // Odd one out — auto-advances (shouldn't happen with 8→4→2→1)
          nextPairs.push({ movieA: advancedMovies[i], movieB: advancedMovies[i] });
        }
      }

      const { data, error } = await supabase
        .from('decide_sessions')
        .update({
          negotiation_log: log,
          negotiation_pairs: nextPairs,
          current_proposer: nextProposer,
          current_pair_index: 0,
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) return { session: null, error: error.message };
      return { session: data as DecideSession };
    }

    // More pairs in current round
    const { data, error } = await supabase
      .from('decide_sessions')
      .update({
        negotiation_log: log,
        current_proposer: nextProposer,
        current_pair_index: nextPairIndex,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) return { session: null, error: error.message };
    return { session: data as DecideSession };
  },

  /**
   * Get user's decide sessions.
   */
  async getMySessions(userId: string): Promise<DecideSession[]> {
    const { data } = await supabase
      .from('decide_sessions')
      .select('*')
      .or(`person1_id.eq.${userId},person2_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(10);

    return (data || []) as DecideSession[];
  },
};

export default decideSessionService;
