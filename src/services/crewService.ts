import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export interface Crew {
  id: string;
  code: string;
  name: string;
  creator_id: string;
  created_at: string;
}

export interface CrewMember {
  id: string;
  crew_id: string;
  user_id: string;
  joined_at: string;
  display_name?: string;
  played_today?: boolean;
}

export interface CrewDailyResult {
  consensusRanking: string[]; // movie IDs in consensus order
  memberResults: {
    userId: string;
    displayName: string;
    ranking: string[];
    alignmentPercent: number;
    hottestTake?: { movieId: string; userRank: number; consensusRank: number };
  }[];
  hottestTaker?: { displayName: string; movieId: string; userRank: number; consensusRank: number };
  mostMainstream?: { displayName: string; alignmentPercent: number };
}

// ============================================
// CONSTANTS
// ============================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_MEMBERS = 20;
const MAX_CREWS_PER_USER = 5;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ============================================
// SERVICE
// ============================================

export const crewService = {
  createCrew: async (userId: string, name: string): Promise<{ crew: Crew | null; error?: string }> => {
    try {
      // Check crew limit
      const { data: existing } = await supabase
        .from('crew_members')
        .select('crew_id')
        .eq('user_id', userId);
      if (existing && existing.length >= MAX_CREWS_PER_USER) {
        return { crew: null, error: `You can be in at most ${MAX_CREWS_PER_USER} crews` };
      }

      let code = generateCode();
      for (let i = 0; i < 10; i++) {
        const { data: dup } = await supabase.from('crews').select('id').eq('code', code).maybeSingle();
        if (!dup) break;
        code = generateCode();
      }

      // Verify code is unique
      const { data: finalCheck } = await supabase.from('crews').select('id').eq('code', code).maybeSingle();
      if (finalCheck) {
        return { crew: null, error: 'Could not generate unique code. Please try again.' };
      }

      const { data: crew, error } = await supabase
        .from('crews')
        .insert({ code, name: name.trim(), creator_id: userId })
        .select()
        .single();

      if (error || !crew) return { crew: null, error: error?.message || 'Failed to create crew' };

      // Auto-join creator
      await supabase.from('crew_members').insert({ crew_id: crew.id, user_id: userId });

      return { crew };
    } catch (err) {
      return { crew: null, error: 'Failed to create crew' };
    }
  },

  joinCrew: async (userId: string, code: string): Promise<{ crew: Crew | null; error?: string }> => {
    try {
      const { data: crew } = await supabase
        .from('crews')
        .select('*')
        .eq('code', code.toUpperCase())
        .maybeSingle();

      if (!crew) return { crew: null, error: 'Crew not found' };

      // Check member limit
      const { data: members } = await supabase
        .from('crew_members')
        .select('id')
        .eq('crew_id', crew.id);
      if (members && members.length >= MAX_MEMBERS) {
        return { crew: null, error: 'Crew is full (max 20 members)' };
      }

      // Check user crew limit
      const { data: userCrews } = await supabase
        .from('crew_members')
        .select('crew_id')
        .eq('user_id', userId);
      if (userCrews && userCrews.length >= MAX_CREWS_PER_USER) {
        return { crew: null, error: `You can be in at most ${MAX_CREWS_PER_USER} crews` };
      }

      const { error } = await supabase
        .from('crew_members')
        .upsert({ crew_id: crew.id, user_id: userId }, { onConflict: 'crew_id,user_id' });

      if (error) return { crew: null, error: error.message };
      return { crew };
    } catch (err) {
      return { crew: null, error: 'Failed to join crew' };
    }
  },

  leaveCrew: async (userId: string, crewId: string): Promise<{ error?: string }> => {
    try {
      await supabase.from('crew_members').delete().eq('crew_id', crewId).eq('user_id', userId);
      // Check if crew is now empty — delete it
      const { data: remaining } = await supabase.from('crew_members').select('id').eq('crew_id', crewId);
      if (!remaining || remaining.length === 0) {
        await supabase.from('crews').delete().eq('id', crewId);
      }
      return {};
    } catch (err) {
      return { error: 'Failed to leave crew' };
    }
  },

  getMyCrews: async (userId: string): Promise<Crew[]> => {
    try {
      const { data: memberships } = await supabase
        .from('crew_members')
        .select('crew_id')
        .eq('user_id', userId);
      if (!memberships || memberships.length === 0) return [];

      const crewIds = memberships.map(m => m.crew_id);
      const { data: crews } = await supabase
        .from('crews')
        .select('*')
        .in('id', crewIds);
      return crews || [];
    } catch {
      return [];
    }
  },

  getCrewMembers: async (crewId: string, dailyNumber?: number): Promise<CrewMember[]> => {
    try {
      const { data: members } = await supabase
        .from('crew_members')
        .select('*')
        .eq('crew_id', crewId);
      if (!members) return [];

      // Get display names
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', userIds);

      // Check who played today
      let playedSet = new Set<string>();
      if (dailyNumber) {
        const { data: picks } = await supabase
          .from('crew_daily_picks')
          .select('user_id')
          .eq('crew_id', crewId)
          .eq('daily_number', dailyNumber);
        if (picks) playedSet = new Set(picks.map(p => p.user_id));
      }

      return members.map(m => ({
        ...m,
        display_name: profiles?.find(p => p.id === m.user_id)?.display_name || 'Anonymous',
        played_today: playedSet.has(m.user_id),
      }));
    } catch {
      return [];
    }
  },

  submitDailyPick: async (crewId: string, userId: string, dailyNumber: number, ranking: string[]): Promise<{ error?: string }> => {
    try {
      const { error } = await supabase
        .from('crew_daily_picks')
        .upsert(
          { crew_id: crewId, user_id: userId, daily_number: dailyNumber, ranking },
          { onConflict: 'crew_id,user_id,daily_number' }
        );
      if (error) return { error: error.message };
      return {};
    } catch {
      return { error: 'Failed to submit daily pick' };
    }
  },

  getCrewDailyResults: async (crewId: string, dailyNumber: number): Promise<CrewDailyResult | null> => {
    try {
      const { data: picks } = await supabase
        .from('crew_daily_picks')
        .select('user_id, ranking')
        .eq('crew_id', crewId)
        .eq('daily_number', dailyNumber);

      if (!picks || picks.length < 2) return null;

      // Get display names
      const userIds = picks.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', userIds);
      const nameMap = new Map(profiles?.map(p => [p.id, p.display_name]) || []);

      // Compute consensus ranking (average position per movie)
      const allMovieIds = new Set<string>();
      for (const p of picks) {
        for (const id of p.ranking) allMovieIds.add(id);
      }

      const positionSums = new Map<string, number>();
      const positionCounts = new Map<string, number>();
      for (const p of picks) {
        p.ranking.forEach((id: string, idx: number) => {
          positionSums.set(id, (positionSums.get(id) || 0) + idx);
          positionCounts.set(id, (positionCounts.get(id) || 0) + 1);
        });
      }

      const consensusRanking = Array.from(allMovieIds)
        .map(id => ({
          id,
          avgPos: (positionSums.get(id) || 0) / (positionCounts.get(id) || 1),
        }))
        .sort((a, b) => a.avgPos - b.avgPos)
        .map(m => m.id);

      // Compute per-member results
      const consensusPos = new Map(consensusRanking.map((id, i) => [id, i]));

      const memberResults = picks.map(p => {
        const userPos = new Map<string, number>(p.ranking.map((id: string, i: number) => [id, i]));

        // Kendall tau distance from consensus
        let concordant = 0;
        let discordant = 0;
        const ids = p.ranking as string[];
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const ci = consensusPos.get(ids[i]);
            const cj = consensusPos.get(ids[j]);
            if (ci === undefined || cj === undefined) continue;
            if (ci < cj) concordant++;
            else discordant++;
          }
        }
        const totalPairs = (ids.length * (ids.length - 1)) / 2;
        const tau = totalPairs > 0 ? discordant / totalPairs : 0;
        const alignmentPercent = Math.round((1 - tau) * 100);

        // Hottest take: largest deviation from consensus
        let hottestTake: { movieId: string; userRank: number; consensusRank: number } | undefined;
        let maxDeviation = 0;
        for (const id of ids) {
          const uRank = userPos.get(id)!;
          const cRank = consensusPos.get(id);
          if (cRank === undefined) continue;
          const dev = Math.abs(uRank - cRank);
          if (dev > maxDeviation) {
            maxDeviation = dev;
            hottestTake = { movieId: id, userRank: uRank + 1, consensusRank: cRank + 1 };
          }
        }

        return {
          userId: p.user_id,
          displayName: nameMap.get(p.user_id) || 'Anonymous',
          ranking: p.ranking as string[],
          alignmentPercent,
          hottestTake,
        };
      });

      // Overall hottest taker and most mainstream
      const sorted = [...memberResults].sort((a, b) => a.alignmentPercent - b.alignmentPercent);
      const hottestTaker = sorted[0]?.hottestTake
        ? { displayName: sorted[0].displayName, ...sorted[0].hottestTake }
        : undefined;
      const mostMainstream = sorted.length > 0
        ? { displayName: sorted[sorted.length - 1].displayName, alignmentPercent: sorted[sorted.length - 1].alignmentPercent }
        : undefined;

      return { consensusRanking, memberResults, hottestTaker, mostMainstream };
    } catch {
      return null;
    }
  },

  getCrewDailyNumbers: async (crewId: string): Promise<number[]> => {
    try {
      const { data } = await supabase
        .from('crew_daily_picks')
        .select('daily_number')
        .eq('crew_id', crewId);
      if (!data) return [];
      const numbers = [...new Set(data.map((d: any) => d.daily_number))].sort((a: number, b: number) => b - a);
      return numbers;
    } catch {
      return [];
    }
  },
};

export default crewService;
