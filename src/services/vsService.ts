import { supabase } from './supabase';
import { notificationService } from './notificationService';
import { activityService } from './activityService';

// ============================================
// TYPES
// ============================================

export interface VsMovie {
  id: string;
  title: string;
  year: number;
  posterUrl: string;
  beta: number; // challenger's beta for this movie
}

export interface VsPair {
  movieA: VsMovie;
  movieB: VsMovie;
  challengerPick?: 'A' | 'B'; // which the challenger picks (manual)
  challengedPick?: 'A' | 'B'; // which the challenged picks (manual)
  match?: boolean; // did they agree? (computed when both done)
}

export interface VsChallenge {
  id: string;
  code: string;
  challenger_id: string;
  challenged_id: string | null;
  challenged_name: string | null;
  status: 'pending' | 'selecting' | 'challenged_comparing' | 'challenger_comparing' | 'complete';
  mode: 'auto' | 'manual';
  pool: VsMovie[];
  selected_movies: VsMovie[];
  pairs: VsPair[];
  current_pair: number;
  challenger_current_pair: number;
  score: number | null;
  results: VsResults | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
}

export interface VsResults {
  score: number;
  pairs: VsPair[];
  challengerName: string;
  challengedName: string;
  biggestAgreement?: { movieA: string; movieB: string };
  biggestDisagreement?: { movieA: string; movieB: string; challengerPick: string; challengedPick: string };
}

// ============================================
// CONSTANTS
// ============================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const POOL_SIZE = 16;
const PAIR_COUNT = 10;
const MIN_MOVIES = 4;

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

// ============================================
// VS SERVICE
// ============================================

