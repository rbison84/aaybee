import { Genre, Movie } from '../types';

// ============================================
// TYPES
// ============================================

export interface DecideWeights {
  genres: Record<string, number>; // SF winner: 50%, other SF winner: 30%, losers: 10%
  era: { winner: string; loser: string; winnerWeight: number; loserWeight: number };
  familiarity: 'familiar' | 'new';
  familiarityWeights: { familiar: number; new: number };
}

export interface PoolCandidate {
  id: string;
  title: string;
  year: number;
  genres: Genre[];
  posterUrl: string;
  posterColor: string;
  source: 'watchlist' | 'recommendation' | 'ranked' | 'unseen';
  score: number;
}

// ============================================
// CONSTANTS
// ============================================

const ERA_RANGES: Record<string, [number, number]> = {
  'pre-1980': [1900, 1979],
  '1980-99': [1980, 1999],
  '2000s': [2000, 2014],
  'recent': [2015, 2030],
};

// ============================================
// DECIDE SERVICE
// ============================================

export const decideService = {
  /**
   * Get the era key for a given year
   */
  getEraKey: (year: number): string => {
    if (year < 1980) return 'pre-1980';
    if (year < 2000) return '1980-99';
    if (year < 2015) return '2000s';
    return 'recent';
  },

  /**
   * Calculate preference score for a movie based on weights
   */
  calculatePreferenceScore: (
    movie: { year: number; genres: Genre[] },
    weights: DecideWeights
  ): number => {
    let score = 0;

    // Genre scoring
    for (const genre of movie.genres) {
      score += weights.genres[genre] || 0;
    }

    // Era scoring
    const movieEra = decideService.getEraKey(movie.year);
    if (movieEra === weights.era.winner) {
      score += weights.era.winnerWeight * 50;
    } else if (movieEra === weights.era.loser) {
      score += weights.era.loserWeight * 30;
    }

    return score;
  },

  /**
   * Build a pool of 16 movies for the Decide tournament
   * Balances sources based on familiarity preference
   */
  buildMoviePool: (
    watchlist: PoolCandidate[],
    recommendations: PoolCandidate[],
    topRanked: PoolCandidate[],
    weights: DecideWeights,
    poolSize = 16
  ): PoolCandidate[] => {
    console.log('[Decide] Building movie pool...');
    console.log(`[Decide] Sources: watchlist=${watchlist.length}, recs=${recommendations.length}, ranked=${topRanked.length}`);

    // Score all candidates
    const allCandidates: PoolCandidate[] = [];

    const scoreCandidate = (c: PoolCandidate): PoolCandidate => ({
      ...c,
      score: decideService.calculatePreferenceScore(
        { year: c.year, genres: c.genres },
        weights
      ),
    });

    // Add all sources with scores
    allCandidates.push(...watchlist.map(scoreCandidate));
    allCandidates.push(...recommendations.map(scoreCandidate));
    allCandidates.push(...topRanked.map(scoreCandidate));

    // Deduplicate by ID
    const seen = new Set<string>();
    const uniqueCandidates = allCandidates.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Sort by score descending
    uniqueCandidates.sort((a, b) => b.score - a.score);

    // Source allocation based on familiarity
    const pool: PoolCandidate[] = [];
    const usedIds = new Set<string>();

    const addFromSource = (source: PoolCandidate[], count: number) => {
      const available = source.filter(c => !usedIds.has(c.id));
      available.sort((a, b) => b.score - a.score);
      for (const c of available.slice(0, count)) {
        pool.push(c);
        usedIds.add(c.id);
      }
    };

    // Familiarity-based allocation
    if (weights.familiarity === 'familiar') {
      // Familiar: 60% top-ranked, 20% recs, 20% watchlist
      addFromSource(topRanked.map(scoreCandidate), Math.ceil(poolSize * 0.6));
      addFromSource(recommendations.map(scoreCandidate), Math.ceil(poolSize * 0.2));
      addFromSource(watchlist.map(scoreCandidate), Math.ceil(poolSize * 0.2));
    } else {
      // New: 45% recs, 30% watchlist, 25% top-ranked
      addFromSource(recommendations.map(scoreCandidate), Math.ceil(poolSize * 0.45));
      addFromSource(watchlist.map(scoreCandidate), Math.ceil(poolSize * 0.3));
      addFromSource(topRanked.map(scoreCandidate), Math.ceil(poolSize * 0.25));
    }

    // Fill remaining slots with highest-scoring candidates
    const remaining = uniqueCandidates.filter(c => !usedIds.has(c.id));
    while (pool.length < poolSize && remaining.length > 0) {
      const next = remaining.shift()!;
      pool.push(next);
      usedIds.add(next.id);
    }

    // If still not enough, duplicate some top candidates (shouldn't happen with good data)
    while (pool.length < poolSize && pool.length > 0) {
      pool.push({ ...pool[pool.length % pool.length], id: `dup-${pool.length}` });
    }

    // Sort pool by score for seeding
    pool.sort((a, b) => b.score - a.score);

    console.log(`[Decide] Built pool of ${pool.length} movies`);
    return pool;
  },

  /**
   * Convert a Movie to a PoolCandidate
   */
  movieToCandidate: (movie: Movie, source: PoolCandidate['source']): PoolCandidate => ({
    id: movie.id,
    title: movie.title,
    year: movie.year,
    genres: movie.genres,
    posterUrl: movie.posterUrl,
    posterColor: movie.posterColor,
    source,
    score: 0,
  }),

};

export default decideService;
