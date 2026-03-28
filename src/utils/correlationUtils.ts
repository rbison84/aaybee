import { supabase } from '../services/supabase';

// ============================================
// TYPES
// ============================================

export interface TopMovieData {
  movie_id: string;
  beta: number;
  rank: number; // 1-indexed
}

export interface SmartCorrelationResult {
  rSquared: number;
  correlation: number;
  overlapCount: number;
  overlappingMovies: Array<{
    movieId: string;
    betaA: number;
    betaB: number;
    rankA: number;
    rankB: number;
    weightA: number;
    weightB: number;
  }>;
  expandedToTop25: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const TOP_15_LIMIT = 15;
const TOP_25_LIMIT = 25;
const MIN_OVERLAP_REQUIRED = 8;

// ============================================
// WEIGHT CALCULATION
// ============================================

/**
 * Calculate weight for a movie based on its rank
 * #1 = 1.0, #5 = 0.8, #10 = 0.6, #15 = 0.4
 * Linear interpolation between these points
 */
export function calculateRankWeight(rank: number): number {
  if (rank <= 1) return 1.0;
  if (rank <= 5) {
    // Linear from 1.0 at rank 1 to 0.8 at rank 5
    return 1.0 - (rank - 1) * (0.2 / 4);
  }
  if (rank <= 10) {
    // Linear from 0.8 at rank 5 to 0.6 at rank 10
    return 0.8 - (rank - 5) * (0.2 / 5);
  }
  if (rank <= 15) {
    // Linear from 0.6 at rank 10 to 0.4 at rank 15
    return 0.6 - (rank - 10) * (0.2 / 5);
  }
  // For expanded search (ranks 16-25), continue the decay
  if (rank <= 25) {
    return 0.4 - (rank - 15) * (0.02);
  }
  return 0.2; // Minimum weight
}

// ============================================
// WEIGHTED PEARSON CORRELATION
// ============================================

/**
 * Calculate weighted Pearson correlation coefficient
 * Each data point is weighted based on the average of both users' rank weights
 */
function calculateWeightedPearsonCorrelation(
  data: Array<{
    betaA: number;
    betaB: number;
    weightA: number;
    weightB: number;
  }>
): number | null {
  if (data.length === 0) return null;

  // Combined weight = average of both weights
  const weightedData = data.map(d => ({
    ...d,
    weight: (d.weightA + d.weightB) / 2,
  }));

  // Total weight
  const totalWeight = weightedData.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return null;

  // Weighted means
  const meanA = weightedData.reduce((sum, d) => sum + d.weight * d.betaA, 0) / totalWeight;
  const meanB = weightedData.reduce((sum, d) => sum + d.weight * d.betaB, 0) / totalWeight;

  // Weighted correlation components
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (const d of weightedData) {
    const diffA = d.betaA - meanA;
    const diffB = d.betaB - meanB;
    numerator += d.weight * diffA * diffB;
    denomA += d.weight * diffA * diffA;
    denomB += d.weight * diffB * diffB;
  }

  if (denomA === 0 || denomB === 0) {
    return null; // No variance
  }

  const r = numerator / Math.sqrt(denomA * denomB);
  return Math.max(-1, Math.min(1, r)); // Clamp to [-1, 1]
}

// ============================================
// MAIN SMART CORRELATION FUNCTION
// ============================================

/**
 * Calculate smart R² correlation between two users
 * Uses only top 15 (or top 25 if needed) movies with weighted correlation
 *
 * @param userAId - First user's ID
 * @param userBId - Second user's ID
 * @returns SmartCorrelationResult or null if insufficient overlap
 */
export async function calculateSmartCorrelation(
  userAId: string,
  userBId: string
): Promise<SmartCorrelationResult | null> {
  try {
    // Fetch top 25 movies for both users (we might need to expand)
    const [userAResult, userBResult] = await Promise.all([
      supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userAId)
        .eq('status', 'known')
        .order('beta', { ascending: false })
        .limit(TOP_25_LIMIT),
      supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userBId)
        .eq('status', 'known')
        .order('beta', { ascending: false })
        .limit(TOP_25_LIMIT),
    ]);

    if (userAResult.error || userBResult.error) {
      console.error('[SmartCorrelation] Failed to fetch user movies');
      return null;
    }

    const userAMovies = userAResult.data || [];
    const userBMovies = userBResult.data || [];

    if (userAMovies.length < 10 || userBMovies.length < 10) {
      // Not enough ranked movies for meaningful correlation
      return null;
    }

    // Add rank to each movie
    const userAWithRank: TopMovieData[] = userAMovies.map((m, i) => ({
      movie_id: m.movie_id,
      beta: m.beta,
      rank: i + 1,
    }));

    const userBWithRank: TopMovieData[] = userBMovies.map((m, i) => ({
      movie_id: m.movie_id,
      beta: m.beta,
      rank: i + 1,
    }));

    // Build lookup maps
    const userAMap = new Map(userAWithRank.map(m => [m.movie_id, m]));
    const userBMap = new Map(userBWithRank.map(m => [m.movie_id, m]));

    // Try with top 15 first
    const findOverlap = (limitA: number, limitB: number) => {
      const overlapping: SmartCorrelationResult['overlappingMovies'] = [];

      for (const movieA of userAWithRank.slice(0, limitA)) {
        const movieB = userBMap.get(movieA.movie_id);
        if (movieB && movieB.rank <= limitB) {
          overlapping.push({
            movieId: movieA.movie_id,
            betaA: movieA.beta,
            betaB: movieB.beta,
            rankA: movieA.rank,
            rankB: movieB.rank,
            weightA: calculateRankWeight(movieA.rank),
            weightB: calculateRankWeight(movieB.rank),
          });
        }
      }

      return overlapping;
    };