export const vsService = {
  /**
   * Create a challenge. Always manual mode — both players compare pairs.
   * If both on aaybee, pool is built from common ranked movies.
   */
  createChallenge: async (
    challengerId: string,
    challengedId: string | null,
    challengedName?: string
  ): Promise<{ challenge: VsChallenge | null; error?: string }> => {
    try {
      // Generate unique code — check against ALL codes (not just active) since DB has UNIQUE constraint
      let code = generateCode();
      let attempts = 0;
      while (attempts < 10) {
        const { data: existing } = await supabase
          .from('vs_challenges')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!existing) break;
        code = generateCode();
        attempts++;
      }

      // Get challenger's ranked movies
      const { data: challengerMovies } = await supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', challengerId)
        .eq('status', 'known')
        .order('beta', { ascending: false });

      if (!challengerMovies || challengerMovies.length < PAIR_COUNT) {
        return { challenge: null, error: 'You need at least 10 ranked movies to create a challenge' };
      }

      let pool: VsMovie[] = [];

      // Build pool — use common movies if both on aaybee, otherwise challenger's library
      if (challengedId) {
        const { data: challengedMovies } = await supabase
          .from('user_movies')
          .select('movie_id, beta')
          .eq('user_id', challengedId)
          .eq('status', 'known')
          .order('beta', { ascending: false });

        if (challengedMovies && challengedMovies.length >= PAIR_COUNT) {
          // Find common ranked movies
          const challengedMap = new Map(challengedMovies.map(m => [m.movie_id, m.beta]));
          const commonMovies: { movie_id: string; beta: number }[] = [];

          for (const cm of challengerMovies) {
            if (challengedMap.has(cm.movie_id)) {
              commonMovies.push({ movie_id: cm.movie_id, beta: cm.beta });
            }
          }

          if (commonMovies.length >= PAIR_COUNT * 2) {
            // Both on aaybee with enough common movies — build pool from overlap
            pool = await vsService._buildPool(commonMovies);
          }
        }
      }

      // Fallback: build pool from challenger's library
      if (pool.length === 0) {
        pool = await vsService._buildPool(challengerMovies);
      }

      const { data: challenge, error } = await supabase
        .from('vs_challenges')
        .insert({
          code,
          challenger_id: challengerId,
          challenged_id: challengedId,
          challenged_name: challengedName || null,
          status: 'pending',
          mode: 'manual',
          pool,
          selected_movies: [],
          pairs: [],
          current_pair: 0,
          challenger_current_pair: 0,
          score: null,
          results: null,
          completed_at: null,
        })
        .select()
        .single();

      if (error) {
        console.error('[VsService] Create challenge error:', error);
        return { challenge: null, error: error.message };
      }

      // Notify challenged user and log activity
      if (challengedId && challenge) {
        const { data: challengerProfile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', challengerId)
          .single();
        const name = challengerProfile?.display_name || 'Someone';
        notificationService.notifyChallenge(challengedId, name, code).catch(() => {});
        activityService.logVsChallenge(challengerId, challengedName || 'a friend', code).catch(() => {});
      }

      return { challenge };
    } catch (err) {
      console.error('[VsService] Create challenge error:', err);
      return { challenge: null, error: 'Failed to create challenge' };
    }
  },

  /**
   * Create a challenge with a pre-built pool (for curated packs).
   */
  createChallengeWithPool: async (
    challengerId: string | null,
    pool: VsMovie[]
  ): Promise<{ challenge: VsChallenge | null; error?: string }> => {
    try {
      let code = generateCode();
      for (let i = 0; i < 10; i++) {
        const { data: existing } = await supabase
          .from('vs_challenges')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!existing) break;
        code = generateCode();
      }

      const { data: challenge, error } = await supabase
        .from('vs_challenges')
        .insert({
          code,
          challenger_id: challengerId,
          challenged_id: null,
          challenged_name: null,
          status: 'pending',
          mode: 'manual',
          pool,
          selected_movies: [],
          pairs: [],
          current_pair: 0,
          challenger_current_pair: 0,
          score: null,
          results: null,
          completed_at: null,
        })
        .select()
        .single();

      if (error) return { challenge: null, error: error.message };
      return { challenge };
    } catch {
      return { challenge: null, error: 'Failed to create challenge' };
    }
  },

  /**
   * Join a challenge by code
   */
  joinChallenge: async (
    code: string,
    userId: string,
    displayName: string
  ): Promise<{ challenge: VsChallenge | null; error?: string }> => {
    try {
      const { data: challenges, error: findError } = await supabase
        .from('vs_challenges')
        .select('*')
        .eq('code', code.toUpperCase())
        .neq('status', 'complete')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      const challenge = challenges?.[0] || null;

      if (findError || !challenge) {
        return { challenge: null, error: 'Challenge not found or expired' };
      }

      if (challenge.challenger_id === userId) {
        return { challenge: null, error: "You can't join your own challenge" };
      }

      // Update challenge with challenged user info
      const { data: updated, error: updateError } = await supabase
        .from('vs_challenges')
        .update({
          challenged_id: userId,
          challenged_name: displayName,
          status: 'selecting',
        })
        .eq('id', challenge.id)
        .select()
        .single();

      if (updateError) {
        return { challenge: null, error: updateError.message };
      }

      // Notify challenger that someone joined their challenge
      if (updated) {
        notificationService.notifyChallengeJoined(
          challenge.challenger_id,
          displayName,
          challenge.code
        ).catch(() => {});
      }

      return { challenge: updated };
    } catch (err) {
      console.error('[VsService] Join challenge error:', err);
      return { challenge: null, error: 'Failed to join challenge' };
    }
  },

  /**
   * Join a challenge as a guest (no auth). Sets name and status only.
   */
  joinChallengeAsGuest: async (
    code: string,
    displayName: string
  ): Promise<{ challenge: VsChallenge | null; error?: string }> => {
    try {
      const { data: challenges, error: findError } = await supabase
        .from('vs_challenges')
        .select('*')
        .eq('code', code.toUpperCase())
        .neq('status', 'complete')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      const challenge = challenges?.[0] || null;

      if (findError || !challenge) {
        return { challenge: null, error: 'Challenge not found or expired' };
      }

      const { data: updated, error: updateError } = await supabase
        .from('vs_challenges')
        .update({
          challenged_name: displayName,
          status: 'selecting',
        })
        .eq('id', challenge.id)
        .select()
        .single();

      if (updateError) {
        return { challenge: null, error: updateError.message };
      }

      return { challenge: updated };
    } catch (err) {
      console.error('[VsService] Guest join error:', err);
      return { challenge: null, error: 'Failed to join challenge' };
    }
  },

  /**
   * Select 10 movies from the pool (manual mode)
   */
  selectMovies: async (
    challengeId: string,
    selectedMovies: VsMovie[]
  ): Promise<{ pairs: VsPair[]; error?: string }> => {
    try {
      if (selectedMovies.length < MIN_MOVIES) {
        return { pairs: [], error: `Select at least ${MIN_MOVIES} movies` };
      }
      if (selectedMovies.length > PAIR_COUNT) {
        return { pairs: [], error: `Select at most ${PAIR_COUNT} movies` };
      }

      // Get the challenge to access challenger betas
      const { data: challenge } = await supabase
        .from('vs_challenges')
        .select('*')
        .eq('id', challengeId)
        .single();

      if (!challenge) {
        return { pairs: [], error: 'Challenge not found' };
      }

      // Generate 10 pairs from the 10 selected movies
      const pairs = vsService._generateManualPairs(selectedMovies);

      const { error } = await supabase
        .from('vs_challenges')
        .update({
          selected_movies: selectedMovies,
          pairs,
          current_pair: 0,
          challenger_current_pair: 0,
          status: 'challenged_comparing',
        })
        .eq('id', challengeId);

      if (error) {
        return { pairs: [], error: error.message };
      }

      return { pairs };
    } catch (err) {
      return { pairs: [], error: 'Failed to select movies' };
    }
  },

  /**
   * Submit a pick for a pair.
   * role: 'challenged' or 'challenger' — determines which field is set.
   */
  submitPick: async (
    challengeId: string,
    pairIndex: number,
    pick: 'A' | 'B',
    role: 'challenged' | 'challenger' = 'challenged'
  ): Promise<{ isComplete: boolean; nextStatus?: string; score?: number; error?: string }> => {
    try {
      const { data: challenge } = await supabase
        .from('vs_challenges')
        .select('*')
        .eq('id', challengeId)
        .single();

      if (!challenge) {
        return { isComplete: false, error: 'Challenge not found' };
      }

      const pairs = [...challenge.pairs] as VsPair[];

      if (role === 'challenged') {
        pairs[pairIndex] = { ...pairs[pairIndex], challengedPick: pick };
      } else {
        pairs[pairIndex] = { ...pairs[pairIndex], challengerPick: pick };
      }

      const nextPair = pairIndex + 1;
      const isLastPick = nextPair >= pairs.length;

      if (role === 'challenged' && isLastPick) {
        // Challenged is done — move to challenger's turn
        await supabase
          .from('vs_challenges')
          .update({
            pairs,
            current_pair: nextPair,
            status: 'challenger_comparing',
          })
          .eq('id', challengeId);

        // Notify challenger it's their turn
        notificationService.notifyChallengerReady(
          challenge.challenger_id,
          challenge.challenged_name || 'Your opponent',
          challenge.code
        ).catch(() => {});

        return { isComplete: true, nextStatus: 'challenger_comparing' };
      }

      if (role === 'challenger' && isLastPick) {
        // Challenger is done — compute matches and score
        const finalPairs = pairs.map(p => ({
          ...p,
          match: p.challengerPick === p.challengedPick,
        }));
        const finalScore = finalPairs.filter(p => p.match).length;

        // Get names
        const { data: challengerProfile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('id', challenge.challenger_id)
          .single();

        const agreements = finalPairs.filter(p => p.match);
        const disagreements = finalPairs.filter(p => !p.match);

        const results: VsResults = {
          score: finalScore,
          pairs: finalPairs,
          challengerName: challengerProfile?.display_name || 'Challenger',
          challengedName: challenge.challenged_name || 'You',
          biggestAgreement: agreements.length > 0 ? {
            movieA: agreements[0].movieA.title,
            movieB: agreements[0].movieB.title,
          } : undefined,
          biggestDisagreement: disagreements.length > 0 ? {
            movieA: disagreements[0].movieA.title,
            movieB: disagreements[0].movieB.title,
            challengerPick: disagreements[0].challengerPick === 'A' ? disagreements[0].movieA.title : disagreements[0].movieB.title,
            challengedPick: disagreements[0].challengedPick === 'A' ? disagreements[0].movieA.title : disagreements[0].movieB.title,
          } : undefined,
        };

        await supabase
          .from('vs_challenges')
          .update({
            pairs: finalPairs,
            challenger_current_pair: nextPair,
            status: 'complete',
            score: finalScore,
            results,
            completed_at: new Date().toISOString(),
          })
          .eq('id', challengeId);

        // Log completed challenge to activity feed for both players
        activityService.logVsChallenge(
          challenge.challenger_id,
          challenge.challenged_name || 'a friend',
          challenge.code,
          finalScore
        ).catch(() => {});

        if (challenge.challenged_id) {
          const challengerName = challengerProfile?.display_name || 'someone';
          activityService.logVsChallenge(
            challenge.challenged_id,
            challengerName,
            challenge.code,
            finalScore
          ).catch(() => {});
        }

        return { isComplete: true, score: finalScore };
      }

      // Not last pick — just advance
      const updateFields: any = { pairs };
      if (role === 'challenged') {
        updateFields.current_pair = nextPair;
      } else {
        updateFields.challenger_current_pair = nextPair;
      }

      await supabase
        .from('vs_challenges')
        .update(updateFields)
        .eq('id', challengeId);

      return { isComplete: false };
    } catch (err) {
      return { isComplete: false, error: 'Failed to submit pick' };
    }
  },

  /**
   * Get challenges for a user (both sent and received)
   */
  getMyChallenges: async (userId: string): Promise<VsChallenge[]> => {
    try {
      const { data, error } = await supabase
        .from('vs_challenges')
        .select('*')
        .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[VsService] Get challenges error:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      return [];
    }
  },

  /**
   * Get a single challenge by ID
   */
  getChallenge: async (challengeId: string): Promise<VsChallenge | null> => {
    const { data } = await supabase
      .from('vs_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();
    return data || null;
  },

  /**
   * Get a challenge by code
   */
  getChallengeByCode: async (code: string): Promise<VsChallenge | null> => {
    const { data } = await supabase
      .from('vs_challenges')
      .select('*')
      .eq('code', code.toUpperCase())
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  },

  /**
   * Subscribe to challenge updates
   */
  subscribeToChallenge: (
    challengeId: string,
    onUpdate: (challenge: VsChallenge) => void
  ) => {
    const fetchChallenge = async () => {
      const challenge = await vsService.getChallenge(challengeId);
      if (challenge) onUpdate(challenge);
    };

    fetchChallenge();

    return supabase
      .channel(`vs:${challengeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vs_challenges',
          filter: `id=eq.${challengeId}`,
        },
        () => fetchChallenge()
      )
      .subscribe();
  },

  unsubscribe: (channel: any) => {
    if (channel) supabase.removeChannel(channel);
  },

  // ============================================
  // INTERNAL HELPERS
  // ============================================

  /**
   * Build a 16-movie pool from challenger's ranked library.
   * Picks movies at varied ranking positions for diversity.
   */
  _buildPool: async (
    challengerMovies: { movie_id: string; beta: number }[]
  ): Promise<VsMovie[]> => {
    const total = challengerMovies.length;
    if (total < POOL_SIZE) {
      // Use all if not enough
      const ids = challengerMovies.map(m => m.movie_id);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title, year, poster_url')
        .in('id', ids);

      return challengerMovies.map(cm => {
        const movie = movies?.find(m => m.id === cm.movie_id);
        return {
          id: cm.movie_id,
          title: movie?.title || 'Unknown',
          year: movie?.year || 0,
          posterUrl: movie?.poster_url || '',
          beta: cm.beta,
        };
      });
    }

    // Sample 16 movies across the ranking spectrum
    // Take from: top 4, middle-high 4, middle 4, lower-middle 4
    const indices: number[] = [];
    const quarterSize = Math.floor(total / 4);

    for (let q = 0; q < 4; q++) {
      const start = q * quarterSize;
      const end = q === 3 ? total : (q + 1) * quarterSize;
      const available = Array.from({ length: end - start }, (_, i) => start + i);
      // Shuffle and pick 4
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      indices.push(...available.slice(0, 4));
    }

    const selectedMovies = indices.map(i => challengerMovies[i]);
    const movieIds = selectedMovies.map(m => m.movie_id);

    const { data: movies } = await supabase
      .from('movies')
      .select('id, title, year, poster_url')
      .in('id', movieIds);

    return selectedMovies.map(cm => {
      const movie = movies?.find(m => m.id === cm.movie_id);
      return {
        id: cm.movie_id,
        title: movie?.title || 'Unknown',
        year: movie?.year || 0,
        posterUrl: movie?.poster_url || '',
        beta: cm.beta,
      };
    });
  },

  /**
   * Generate 10 unique pairs from 10 selected movies.
   * 10 movies = 45 possible pairs (10 choose 2). We pick 10 diverse ones.
   * Strategy: each movie appears in ~2 pairs, spread across diverse matchups.
   */
  _generateManualPairs: (
    selectedMovies: VsMovie[],
  ): VsPair[] => {
    // Generate all possible pairs
    const allPairs: [VsMovie, VsMovie][] = [];
    for (let i = 0; i < selectedMovies.length; i++) {
      for (let j = i + 1; j < selectedMovies.length; j++) {
        allPairs.push([selectedMovies[i], selectedMovies[j]]);
      }
    }

    // Shuffle all possible pairs
    for (let i = allPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
    }

    // Greedily select pairs, ensuring no movie appears more than 3 times
    // Cap: min(10, floor(N * 1.5)) where N = number of movies
    const maxPairs = Math.min(PAIR_COUNT, Math.floor(selectedMovies.length * 1.5));
    const pairs: VsPair[] = [];
    const movieCount = new Map<string, number>();

    for (const [a, b] of allPairs) {
      if (pairs.length >= maxPairs) break;
      const countA = movieCount.get(a.id) || 0;
      const countB = movieCount.get(b.id) || 0;
      if (countA >= 3 || countB >= 3) continue;

      // Randomly assign A/B position
      const flip = Math.random() > 0.5;
      pairs.push({
        movieA: flip ? a : b,
        movieB: flip ? b : a,
      });
      movieCount.set(a.id, countA + 1);
      movieCount.set(b.id, countB + 1);
    }

    return pairs;
  },
};

export default vsService;
