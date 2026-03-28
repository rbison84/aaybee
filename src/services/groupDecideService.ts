import { supabase } from './supabase';
import { PoolCandidate } from './decideService';

// ============================================
// TYPES
// ============================================

export interface GroupPreferences {
  tone: 'light' | 'heavy';
  entertainment: 'laughs' | 'thrills';
  pacing: 'slow' | 'fast';
  novelty: 'familiar' | 'fresh';
  era: 'classic' | 'modern';
}

export interface DecideRoom {
  id: string;
  code: string;
  host_id: string;
  status: 'waiting' | 'preferences' | 'building' | 'tournament' | 'recap' | 'result';
  preferences: GroupPreferences | null;
  pool: PoolCandidate[];
  current_round: number; // 1 = R1, 2 = QF, 3 = SF, 4 = Final
  current_match: number; // Match index within current round
  round_winners: PoolCandidate[][]; // Winners from each round
  round_losers: PoolCandidate[][]; // Losers with vote margins for replacement
  champion: PoolCandidate | null;
  couples_picker_id: string | null;
  created_at: string;
  expires_at: string;
}

export interface DecideRoomMember {
  id: string;
  room_id: string;
  user_id: string | null;
  display_name: string;
  is_host: boolean;
  vetoes_remaining: number;
  joined_at: string;
}

export interface PreferenceVote {
  room_id: string;
  user_id: string;
  preferences: GroupPreferences;
}

export interface MatchVote {
  id: string;
  room_id: string;
  round: number;
  match_index: number;
  user_id: string;
  choice: 'A' | 'B';
  voted_at: string;
}

export interface MatchResult {
  movieA: PoolCandidate;
  movieB: PoolCandidate;
  votesA: number;
  votesB: number;
  winner: PoolCandidate;
  loser: PoolCandidate;
  margin: number; // Absolute difference in votes
  isTie: boolean;
}

export interface CouplesResult {
  winner: PoolCandidate;
  loser: PoolCandidate;
  agreed: boolean;
  nextPickerId: string;
}

export interface VetoAction {
  room_id: string;
  user_id: string;
  user_name: string;
  vetoed_movie_id: string;
  replacement_movie: PoolCandidate | null;
  round: number;
}

// ============================================
// CONSTANTS
// ============================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O to avoid confusion
const CODE_LENGTH = 4;
const ROOM_EXPIRY_MINUTES = 30;

// Round structure: [matches in R1, QF, SF, Final]
const MATCHES_PER_ROUND = [8, 4, 2, 1];
// Couples bracket: 8 movies — R1(4), SF(2), Final(1)
const COUPLES_MATCHES_PER_ROUND = [4, 2, 1];

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function aggregatePreferences(votes: PreferenceVote[]): GroupPreferences {
  const counts = {
    tone: { light: 0, heavy: 0 },
    entertainment: { laughs: 0, thrills: 0 },
    pacing: { slow: 0, fast: 0 },
    novelty: { familiar: 0, fresh: 0 },
    era: { classic: 0, modern: 0 },
  };

  for (const vote of votes) {
    counts.tone[vote.preferences.tone]++;
    counts.entertainment[vote.preferences.entertainment]++;
    counts.pacing[vote.preferences.pacing]++;
    counts.novelty[vote.preferences.novelty]++;
    counts.era[vote.preferences.era]++;
  }

  // Majority wins, random tiebreaker
  const pick = <T extends string>(a: T, b: T, countA: number, countB: number): T => {
    if (countA > countB) return a;
    if (countB > countA) return b;
    return Math.random() > 0.5 ? a : b;
  };

  return {
    tone: pick('light', 'heavy', counts.tone.light, counts.tone.heavy),
    entertainment: pick('laughs', 'thrills', counts.entertainment.laughs, counts.entertainment.thrills),
    pacing: pick('slow', 'fast', counts.pacing.slow, counts.pacing.fast),
    novelty: pick('familiar', 'fresh', counts.novelty.familiar, counts.novelty.fresh),
    era: pick('classic', 'modern', counts.era.classic, counts.era.modern),
  };
}

// ============================================
// GROUP DECIDE SERVICE
// ============================================