    // First try: Top 15
    let overlapping = findOverlap(TOP_15_LIMIT, TOP_15_LIMIT);
    let expandedToTop25 = false;

    // If not enough overlap, expand to top 25
    if (overlapping.length < MIN_OVERLAP_REQUIRED) {
      overlapping = findOverlap(TOP_25_LIMIT, TOP_25_LIMIT);
      expandedToTop25 = true;

      // Still not enough overlap
      if (overlapping.length < MIN_OVERLAP_REQUIRED) {
        return null;
      }
    }

    // Calculate weighted correlation
    const correlation = calculateWeightedPearsonCorrelation(overlapping);

    if (correlation === null || isNaN(correlation)) {
      return null;
    }

    const rSquared = correlation * correlation;

    return {
      rSquared,
      correlation,
      overlapCount: overlapping.length,
      overlappingMovies: overlapping,
      expandedToTop25,
    };
  } catch (error) {
    console.error('[SmartCorrelation] Error:', error);
    return null;
  }
}

/**
 * Synchronous version for local data (no Supabase call)
 * Used when we have the movie data already loaded
 */
export function calculateSmartCorrelationLocal(
  userAMovies: Array<{ movie_id: string; beta: number }>,
  userBMovies: Array<{ movie_id: string; beta: number }>
): SmartCorrelationResult | null {
  if (userAMovies.length < 10 || userBMovies.length < 10) {
    return null;
  }

  // Sort by beta descending and add rank
  const sortedA = [...userAMovies]
    .sort((a, b) => b.beta - a.beta)
    .slice(0, TOP_25_LIMIT)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const sortedB = [...userBMovies]
    .sort((a, b) => b.beta - a.beta)
    .slice(0, TOP_25_LIMIT)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const userBMap = new Map(sortedB.map(m => [m.movie_id, m]));

  const findOverlap = (limit: number) => {
    const overlapping: SmartCorrelationResult['overlappingMovies'] = [];

    for (const movieA of sortedA.slice(0, limit)) {
      const movieB = userBMap.get(movieA.movie_id);
      if (movieB && movieB.rank <= limit) {
        overlapping.push({
          movieId: movieA.movie_id,
          betaA: movieA.beta,
          betaB: movieB.beta,
          rankA: movieA.rank,
          rankB: movieB.rank,
          weightA: calculateRankWeight(movieA.rank),
          weightB: calculateRankWeight(movieB.rank),
        });
      }
    }

    return overlapping;
  };

  // Try top 15 first
  let overlapping = findOverlap(TOP_15_LIMIT);
  let expandedToTop25 = false;

  if (overlapping.length < MIN_OVERLAP_REQUIRED) {
    overlapping = findOverlap(TOP_25_LIMIT);
    expandedToTop25 = true;

    if (overlapping.length < MIN_OVERLAP_REQUIRED) {
      return null;
    }
  }

  const correlation = calculateWeightedPearsonCorrelation(overlapping);

  if (correlation === null || isNaN(correlation)) {
    return null;
  }

  return {
    rSquared: correlation * correlation,
    correlation,
    overlapCount: overlapping.length,
    overlappingMovies: overlapping,
    expandedToTop25,
  };
}

/**
 * Calculate correlation from pre-fetched movie data (no Supabase calls).
 * Used by batch similarity computation to avoid 2N queries.
 */
export function calculateCorrelationFromData(
  userAMovies: { movie_id: string; beta: number }[],
  userBMovies: { movie_id: string; beta: number }[]
): SmartCorrelationResult | null {
  if (userAMovies.length < 10 || userBMovies.length < 10) {
    return null;
  }

  // Already sorted/limited by caller, just add rank
  const userAWithRank = userAMovies.map((m, i) => ({
    ...m,
    rank: i + 1,
  }));

  const userBWithRank = userBMovies.map((m, i) => ({
    ...m,
    rank: i + 1,
  }));

  const userBMap = new Map(userBWithRank.map(m => [m.movie_id, m]));

  const findOverlap = (limit: number) => {
    const overlapping: SmartCorrelationResult['overlappingMovies'] = [];

    for (const movieA of userAWithRank.slice(0, limit)) {
      const movieB = userBMap.get(movieA.movie_id);
      if (movieB && movieB.rank <= limit) {
        overlapping.push({
          movieId: movieA.movie_id,
          betaA: movieA.beta,
          betaB: movieB.beta,
          rankA: movieA.rank,
          rankB: movieB.rank,
          weightA: calculateRankWeight(movieA.rank),
          weightB: calculateRankWeight(movieB.rank),
        });
      }
    }

    return overlapping;
  };

  // Try top 15 first
  let overlapping = findOverlap(TOP_15_LIMIT);
  let expandedToTop25 = false;

  if (overlapping.length < MIN_OVERLAP_REQUIRED) {
    overlapping = findOverlap(TOP_25_LIMIT);
    expandedToTop25 = true;

    if (overlapping.length < MIN_OVERLAP_REQUIRED) {
      return null;
    }
  }

  const correlation = calculateWeightedPearsonCorrelation(overlapping);

  if (correlation === null || isNaN(correlation)) {
    return null;
  }

  return {
    rSquared: correlation * correlation,
    correlation,
    overlapCount: overlapping.length,
    overlappingMovies: overlapping,
    expandedToTop25,
  };
}

/**
 * Get a user's top N movies sorted by beta
 */
export async function getUserTopMovies(
  userId: string,
  limit: number = TOP_15_LIMIT
): Promise<TopMovieData[]> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('movie_id, beta')
    .eq('user_id', userId)
    .eq('status', 'known')
    .order('beta', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((m, i) => ({
    movie_id: m.movie_id,
    beta: m.beta,
    rank: i + 1,
  }));
}
