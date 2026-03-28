import { supabase } from './supabase';
import type { DBGlobalMovieStats } from './database';

// ============================================
// TYPES
// ============================================

export interface GlobalRanking {
  movie_id: string;
  global_beta: number;
  global_rank: number;
  total_global_comparisons: number;
  unique_users_count: number;
  movie?: {
    title: string;
    year: number;
    poster_url: string | null;
  };
}

export interface UserVsGlobalComparison {
  userBeta: number;
  globalBeta: number;
  deviation: number;
  percentile: number;
  message: string;
  isHigherThanAverage: boolean;
}

export interface MovieGlobalStats extends DBGlobalMovieStats {
  global_rank?: number;
}

// ============================================
// GLOBAL RANKINGS SERVICE
// ============================================

export const globalRankingsService = {
  /**
   * Calculate global stats for a single movie
   * Aggregates all user data and calculates weighted beta
   */
  calculateMovieGlobalStats: async (movieId: string): Promise<boolean> => {
    try {
      // 1. Get all user data for this movie
      const { data: userMovies, error } = await supabase
        .from('user_movies')
        .select('beta, total_wins, total_losses, total_comparisons, user_id')
        .eq('movie_id', movieId);

      if (error) {
        console.error('[GlobalRankings] Failed to fetch user movies:', error);
        return false;
      }

      if (!userMovies || userMovies.length === 0) {
        console.log(`[GlobalRankings] No user data for movie ${movieId}`);
        return true;
      }

      // 2. Calculate weighted global beta
      // Users with more comparisons contribute more weight
      let weightedSum = 0;
      let totalWeight = 0;
      let totalWins = 0;
      let totalLosses = 0;
      const betas: number[] = [];

      for (const um of userMovies) {
        const weight = Math.sqrt((um.total_comparisons || 0) + 1);
        weightedSum += (um.beta || 0) * weight;
        totalWeight += weight;
        totalWins += um.total_wins || 0;
        totalLosses += um.total_losses || 0;
        betas.push(um.beta || 0);
      }

      const globalBeta = totalWeight > 0 ? weightedSum / totalWeight : 0;

      // 3. Calculate percentiles
      betas.sort((a, b) => a - b);
      const n = betas.length;
      const p25 = betas[Math.floor(n * 0.25)] ?? 0;
      const median = betas[Math.floor(n * 0.5)] ?? 0;
      const p75 = betas[Math.floor(n * 0.75)] ?? 0;
      const average = n > 0 ? betas.reduce((a, b) => a + b, 0) / n : 0;

      // 4. Save to database
      const { error: upsertError } = await supabase
        .from('global_movie_stats')
        .upsert({
          movie_id: movieId,
          global_beta: globalBeta,
          total_global_wins: totalWins,
          total_global_losses: totalLosses,
          total_global_comparisons: totalWins + totalLosses,
          unique_users_count: userMovies.length,
          average_user_beta: average,
          median_user_beta: median,
          percentile_25: p25,
          percentile_75: p75,
          last_calculated_at: new Date().toISOString(),
        }, { onConflict: 'movie_id' });

      if (upsertError) {
        console.error('[GlobalRankings] Failed to upsert stats:', upsertError);
        return false;
      }

      console.log(`[GlobalRankings] Updated stats for ${movieId}: beta=${globalBeta.toFixed(2)}, users=${userMovies.length}`);
      return true;
    } catch (error) {
      console.error('[GlobalRankings] Error calculating movie stats:', error);
      return false;
    }
  },

  /**
   * Recalculate global stats for all movies that have been compared
   * Should be run periodically (e.g., every hour or after X comparisons)
   */
  recalculateAllGlobalStats: async (): Promise<{ success: boolean; moviesUpdated: number }> => {
    try {
      console.log('[GlobalRankings] Starting full recalculation...');

      // Get all unique movie IDs that have been compared
      const { data: movies, error } = await supabase
        .from('user_movies')
        .select('movie_id')
        .gt('total_comparisons', 0);

      if (error) {
        console.error('[GlobalRankings] Failed to fetch movie IDs:', error);
        return { success: false, moviesUpdated: 0 };
      }

      if (!movies || movies.length === 0) {
        console.log('[GlobalRankings] No movies to recalculate');
        return { success: true, moviesUpdated: 0 };
      }

      // Get unique movie IDs
      const uniqueMovieIds = [...new Set(movies.map(m => m.movie_id))];
      let updatedCount = 0;

      // Calculate stats for each movie
      for (const movieId of uniqueMovieIds) {
        const success = await globalRankingsService.calculateMovieGlobalStats(movieId);
        if (success) updatedCount++;
      }

      console.log(`[GlobalRankings] Recalculation complete: ${updatedCount}/${uniqueMovieIds.length} movies updated`);
      return { success: true, moviesUpdated: updatedCount };
    } catch (error) {
      console.error('[GlobalRankings] Error in full recalculation:', error);
      return { success: false, moviesUpdated: 0 };
    }
  },

  /**
   * Get global rankings with movie details
   */
  getGlobalRankings: async (limit = 50): Promise<GlobalRanking[]> => {
    try {
      console.log('[GlobalRankings] Fetching rankings...');

      // Fetch global stats (require at least 2 users to filter out single-user inflation)
      // Over-fetch to allow for tier filtering below
      const { data: statsData, error: statsError } = await supabase
        .from('global_movie_stats')
        .select('*')
        .gte('unique_users_count', 2)
        .order('global_beta', { ascending: false })
        .limit(limit * 3);

      if (statsError) {
        console.error('[GlobalRankings] Failed to fetch stats:', statsError);
        return [];
      }

      if (!statsData || statsData.length === 0) {
        console.log('[GlobalRankings] No stats data found');
        return [];
      }

      // Fetch movies and filter to tier 1-4 (tier 5 = search-only, not for rankings)
      const allMovieIds = statsData.map(d => d.movie_id);
      const { data: moviesData, error: moviesError } = await supabase
        .from('movies')
        .select('id, title, year, poster_url, tier')
        .in('id', allMovieIds)
        .lte('tier', 4);

      if (moviesError) {
        console.error('[GlobalRankings] Failed to fetch movies:', moviesError);
      }

      const moviesMap = new Map(moviesData?.map(m => [m.id, m]) || []);

      // Keep only stats rows that have a matching tier 1-4 movie
      const filteredStats = statsData.filter(d => moviesMap.has(d.movie_id)).slice(0, limit);

      return filteredStats.map((item, index) => ({
        movie_id: item.movie_id,
        global_beta: item.global_beta,
        global_rank: index + 1,
        total_global_comparisons: item.total_global_comparisons,
        unique_users_count: item.unique_users_count,
        movie: moviesMap.get(item.movie_id) as GlobalRanking['movie'],
      }));
    } catch (error) {
      console.error('[GlobalRankings] Error fetching rankings:', error);
      return [];
    }
  },

  /**
   * Get global stats for a single movie
   */
  getMovieGlobalStats: async (movieId: string): Promise<MovieGlobalStats | null> => {
    try {
      // Get the movie's stats first (need global_beta for rank query)
      const { data: stats, error } = await supabase
        .from('global_movie_stats')
        .select('*')
        .eq('movie_id', movieId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('[GlobalRankings] Failed to fetch movie stats:', error);
        }
        return null;
      }

      // Get the movie's global rank (count of movies with higher beta)
      const { count } = await supabase
        .from('global_movie_stats')
        .select('*', { count: 'exact', head: true })
        .gt('global_beta', stats.global_beta);

      return {
        ...stats,
        global_rank: (count || 0) + 1,
      };
    } catch (error) {
      console.error('[GlobalRankings] Error fetching movie stats:', error);
      return null;
    }
  },

  /**
   * Compare a user's ranking to the global ranking for a specific movie
   */
  getUserVsGlobalComparison: async (
    userId: string,
    movieId: string
  ): Promise<UserVsGlobalComparison | null> => {
    try {
      // Get user's beta for this movie
      const { data: userMovie, error: userError } = await supabase
        .from('user_movies')
        .select('beta')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .single();

      if (userError || !userMovie) {
        return null;
      }

      // Get global stats for this movie
      const { data: globalStats, error: globalError } = await supabase
        .from('global_movie_stats')
        .select('*')
        .eq('movie_id', movieId)
        .single();

      if (globalError || !globalStats) {
        return null;
      }

      const userBeta = userMovie.beta || 0;
      const globalBeta = globalStats.global_beta || 0;
      const deviation = userBeta - globalBeta;

      // Calculate percentile based on deviation and distribution
      let percentile: number;
      const p25 = globalStats.percentile_25 || 0;
      const median = globalStats.median_user_beta || 0;
      const p75 = globalStats.percentile_75 || 0;

      if (deviation >= 0) {
        // User ranks higher than global average
        const upperRange = p75 - median;
        if (upperRange > 0) {
          percentile = 50 + (deviation / upperRange) * 25;
        } else {
          percentile = deviation > 0 ? 75 : 50;
        }
      } else {
        // User ranks lower than global average
        const lowerRange = median - p25;
        if (lowerRange > 0) {
          percentile = 50 - (Math.abs(deviation) / lowerRange) * 25;
        } else {
          percentile = deviation < 0 ? 25 : 50;
        }
      }

      // Clamp to 0-100
      percentile = Math.max(0, Math.min(100, percentile));
      const roundedPercentile = Math.round(percentile);

      const isHigherThanAverage = deviation > 0;
      const message = isHigherThanAverage
        ? `You ranked this higher than ${roundedPercentile}% of users`
        : `You ranked this lower than ${100 - roundedPercentile}% of users`;

      return {
        userBeta,
        globalBeta,
        deviation,
        percentile: roundedPercentile,
        message,
        isHigherThanAverage,
      };
    } catch (error) {
      console.error('[GlobalRankings] Error comparing user vs global:', error);
      return null;
    }
  },

  /**
   * Get comparison data for all of a user's ranked movies
   */
  getUserVsGlobalForAllMovies: async (
    userId: string
  ): Promise<Map<string, UserVsGlobalComparison>> => {
    const results = new Map<string, UserVsGlobalComparison>();

    try {
      // Get all user's movies
      const { data: userMovies, error: userError } = await supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userId)
        .gt('total_comparisons', 0);

      if (userError || !userMovies) {
        return results;
      }

      // Get all global stats
      const { data: allGlobalStats, error: globalError } = await supabase
        .from('global_movie_stats')
        .select('*');

      if (globalError || !allGlobalStats) {
        return results;
      }

      const globalStatsMap = new Map(
        allGlobalStats.map(s => [s.movie_id, s])
      );

      // Calculate comparison for each movie
      for (const userMovie of userMovies) {
        const globalStats = globalStatsMap.get(userMovie.movie_id);
        if (!globalStats) continue;

        const userBeta = userMovie.beta || 0;
        const globalBeta = globalStats.global_beta || 0;
        const deviation = userBeta - globalBeta;

        const p25 = globalStats.percentile_25 || 0;
        const median = globalStats.median_user_beta || 0;
        const p75 = globalStats.percentile_75 || 0;

        let percentile: number;
        if (deviation >= 0) {
          const upperRange = p75 - median;
          percentile = upperRange > 0
            ? 50 + (deviation / upperRange) * 25
            : (deviation > 0 ? 75 : 50);
        } else {
          const lowerRange = median - p25;
          percentile = lowerRange > 0
            ? 50 - (Math.abs(deviation) / lowerRange) * 25
            : (deviation < 0 ? 25 : 50);
        }

        percentile = Math.max(0, Math.min(100, percentile));
        const roundedPercentile = Math.round(percentile);
        const isHigherThanAverage = deviation > 0;

        results.set(userMovie.movie_id, {
          userBeta,
          globalBeta,
          deviation,
          percentile: roundedPercentile,
          message: isHigherThanAverage
            ? `You ranked this higher than ${roundedPercentile}% of users`
            : `You ranked this lower than ${100 - roundedPercentile}% of users`,
          isHigherThanAverage,
        });
      }

      return results;
    } catch (error) {
      console.error('[GlobalRankings] Error fetching all comparisons:', error);
      return results;
    }
  },

  /**
   * Trigger recalculation for movies affected by a new comparison
   * Call this after recording a comparison
   */
  onComparisonRecorded: async (movieAId: string, movieBId: string): Promise<void> => {
    // Recalculate stats for both movies involved in the comparison
    await Promise.all([
      globalRankingsService.calculateMovieGlobalStats(movieAId),
      globalRankingsService.calculateMovieGlobalStats(movieBId),
    ]);
  },
};

export default globalRankingsService;