export const groupDecideService = {
  // ==================
  // ROOM MANAGEMENT
  // ==================

  /**
   * Create a new decide room
   */
  createRoom: async (hostId: string, hostName: string): Promise<{ room: DecideRoom; error?: string }> => {
    try {
      // Generate unique code
      let code = generateRoomCode();
      let attempts = 0;

      // Check for collision (unlikely but possible)
      while (attempts < 5) {
        const { data: existing } = await supabase
          .from('decide_rooms')
          .select('id')
          .eq('code', code)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (!existing) break;
        code = generateRoomCode();
        attempts++;
      }

      const expiresAt = new Date(Date.now() + ROOM_EXPIRY_MINUTES * 60 * 1000).toISOString();

      const roomData = {
        code,
        host_id: hostId,
        status: 'waiting' as const,
        preferences: null,
        pool: [],
        current_round: 0,
        current_match: 0,
        round_winners: [],
        round_losers: [],
        champion: null,
        expires_at: expiresAt,
      };

      const { data: room, error } = await supabase
        .from('decide_rooms')
        .insert(roomData)
        .select()
        .single();

      if (error) {
        console.error('[GroupDecide] Create room error:', error);
        return { room: null as any, error: error.message };
      }

      // Add host as member
      await supabase.from('decide_room_members').insert({
        room_id: room.id,
        user_id: hostId,
        display_name: hostName,
        is_host: true,
        vetoes_remaining: 1,
      });

      return { room };
    } catch (err) {
      console.error('[GroupDecide] Create room error:', err);
      return { room: null as any, error: 'Failed to create room' };
    }
  },

  /**
   * Join an existing room by code
   */
  joinRoom: async (
    code: string,
    userId: string | null,
    displayName: string
  ): Promise<{ room: DecideRoom; member: DecideRoomMember; error?: string }> => {
    try {
      // Find room by code
      const { data: room, error: roomError } = await supabase
        .from('decide_rooms')
        .select('*')
        .eq('code', code.toUpperCase())
        .gt('expires_at', new Date().toISOString())
        .single();

      if (roomError || !room) {
        return { room: null as any, member: null as any, error: 'Room not found or expired' };
      }

      if (room.status !== 'waiting') {
        return { room: null as any, member: null as any, error: 'Room already started' };
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('decide_room_members')
        .select('*')
        .eq('room_id', room.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        return { room, member: existingMember };
      }

      // Add as new member
      const { data: member, error: memberError } = await supabase
        .from('decide_room_members')
        .insert({
          room_id: room.id,
          user_id: userId,
          display_name: displayName,
          is_host: false,
          vetoes_remaining: 1,
        })
        .select()
        .single();

      if (memberError) {
        return { room: null as any, member: null as any, error: memberError.message };
      }

      return { room, member };
    } catch (err) {
      console.error('[GroupDecide] Join room error:', err);
      return { room: null as any, member: null as any, error: 'Failed to join room' };
    }
  },

  /**
   * Get room members
   */
  getRoomMembers: async (roomId: string): Promise<DecideRoomMember[]> => {
    const { data, error } = await supabase
      .from('decide_room_members')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[GroupDecide] Get members error:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Leave a room
   */
  leaveRoom: async (roomId: string, userId: string): Promise<void> => {
    await supabase
      .from('decide_room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);
  },

  // ==================
  // PREFERENCE VOTING
  // ==================

  /**
   * Submit preferences for a user
   */
  submitPreferences: async (
    roomId: string,
    userId: string,
    preferences: GroupPreferences
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('decide_preference_votes')
        .upsert({
          room_id: roomId,
          user_id: userId,
          preferences,
        });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to submit preferences' };
    }
  },

  /**
   * Get all preference votes for a room
   */
  getPreferenceVotes: async (roomId: string): Promise<PreferenceVote[]> => {
    const { data, error } = await supabase
      .from('decide_preference_votes')
      .select('*')
      .eq('room_id', roomId);

    if (error) {
      console.error('[GroupDecide] Get preference votes error:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Finalize group preferences (called by host)
   */
  finalizePreferences: async (roomId: string): Promise<{ preferences: GroupPreferences; error?: string }> => {
    const votes = await groupDecideService.getPreferenceVotes(roomId);

    if (votes.length === 0) {
      return { preferences: null as any, error: 'No votes submitted' };
    }

    const preferences = aggregatePreferences(votes);

    const { error } = await supabase
      .from('decide_rooms')
      .update({ preferences, status: 'building' })
      .eq('id', roomId);

    if (error) {
      return { preferences: null as any, error: error.message };
    }

    return { preferences };
  },

  // ==================
  // TOURNAMENT
  // ==================

  /**
   * Set the movie pool and start tournament
   */
  startTournament: async (
    roomId: string,
    pool: PoolCandidate[],
    options?: { couplesPickerId?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const updateData: any = {
      pool,
      status: 'tournament',
      current_round: 1,
      current_match: 0,
      round_winners: [],
      round_losers: [],
    };

    if (options?.couplesPickerId) {
      updateData.couples_picker_id = options.couplesPickerId;
    }

    const { error } = await supabase
      .from('decide_rooms')
      .update(updateData)
      .eq('id', roomId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  },

  /**
   * Submit a vote for current match
   */
  submitMatchVote: async (
    roomId: string,
    round: number,
    matchIndex: number,
    userId: string,
    choice: 'A' | 'B'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('decide_match_votes')
        .upsert({
          room_id: roomId,
          round,
          match_index: matchIndex,
          user_id: userId,
          choice,
          voted_at: new Date().toISOString(),
        });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to submit vote' };
    }
  },

  /**
   * Get votes for a specific match
   */
  getMatchVotes: async (roomId: string, round: number, matchIndex: number): Promise<MatchVote[]> => {
    const { data, error } = await supabase
      .from('decide_match_votes')
      .select('*')
      .eq('room_id', roomId)
      .eq('round', round)
      .eq('match_index', matchIndex);

    if (error) {
      console.error('[GroupDecide] Get match votes error:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Calculate match result from votes
   */
  calculateMatchResult: (
    movieA: PoolCandidate,
    movieB: PoolCandidate,
    votes: MatchVote[]
  ): MatchResult => {
    const votesA = votes.filter(v => v.choice === 'A').length;
    const votesB = votes.filter(v => v.choice === 'B').length;
    const isTie = votesA === votesB;

    let winner: PoolCandidate;
    let loser: PoolCandidate;

    if (votesA > votesB) {
      winner = movieA;
      loser = movieB;
    } else if (votesB > votesA) {
      winner = movieB;
      loser = movieA;
    } else {
      // Tie — use aaybee ranking (score) as tiebreaker, then random
      if ((movieA.score || 0) > (movieB.score || 0)) {
        winner = movieA;
        loser = movieB;
      } else if ((movieB.score || 0) > (movieA.score || 0)) {
        winner = movieB;
        loser = movieA;
      } else {
        // True coin flip
        if (Math.random() > 0.5) {
          winner = movieA;
          loser = movieB;
        } else {
          winner = movieB;
          loser = movieA;
        }
      }
    }

    return {
      movieA,
      movieB,
      votesA,
      votesB,
      winner,
      loser,
      margin: Math.abs(votesA - votesB),
      isTie,
    };
  },

  /**
   * Calculate couples match result (sequential pick/agree mechanic)
   */
  calculateCouplesResult: (
    movieA: PoolCandidate,
    movieB: PoolCandidate,
    pickerVote: MatchVote,
    responderVote: MatchVote,
    pickerId: string
  ): CouplesResult => {
    const agreed = pickerVote.choice === responderVote.choice;
    const winnerChoice = agreed ? pickerVote.choice : responderVote.choice;
    const winner = winnerChoice === 'A' ? movieA : movieB;
    const loser = winnerChoice === 'A' ? movieB : movieA;
    // If agreed, picker stays. If disagreed, responder becomes picker.
    const nextPickerId = agreed ? pickerId : responderVote.user_id;
    return { winner, loser, agreed, nextPickerId };
  },

  /**
   * Advance to next match or round
   */
  advanceMatch: async (
    roomId: string,
    winner: PoolCandidate,
    loser: PoolCandidate,
    margin: number,
    options?: { couplesPickerId?: string }
  ): Promise<{ nextState: 'match' | 'recap' | 'result'; error?: string }> => {
    try {
      // Get current room state
      const { data: room, error: roomError } = await supabase
        .from('decide_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return { nextState: 'match', error: 'Room not found' };
      }

      const isCouples = !!room.couples_picker_id;
      const matchesPerRound = isCouples ? COUPLES_MATCHES_PER_ROUND : MATCHES_PER_ROUND;
      const totalRounds = matchesPerRound.length;

      const currentRound = room.current_round;
      const currentMatch = room.current_match;
      const matchesInRound = matchesPerRound[currentRound - 1];

      // Add winner and loser to tracking
      const roundWinners = [...(room.round_winners || [])];
      const roundLosers = [...(room.round_losers || [])];

      // Ensure arrays exist for current round
      if (!roundWinners[currentRound - 1]) roundWinners[currentRound - 1] = [];
      if (!roundLosers[currentRound - 1]) roundLosers[currentRound - 1] = [];

      roundWinners[currentRound - 1].push(winner);
      roundLosers[currentRound - 1].push({ ...loser, _voteMargin: margin } as any);

      const isLastMatchOfRound = currentMatch + 1 >= matchesInRound;
      const isFinalRound = currentRound === totalRounds;

      // Base update data with optional couples picker
      const baseUpdate: any = {
        round_winners: roundWinners,
        round_losers: roundLosers,
      };
      if (options?.couplesPickerId !== undefined) {
        baseUpdate.couples_picker_id = options.couplesPickerId;
      }

      if (isFinalRound) {
        // Tournament complete
        await supabase
          .from('decide_rooms')
          .update({
            ...baseUpdate,
            champion: winner,
            status: 'result',
          })
          .eq('id', roomId);

        return { nextState: 'result' };
      }

      if (isLastMatchOfRound) {
        if (isCouples) {
          // Couples: skip recap, go straight to next round
          await supabase
            .from('decide_rooms')
            .update({
              ...baseUpdate,
              current_round: currentRound + 1,
              current_match: 0,
              status: 'tournament',
            })
            .eq('id', roomId);

          return { nextState: 'match' };
        } else {
          // Group: go to recap
          await supabase
            .from('decide_rooms')
            .update({
              ...baseUpdate,
              status: 'recap',
            })
            .eq('id', roomId);

          return { nextState: 'recap' };
        }
      }

      // Next match in same round
      await supabase
        .from('decide_rooms')
        .update({
          ...baseUpdate,
          current_match: currentMatch + 1,
        })
        .eq('id', roomId);

      return { nextState: 'match' };
    } catch (err) {
      console.error('[GroupDecide] Advance match error:', err);
      return { nextState: 'match', error: 'Failed to advance' };
    }
  },

  /**
   * Continue to next round after recap
   */
  continueToNextRound: async (roomId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: room, error: roomError } = await supabase
        .from('decide_rooms')
        .select('current_round')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return { success: false, error: 'Room not found' };
      }

      const { error } = await supabase
        .from('decide_rooms')
        .update({
          current_round: room.current_round + 1,
          current_match: 0,
          status: 'tournament',
        })
        .eq('id', roomId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to continue' };
    }
  },

  // ==================
  // VETO
  // ==================

  /**
   * Veto a movie during recap
   */
  vetoMovie: async (
    roomId: string,
    odId: string,
    userName: string,
    movieId: string
  ): Promise<{ replacement: PoolCandidate | null; error?: string }> => {
    try {
      // Get room state
      const { data: room, error: roomError } = await supabase
        .from('decide_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return { replacement: null, error: 'Room not found' };
      }

      // Check user has vetoes remaining
      const { data: member, error: memberError } = await supabase
        .from('decide_room_members')
        .select('vetoes_remaining')
        .eq('room_id', roomId)
        .eq('user_id', odId)
        .single();

      if (memberError || !member || member.vetoes_remaining <= 0) {
        return { replacement: null, error: 'No vetoes remaining' };
      }

      const currentRound = room.current_round;
      const roundWinners = [...(room.round_winners || [])];
      const roundLosers = [...(room.round_losers || [])];

      // Find the vetoed movie in current round winners
      const currentWinners = roundWinners[currentRound - 1] || [];
      const vetoIndex = currentWinners.findIndex((m: PoolCandidate) => m.id === movieId);

      if (vetoIndex === -1) {
        return { replacement: null, error: 'Movie not found in advancing movies' };
      }

      // Find replacement: loser with closest vote margin
      const currentLosers = roundLosers[currentRound - 1] || [];
      if (currentLosers.length === 0) {
        return { replacement: null, error: 'No replacement available' };
      }

      // Sort losers by vote margin (ascending - closest first)
      const sortedLosers = [...currentLosers].sort(
        (a: any, b: any) => (a._voteMargin || 0) - (b._voteMargin || 0)
      );

      const replacement = sortedLosers[0];

      // Replace in winners
      currentWinners[vetoIndex] = replacement;
      roundWinners[currentRound - 1] = currentWinners;

      // Remove replacement from losers
      roundLosers[currentRound - 1] = currentLosers.filter(
        (m: PoolCandidate) => m.id !== replacement.id
      );

      // Update room and decrement user's vetoes
      await supabase
        .from('decide_rooms')
        .update({
          round_winners: roundWinners,
          round_losers: roundLosers,
        })
        .eq('id', roomId);

      await supabase
        .from('decide_room_members')
        .update({ vetoes_remaining: member.vetoes_remaining - 1 })
        .eq('room_id', roomId)
        .eq('user_id', odId);

      // Log veto action for display
      await supabase.from('decide_veto_actions').insert({
        room_id: roomId,
        user_id: odId,
        user_name: userName,
        vetoed_movie_id: movieId,
        replacement_movie_id: replacement.id,
        round: currentRound,
      });

      return { replacement };
    } catch (err) {
      console.error('[GroupDecide] Veto error:', err);
      return { replacement: null, error: 'Failed to veto' };
    }
  },

  // ==================
  // REAL-TIME SUBSCRIPTIONS
  // ==================

  /**
   * Subscribe to room changes
   */
  subscribeToRoom: (
    roomId: string,
    onUpdate: (room: DecideRoom) => void
  ) => {
    // Helper to fetch full room data
    const fetchRoom = async () => {
      const { data, error } = await supabase
        .from('decide_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!error && data) {
        onUpdate(data as DecideRoom);
      }
    };

    // Initial fetch
    fetchRoom();

    return supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'decide_rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          // Realtime only sends changed fields, so fetch full row
          fetchRoom();
        }
      )
      .subscribe();
  },

  /**
   * Subscribe to room members
   */
  subscribeToMembers: (
    roomId: string,
    onUpdate: (members: DecideRoomMember[]) => void
  ) => {
    // Initial fetch then subscribe
    groupDecideService.getRoomMembers(roomId).then(onUpdate);

    return supabase
      .channel(`members:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'decide_room_members',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // Refetch all members on any change
          groupDecideService.getRoomMembers(roomId).then(onUpdate);
        }
      )
      .subscribe();
  },

  /**
   * Subscribe to match votes
   */
  subscribeToMatchVotes: (
    roomId: string,
    round: number,
    matchIndex: number,
    onUpdate: (votes: MatchVote[]) => void
  ) => {
    return supabase
      .channel(`votes:${roomId}:${round}:${matchIndex}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'decide_match_votes',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // Refetch votes for current match
          groupDecideService.getMatchVotes(roomId, round, matchIndex).then(onUpdate);
        }
      )
      .subscribe();
  },

  /**
   * Subscribe to veto actions
   */
  subscribeToVetos: (
    roomId: string,
    onVeto: (action: VetoAction) => void
  ) => {
    return supabase
      .channel(`vetos:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'decide_veto_actions',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            onVeto(payload.new as VetoAction);
          }
        }
      )
      .subscribe();
  },

  /**
   * Unsubscribe from a channel
   */
  unsubscribe: (channel: any) => {
    if (channel) {
      supabase.removeChannel(channel);
    }
  },

  // ==================
  // UTILITIES
  // ==================

  /**
   * Get current match pair based on room state
   */
  getCurrentMatchPair: (room: DecideRoom): { movieA: PoolCandidate; movieB: PoolCandidate } | null => {
    const { current_round, current_match, pool, round_winners } = room;

    // Safety checks
    if (!pool || !Array.isArray(pool)) {
      console.warn('[GroupDecide] Pool is invalid:', pool);
      return null;
    }

    if (current_round === 1) {
      // R1: pairs from original pool
      const idx = current_match * 2;
      if (idx + 1 >= pool.length) {
        console.warn('[GroupDecide] Pool index out of bounds:', { idx, poolLength: pool.length });
        return null;
      }
      return { movieA: pool[idx], movieB: pool[idx + 1] };
    }

    // Later rounds: pairs from previous round winners
    const previousWinners = (round_winners && round_winners[current_round - 2]) || [];
    const idx = current_match * 2;
    if (idx + 1 >= previousWinners.length) {
      console.warn('[GroupDecide] Winners index out of bounds:', { idx, winnersLength: previousWinners.length });
      return null;
    }

    return { movieA: previousWinners[idx], movieB: previousWinners[idx + 1] };
  },

  /**
   * Get movies advancing after current round (for recap screen)
   */
  getAdvancingMovies: (room: DecideRoom): PoolCandidate[] => {
    const { current_round, round_winners } = room;
    return round_winners[current_round - 1] || [];
  },

  /**
   * Get round name
   */
  getRoundName: (round: number): string => {
    switch (round) {
      case 1: return 'Round 1';
      case 2: return 'Quarter Finals';
      case 3: return 'Semi Finals';
      case 4: return 'Final';
      default: return `Round ${round}`;
    }
  },

  /**
   * Get next round name (for recap)
   */
  getNextRoundName: (currentRound: number): string => {
    return groupDecideService.getRoundName(currentRound + 1);
  },

  /**
   * Get round name for couples bracket (8 movies: R1, SF, Final)
   */
  getCouplesRoundName: (round: number): string => {
    switch (round) {
      case 1: return 'Round 1';
      case 2: return 'Semi Finals';
      case 3: return 'Final';
      default: return `Round ${round}`;
    }
  },

  /**
   * Get matches per round based on mode
   */
  getMatchesPerRound: (isCouples: boolean): number[] => {
    return isCouples ? COUPLES_MATCHES_PER_ROUND : MATCHES_PER_ROUND;
  },
};

export default groupDecideService;
