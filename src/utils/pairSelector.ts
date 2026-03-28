import { Movie, MovieStatus, Genre } from '../types';
import { discoveryService, DiscoveryPair } from '../services/discoveryService';
import { logger } from './logger';
import { VIBE_GENRE_MAP, Vibes, computeGenreAffinity, GENRE_AFFINITY_MAX_BOOST } from './genreAffinity';

// Re-export Vibes type for existing consumers
export type { Vibes } from './genreAffinity';

const log = logger.create('PairSelector');


/**
 * Smart Pair Selection Algorithm
 *
 * SIMPLIFIED APPROACH:
 * 1. Every 5th comparison → Discovery pair (taste-twin recommendation)
 * 2. Otherwise → Weighted exploitation pool (Swiss-style)
 *
 * WEIGHTING FACTORS:
 * - Beta proximity: Movies with similar betas get higher weight (resolves rankings faster)
 * - Undercompared bonus: Movies with <5 comparisons get 2x weight
 * - Convergence penalty: Movies with 10+ comparisons get 0.5x weight
 * - Freshness: Movies not shown recently get higher weight
 * - Status filter: Exclude 'unknown' movies entirely
 *
 * This approach gives ~80% of optimal efficiency with much simpler logic.
 */

// ============================================
// TYPES
// ============================================

export interface UserSession {
  totalComparisons: number;
  consecutiveSkips: number;
  consecutiveRegularPairs: number;
  recentlyShownIds: string[]; // Last 10 movie IDs (5 pairs)
  lastComparisonTime: number;
  deferredDiscovery: boolean; // Discovery was skipped due to consecutive skips
}

export type PairType = 'regular' | 'discovery_similar_users' | 'discovery_uncertain' | 'known_pair';

export interface PairSelectionResult {
  movieA: Movie;
  movieB: Movie;
  reason: string;
  strategy: 'swiss' | 'discovery' | 'discovery_similar_users' | 'fallback' | 'known_pair';
  pairType: PairType;
  quality: {
    betaDiff: number;
    isCompetitive: boolean;
    sameStatus: boolean;
  };
  discoveryInfo?: {
    discoveryMovieId: string;
    recommendedBy: {
      userId: string;
      displayName: string;
      rSquared: number;
      theirRank: number;
    };
  };
}

// ============================================
// CONSTANTS
// ============================================

// Discovery triggers every 5th comparison (after 20+ total)
const DISCOVERY_INTERVAL = 5;
const MIN_COMPARISONS_FOR_DISCOVERY = 20;

// Consecutive skips threshold - after this many skips, show two known movies
const CONSECUTIVE_SKIPS_THRESHOLD = 3;

// Swiss-style pairing constants
const BETA_PROXIMITY_DECAY = 2.0;      // Higher = stronger preference for similar betas
const UNDERCOMPARED_THRESHOLD = 5;     // Movies with fewer comparisons get bonus
const UNDERCOMPARED_BONUS = 2.0;       // 2x weight for undercompared movies
const CONVERGED_THRESHOLD = 10;        // Movies with this many+ comparisons are "converged"
const CONVERGED_PENALTY = 0.5;         // 0.5x weight for converged movies
const FRESHNESS_DECAY = 0.05;          // How quickly freshness recovers (slower = longer cooldown)
const COMPETITIVE_BETA_RANGE = 0.5;    // Beta diff threshold for "competitive" label

// Boundary targeting constants
const BOUNDARY_GAP_THRESHOLD = 0.3;    // Beta gap below which boundary is "uncertain"
const BOUNDARY_BONUS = 3.0;            // Weight multiplier for adjacent movies at uncertain boundaries
const TOP_RANK_BONUS = 1.5;            // Extra bonus for boundaries in top 10

// Recently shown buffer - larger = more variety
const RECENTLY_SHOWN_BUFFER = 30;      // Last 15 pairs = 30 movie IDs

// Genre affinity imported from ../utils/genreAffinity

/**
 * Check if two movies are from the same franchise/collection
 */
function isSameCollection(movieA: Movie, movieB: Movie): boolean {
  // If either movie has no collection, they're not in the same collection
  if (!movieA.collectionId || !movieB.collectionId) {
    return false;
  }
  return movieA.collectionId === movieB.collectionId;
}

/**
 * Check if same-collection pairing should be avoided.
 * In Tier 1, we avoid pairing franchise movies to prevent "flooding".
 * In Tier 2+, we allow it since users have more context.
 */
function shouldAvoidSameCollectionPair(movieA: Movie, movieB: Movie): boolean {
  // If not same collection, no need to avoid
  if (!isSameCollection(movieA, movieB)) {
    return false;
  }

  // Only avoid if at least one movie is Tier 1
  const tierA = movieA.tier || 1;
  const tierB = movieB.tier || 1;

  // If both are Tier 2+, allow pairing
  if (tierA >= 2 && tierB >= 2) {
    return false;
  }

  // At least one is Tier 1, avoid pairing
  return true;
}

/**
 * Filter movies to prevent franchise flooding in Tier 1.
 *
 * - Tier 1: Only the highest-rated movie from each collection
 * - Tier 2+: All movies from that tier are allowed (multiple per franchise OK)
 *
 * This means in early comparisons, users see one "representative" per franchise,
 * but as they unlock higher tiers, sequels/prequels become available.
 */
function deduplicateByCollection(movies: Movie[], currentTier: 1 | 2 | 3 | 4 = 1): Movie[] {
  // Separate Tier 1 movies from higher tier movies
  const tier1Movies = movies.filter(m => (m.tier || 1) === 1);
  const higherTierMovies = movies.filter(m => (m.tier || 1) > 1);

  // Deduplicate only Tier 1 - keep best per collection
  const tier1CollectionBest = new Map<number, Movie>();
  const tier1Standalone: Movie[] = [];

  // Log tier 1 movies without collectionId that might be part of franchises
  const suspiciousTitles = ['Harry Potter', 'Lord of the Rings', 'Star Wars', 'Avengers', 'Spider-Man', 'Batman', 'Iron Man', 'Thor', 'Captain America'];
  for (const movie of tier1Movies) {
    if (!movie.collectionId && suspiciousTitles.some(s => movie.title.includes(s))) {
      log.warn(`Tier 1 movie "${movie.title}" has no collectionId - may cause franchise flooding`);
    }
  }

  for (const movie of tier1Movies) {
    if (!movie.collectionId) {
      tier1Standalone.push(movie);
    } else {
      const existing = tier1CollectionBest.get(movie.collectionId);
      if (!existing) {
        tier1CollectionBest.set(movie.collectionId, movie);
        log.debug(`Collection ${movie.collectionId}: keeping "${movie.title}" (first)`);
      } else {
        // Compare by voteAverage first, then by totalComparisons
        const existingScore = (existing.voteAverage || 0) * 10 + (existing.totalComparisons || 0) * 0.1;
        const newScore = (movie.voteAverage || 0) * 10 + (movie.totalComparisons || 0) * 0.1;
        if (newScore > existingScore) {
          log.debug(`Collection ${movie.collectionId}: replacing "${existing.title}" with "${movie.title}"`);
          tier1CollectionBest.set(movie.collectionId, movie);
        } else {
          log.debug(`Collection ${movie.collectionId}: dropping "${movie.title}" (lower rated than "${existing.title}")`);
        }
      }
    }
  }

  // Combine: deduplicated Tier 1 + all higher tier movies (no dedup for Tier 2+)
  return [
    ...tier1Standalone,
    ...tier1CollectionBest.values(),
    ...higherTierMovies,
  ];
}

// Exploration mode: guarantee new movies in early comparisons
const EXPLORATION_PHASE_LIMIT = 150;   // First 150 comparisons prioritize new movies

// Ranking-ready bonus: movies with exactly 1 comparison are one away from ranked
const RANKING_READY_BONUS = 3.0;       // 3x weight for 1-comparison movies

/**
 * Phase-aware exploration rate.
 * Post-onboarding, the pool is already seeded from onboarding (~30 movies with 1 comparison).
 * Lower exploration lets Swiss selection drain that backlog into ranked movies.
 *
 * 0-15:  30% — some new movies but mostly ranking the onboarding backlog
 * 15-40: 15% — balanced, rankings growing steadily
 * 40+:   10% — occasional new introductions, Swiss handles the rest
 */
function getExplorationRate(postOnboardingComparisons: number): number {
  if (postOnboardingComparisons < 15) return 0.30;
  if (postOnboardingComparisons < 40) return 0.15;
  return 0.10;
}

// Progressive phase tuning thresholds
const EARLY_PHASE_LIMIT = 20;   // 0–20 post-onboarding comparisons
const MID_PHASE_LIMIT = 50;     // 20–50 post-onboarding comparisons
const LATE_PHASE_LIMIT = 150;   // 50-150 post-onboarding comparisons

// Smooth transition window (comparisons before/after threshold to interpolate)
const PHASE_TRANSITION_WINDOW = 10;

// Top-N refinement constants
const TOP_N_REFINEMENT_SIZE = 15;           // Focus on top 15 rankings
const TOP_N_BETA_GAP_THRESHOLD = 0.3;       // Beta gap below which boundary is "uncertain"
const TOP_N_CARVEOUT_RATE_INITIAL = 0.20;   // 20% of comparisons at 150
const TOP_N_CARVEOUT_RATE_FINAL = 0.10;     // 10% of comparisons at 300+
const TOP_N_CARVEOUT_SCALE_END = 300;       // When rate reaches final value
const TOP_N_STABILITY_THRESHOLD = 3;        // Max position changes in lookback window
const TOP_N_STABILITY_LOOKBACK = 30;        // Comparisons to look back for stability

interface PhaseMultipliers {
  undercomparedMult: number;
  betaSimilarityMult: number;
  boundaryMult: number;
}

// Phase target values
const PHASE_VALUES = {
  early:  { undercomparedMult: 8.0, betaSimilarityMult: 0.3, boundaryMult: 0.3 },
  mid:    { undercomparedMult: 4.0, betaSimilarityMult: 0.7, boundaryMult: 0.7 },
  mature: { undercomparedMult: 2.0, betaSimilarityMult: 1.5, boundaryMult: 2.0 },
};

/**
 * Smoothstep interpolation - S-curve that's imperceptible at edges
 * Returns 0 when x <= edge0, 1 when x >= edge1, smooth transition between
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two phase multiplier sets
 */
function lerpPhase(a: PhaseMultipliers, b: PhaseMultipliers, t: number): PhaseMultipliers {
  return {
    undercomparedMult: lerp(a.undercomparedMult, b.undercomparedMult, t),
    betaSimilarityMult: lerp(a.betaSimilarityMult, b.betaSimilarityMult, t),
    boundaryMult: lerp(a.boundaryMult, b.boundaryMult, t),
  };
}

/**
 * Get phase-aware weight multipliers with smooth transitions.
 *
 * Uses smoothstep interpolation to avoid jarring behavioral changes.
 * Transitions occur over a ±10 comparison window around each threshold.
 *
 * Early (0–20):  Favor variety — 8x undercompared, 0.3x beta similarity, 0.3x boundary
 * Mid (20–50):   Balanced — 4x undercompared, 0.7x beta similarity, 0.7x boundary
 * Mature (50+):  Precision — 2x undercompared, 1.5x beta similarity, 2x boundary
 */
function getPhaseMultipliers(postOnboardingComparisons: number): PhaseMultipliers {
  const n = postOnboardingComparisons;

  // Early phase (before first transition starts)
  if (n < EARLY_PHASE_LIMIT - PHASE_TRANSITION_WINDOW) {
    return PHASE_VALUES.early;
  }

  // Transition from early to mid (10-30 comparisons)
  if (n < EARLY_PHASE_LIMIT + PHASE_TRANSITION_WINDOW) {
    const t = smoothstep(
      EARLY_PHASE_LIMIT - PHASE_TRANSITION_WINDOW,
      EARLY_PHASE_LIMIT + PHASE_TRANSITION_WINDOW,
      n
    );
    return lerpPhase(PHASE_VALUES.early, PHASE_VALUES.mid, t);
  }

  // Mid phase (before second transition starts)
  if (n < MID_PHASE_LIMIT - PHASE_TRANSITION_WINDOW) {
    return PHASE_VALUES.mid;
  }

  // Transition from mid to mature (40-60 comparisons)
  if (n < MID_PHASE_LIMIT + PHASE_TRANSITION_WINDOW) {
    const t = smoothstep(
      MID_PHASE_LIMIT - PHASE_TRANSITION_WINDOW,
      MID_PHASE_LIMIT + PHASE_TRANSITION_WINDOW,
      n
    );
    return lerpPhase(PHASE_VALUES.mid, PHASE_VALUES.mature, t);
  }

  // Mature phase
  return PHASE_VALUES.mature;
}

// ============================================
// TOP-N REFINEMENT CARVE-OUT
// ============================================

interface TopNRefinementPair {
  movieA: Movie;
  movieB: Movie;
  rankA: number;
  rankB: number;
  betaGap: number;
}

/**
 * Get the current top-N refinement carve-out rate.
 * Starts at 20% and scales down to 10% as comparisons increase.
 */
function getTopNCarveoutRate(postOnboardingComparisons: number): number {
  if (postOnboardingComparisons < LATE_PHASE_LIMIT) {
    return 0; // No carve-out during exploration phase
  }

  // Scale from initial to final rate between LATE_PHASE_LIMIT and SCALE_END
  const t = Math.min(1, (postOnboardingComparisons - LATE_PHASE_LIMIT) /
    (TOP_N_CARVEOUT_SCALE_END - LATE_PHASE_LIMIT));

  return lerp(TOP_N_CARVEOUT_RATE_INITIAL, TOP_N_CARVEOUT_RATE_FINAL, t);
}

/**
 * Check if top-N ranking is stable enough for refinement.
 *
 * Stability is determined by tracking position changes in recent comparisons.
 * If the top N has had fewer than STABILITY_THRESHOLD position changes
 * in the last STABILITY_LOOKBACK comparisons, it's considered stable.
 *
 * For simplicity, we approximate this by checking if top-N movies
 * have enough comparisons and small gaps between adjacent movies.
 */
function isTopNStable(
  rankedMovies: Movie[],
  postOnboardingComparisons: number
): boolean {
  // Need enough comparisons total
  if (postOnboardingComparisons < LATE_PHASE_LIMIT) {
    return false;
  }

  // Get top N
  const topN = rankedMovies.slice(0, TOP_N_REFINEMENT_SIZE);

  if (topN.length < TOP_N_REFINEMENT_SIZE) {
    return false;
  }

  // Check that each top-N movie has enough comparisons to be meaningful
  const minComparisonsForStability = 2;
  const wellCompared = topN.filter(m => m.totalComparisons >= minComparisonsForStability);

  // At least 80% of top-N should be well-compared
  return wellCompared.length >= TOP_N_REFINEMENT_SIZE * 0.8;
}

/**
 * Find uncertain boundaries in the top-N rankings.
 *
 * An "uncertain boundary" is where two adjacent movies in the ranking
 * have a beta gap smaller than the threshold, indicating the relative
 * order isn't confidently established yet.
 */
function findUncertainTopNBoundaries(rankedMovies: Movie[]): TopNRefinementPair[] {
  const topN = rankedMovies.slice(0, TOP_N_REFINEMENT_SIZE);
  const uncertainPairs: TopNRefinementPair[] = [];

  for (let i = 0; i < topN.length - 1; i++) {
    const movieA = topN[i];
    const movieB = topN[i + 1];
    const betaGap = movieA.beta - movieB.beta; // A should have higher beta

    if (betaGap < TOP_N_BETA_GAP_THRESHOLD) {
      uncertainPairs.push({
        movieA,
        movieB,
        rankA: i + 1,
        rankB: i + 2,
        betaGap,
      });
    }
  }

  return uncertainPairs;
}

/**
 * Select a top-N refinement pair.
 *
 * Prioritizes pairs with:
 * 1. Smaller beta gaps (more uncertain)
 * 2. Higher positions (top 5 matters more than #14/#15)
 *
 * Ignores convergence penalty - we want to compare these regardless of
 * how many times they've been compared before.
 */
function selectTopNRefinementPair(
  rankedMovies: Movie[],
  recentIds: Set<string>
): TopNRefinementPair | null {
  const uncertainPairs = findUncertainTopNBoundaries(rankedMovies);

  if (uncertainPairs.length === 0) {
    return null;
  }

  // Filter out pairs where either movie was recently shown
  const eligiblePairs = uncertainPairs.filter(
    p => !recentIds.has(p.movieA.id) && !recentIds.has(p.movieB.id)
  );

  if (eligiblePairs.length === 0) {
    // All uncertain pairs were recently shown, pick least recent uncertain pair
    // For simplicity, just return null and let normal selection handle it
    return null;
  }

  // Weight by position (higher = better) and uncertainty (smaller gap = better)
  const weights = eligiblePairs.map(p => {
    // Position weight: top 5 gets 2x, top 10 gets 1.5x
    let positionWeight = 1.0;
    if (p.rankA <= 5) positionWeight = 2.0;
    else if (p.rankA <= 10) positionWeight = 1.5;

    // Uncertainty weight: smaller gaps get higher weight
    // At gap=0, weight=3; at gap=threshold, weight=1
    const uncertaintyWeight = 1 + 2 * (1 - p.betaGap / TOP_N_BETA_GAP_THRESHOLD);

    return positionWeight * uncertaintyWeight;
  });

  // Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return eligiblePairs[i];
    }
  }

  return eligiblePairs[eligiblePairs.length - 1];
}

// ============================================
// BESPOKE POOLS - Era-based selection
// ============================================

// Era pool distribution changes with progression
// Early: more familiar (era-heavy), Late: more discovery (tier-heavy)
interface PoolBlend {
  tierBased: number;  // Percentage for tier-based selection
  eraBased: number;   // Percentage for era-based selection (40/40/20)
}

/**
 * Get the pool blend ratio based on comparison count
 *
 * Uses smooth interpolation so era-based selection fades gradually:
 * Early (0-50):   70% era-based, 30% tier-based (familiarity)
 * Mid (50-150):   50% era-based, 50% tier-based (balanced)
 * Late (150+):    40% era-based, 60% tier-based (still meaningful era presence)
 */
function getPoolBlend(postOnboardingComparisons: number): PoolBlend {
  let eraPct: number;
  if (postOnboardingComparisons < MID_PHASE_LIMIT) {
    // 70% → smoothly toward 50% as we approach MID_PHASE_LIMIT
    const t = smoothstep(0, MID_PHASE_LIMIT, postOnboardingComparisons);
    eraPct = lerp(70, 50, t);
  } else if (postOnboardingComparisons < LATE_PHASE_LIMIT) {
    // 50% → smoothly toward 40%
    const t = smoothstep(MID_PHASE_LIMIT, LATE_PHASE_LIMIT, postOnboardingComparisons);
    eraPct = lerp(50, 40, t);
  } else {
    eraPct = 40;
  }
  return { tierBased: 100 - eraPct, eraBased: eraPct };
}

// Adjacent years range (±10 years from prime)
const ADJACENT_YEARS_RANGE = 10;

// All-timer movie IDs (highest cultural impact)
const ALL_TIMER_IDS = new Set([
  'tmdb-278',    // The Shawshank Redemption
  'tmdb-238',    // The Godfather
  'tmdb-240',    // The Godfather Part II
  'tmdb-155',    // The Dark Knight
  'tmdb-550',    // Fight Club
  'tmdb-680',    // Pulp Fiction
  'tmdb-13',     // Forrest Gump
  'tmdb-603',    // The Matrix
  'tmdb-120',    // LOTR: Fellowship
  'tmdb-122',    // LOTR: Return of the King
  'tmdb-27205',  // Inception
  'tmdb-157336', // Interstellar
  'tmdb-11',     // Star Wars
  'tmdb-1891',   // Empire Strikes Back
  'tmdb-329',    // Jurassic Park
  'tmdb-597',    // Titanic
  'tmdb-274',    // Silence of the Lambs
  'tmdb-807',    // Se7en
  'tmdb-78',     // Blade Runner
  'tmdb-105',    // Back to the Future
  'tmdb-389',    // 12 Angry Men
  'tmdb-429',    // The Good, the Bad and the Ugly
  'tmdb-496243', // Parasite
  'tmdb-299536', // Avengers: Infinity War
]);

/**
 * Identify generational touchstones — childhood movies (ages 0–14) that
 * are almost certainly familiar: animated films and the biggest cultural
 * phenomena by TMDB vote count.
 */
// Family-friendly MPAA ratings
const FAMILY_RATINGS = new Set(['G', 'PG', 'PG-13', 'NR', '']);

function getGenerationalTouchstones(candidates: Movie[], birthDecade: number): Set<string> {
  const childhoodStart = birthDecade;
  const childhoodEnd = birthDecade + 14;

  const childhoodMovies = candidates.filter(m =>
    m.year >= childhoodStart && m.year <= childhoodEnd
  );

  // Animation from childhood era — Disney, Pixar, etc.
  const animationIds = childhoodMovies
    .filter(m => m.genres.includes('animation'))
    .map(m => m.id);

  // Top family-friendly movies (G, PG, PG-13) by popularity
  // Falls back to genre filter if certification not available
  const familyFriendly = childhoodMovies.filter(m => {
    if (m.certification) {
      return FAMILY_RATINGS.has(m.certification);
    }
    // Fallback: exclude obvious adult genres
    return !m.genres.includes('horror') && !m.genres.includes('thriller');
  });

  const topFamilyMovies = [...familyFriendly]
    .sort((a, b) => {
      const scoreA = (a.voteCount || 0) + (a.voteAverage || 0) * 1000;
      const scoreB = (b.voteCount || 0) + (b.voteAverage || 0) * 1000;
      return scoreB - scoreA;
    })
    .slice(0, 25)
    .map(m => m.id);

  log.debug(`Childhood ${birthDecade}-${birthDecade + 14}: ${animationIds.length} animated, ${topFamilyMovies.length} family-friendly`);

  return new Set([...animationIds, ...topFamilyMovies]);
}

interface EraPoolResult {
  pool: Movie[];
  poolType: 'prime' | 'childhood' | 'adjacent' | 'alltimer' | 'tier';
}

/**
 * Select a movie from era-based pools (50/28/22 distribution)
 * Matches onboarding: 50% prime (incl childhood), 28% adjacent, 22% all-timers
 *
 * Within the 50% prime allocation:
 * - ~33% childhood (ages 0-14, family-friendly)
 * - ~67% general prime (ages 12-25)
 */
function selectFromEraPools(
  candidates: Movie[],
  primeStart: number | null,
  primeEnd: number | null,
  excludeIds: Set<string>,
  birthDecade: number | null = null
): EraPoolResult | null {
  if (!primeStart || !primeEnd) {
    // No prime years set, fall back to tier-based
    return null;
  }

  const adjacentBeforeStart = primeStart - ADJACENT_YEARS_RANGE;
  const adjacentAfterEnd = primeEnd + ADJACENT_YEARS_RANGE;

  // Build childhood pool (ages 0-14, family-friendly)
  let childhoodPool: Movie[] = [];
  if (birthDecade) {
    const childhoodEnd = birthDecade + 14;
    childhoodPool = candidates.filter(m => {
      if (excludeIds.has(m.id)) return false;
      if (m.year < birthDecade || m.year > childhoodEnd) return false;
      // Must be family-friendly (G, PG, PG-13) or animation
      if (m.genres?.includes('animation')) return true;
      if (m.certification && FAMILY_RATINGS.has(m.certification)) return true;
      // Fallback: exclude horror/thriller if no certification
      if (!m.certification) {
        return !m.genres?.includes('horror') && !m.genres?.includes('thriller');
      }
      return false;
    });
  }

  // Build prime pool (ages 12-25, excluding childhood movies)
  const childhoodIds = new Set(childhoodPool.map(m => m.id));
  const primePool = candidates.filter(m =>
    !excludeIds.has(m.id) &&
    !childhoodIds.has(m.id) &&
    m.year >= primeStart &&
    m.year <= primeEnd
  );

  // Build adjacent pool
  const adjacentPool = candidates.filter(m =>
    !excludeIds.has(m.id) &&
    ((m.year >= adjacentBeforeStart && m.year < primeStart) ||
     (m.year > primeEnd && m.year <= adjacentAfterEnd))
  );

  // Build all-timer pool (just the hardcoded classics, no touchstones - those are in childhood)
  const allTimerPool = candidates.filter(m =>
    !excludeIds.has(m.id) &&
    ALL_TIMER_IDS.has(m.id)
  );

  // Log pool sizes
  if (childhoodPool.length > 0) {
    log.debug(`Childhood pool: ${childhoodPool.length} movies`);
  }

  // 50/28/22 weighted selection (matching onboarding ratios)
  // Within the 50% prime: ~17% childhood, ~33% general prime
  const roll = Math.random() * 100;

  if (roll < 17 && childhoodPool.length > 0) {
    // ~17% childhood (1/3 of 50% prime allocation)
    return { pool: childhoodPool, poolType: 'childhood' };
  } else if (roll < 50 && primePool.length > 0) {
    // ~33% general prime (2/3 of 50% prime allocation)
    return { pool: primePool, poolType: 'prime' };
  } else if (roll < 78 && adjacentPool.length > 0) {
    // 28% adjacent years
    return { pool: adjacentPool, poolType: 'adjacent' };
  } else if (allTimerPool.length > 0) {
    // 22% all-timers
    return { pool: allTimerPool, poolType: 'alltimer' };
  }

  // Fallback: try pools in order of availability
  if (primePool.length > 0) return { pool: primePool, poolType: 'prime' };
  if (childhoodPool.length > 0) return { pool: childhoodPool, poolType: 'childhood' };
  if (adjacentPool.length > 0) return { pool: adjacentPool, poolType: 'adjacent' };
  if (allTimerPool.length > 0) return { pool: allTimerPool, poolType: 'alltimer' };

  return null;
}

// Progressive unlock thresholds
const TIER_UNLOCK_THRESHOLDS = {
  1: 0,    // Tier 1: Available immediately
  2: 200,  // Tier 2: After 200 comparisons
  3: 400,  // Tier 3: After 400 comparisons
  4: 750,  // Tier 4: After 750 comparisons
};

/**
 * Get current unlock tier based on total comparisons
 */
export function getCurrentTier(totalComparisons: number, poolUnlockedTier?: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  // Comparison-based tier
  let comparisonTier: 1 | 2 | 3 | 4 = 1;
  if (totalComparisons >= TIER_UNLOCK_THRESHOLDS[4]) comparisonTier = 4;
  else if (totalComparisons >= TIER_UNLOCK_THRESHOLDS[3]) comparisonTier = 3;
  else if (totalComparisons >= TIER_UNLOCK_THRESHOLDS[2]) comparisonTier = 2;

  // Return the higher of comparison-based or pool-based tier
  return Math.max(comparisonTier, poolUnlockedTier || 1) as 1 | 2 | 3 | 4;
}

/**
 * Get comparisons needed for next tier
 */
export function getComparisonsForNextTier(totalComparisons: number): number | null {
  const currentTier = getCurrentTier(totalComparisons);
  if (currentTier === 4) return null; // Already at max tier
  const nextTierThreshold = TIER_UNLOCK_THRESHOLDS[(currentTier + 1) as 2 | 3 | 4];
  return nextTierThreshold - totalComparisons;
}

/**
 * Get tier info for a movie pool
 */
export function getTierStats(movies: Movie[], totalComparisons: number): {
  currentTier: 1 | 2 | 3 | 4;
  availableMovies: number;
  totalMovies: number;
  comparisonsToNextTier: number | null;
} {
  const currentTier = getCurrentTier(totalComparisons);
  const availableMovies = movies.filter(m => (m.tier || 1) <= currentTier).length;
  return {
    currentTier,
    availableMovies,
    totalMovies: movies.length,
    comparisonsToNextTier: getComparisonsForNextTier(totalComparisons),
  };
}

// ============================================
// MAIN SELECTION FUNCTION
// ============================================

/**
 * Main pair selection - bespoke pools algorithm
 *
 * 1. Check for consecutive skips → show known pair
 * 2. Determine pool blend (era-based vs tier-based) based on progression
 * 3. Build candidate pool excluding unknown/recent movies
 * 4. Roll to decide era-based (40/40/20) or tier-based selection
 * 5. Select Swiss-style pair from chosen pool
 */
export function selectPair(
  movies: Movie[],
  session: UserSession,
  vibes?: Vibes,
  birthDecade: number | null = null,
  postOnboardingComparisons: number = 0,
  primeYearsStart: number | null = null,
  primeYearsEnd: number | null = null,
  poolUnlockedTier?: 1 | 2 | 3 | 4,
  rankedMovies: Movie[] = []
): PairSelectionResult | null {
  // Step 1: Check for consecutive skips - show two known movies
  if (session.consecutiveSkips >= CONSECUTIVE_SKIPS_THRESHOLD) {
    const knownPair = selectKnownPair(movies, session, poolUnlockedTier);
    if (knownPair) {
      return knownPair;
    }
    // Fall through if not enough known movies
  }

  // Step 2: Build candidate pool (exclude unknown, recently shown, locked tiers, and duplicate franchises)
  const recentIds = new Set(session.recentlyShownIds.slice(-RECENTLY_SHOWN_BUFFER));
  const currentTier = getCurrentTier(session.totalComparisons, poolUnlockedTier);

  // Deduplicate by collection first (on the full eligible pool) so the
  // representative per franchise stays stable regardless of recently-shown state.
  const eligibleFiltered = movies.filter(m =>
    m.status !== 'unknown' &&
    (m.tier || 1) <= currentTier
  );
  const deduped = deduplicateByCollection(eligibleFiltered);

  // Then filter out recently shown movies
  const candidates = deduped.filter(m => !recentIds.has(m.id));

  if (candidates.length < 2) {
    // Fallback: use all non-unknown movies in current tier (still deduplicated)
    const fallbackFiltered = movies.filter(m =>
      m.status !== 'unknown' &&
      (m.tier || 1) <= currentTier
    );
    const fallbackPool = deduplicateByCollection(fallbackFiltered);

    if (fallbackPool.length < 2) {
      // Last resort: use any movies in current tier (deduplicated)
      const tierFiltered = movies.filter(m => (m.tier || 1) <= currentTier);
      const tierPool = deduplicateByCollection(tierFiltered);
      if (tierPool.length < 2) return null;
      return selectFallbackPair(tierPool, 'Not enough eligible movies');
    }
    return selectSwissPair(fallbackPool, session, birthDecade, postOnboardingComparisons, 'Limited pool - using all non-unknown', vibes, rankedMovies);
  }

  // Step 3: Determine pool blend based on progression
  const blend = getPoolBlend(postOnboardingComparisons);
  const useEraBased = Math.random() * 100 < blend.eraBased;

  // Step 4: If era-based selection, try to select from era pools
  if (useEraBased && primeYearsStart && primeYearsEnd) {
    const eraResult = selectFromEraPools(candidates, primeYearsStart, primeYearsEnd, recentIds, birthDecade);

    if (eraResult && eraResult.pool.length >= 2) {
      // Select pair from era pool using Swiss-style within that pool
      const customReason = `Era-based (${eraResult.poolType}): ${blend.eraBased}% era / ${blend.tierBased}% tier blend`;
      return selectSwissPair(eraResult.pool, session, birthDecade, postOnboardingComparisons, customReason, vibes, rankedMovies);
    }
    // Fall through to tier-based if era pool too small
  }

  // Step 5: Tier-based Swiss-style pair from all candidates
  const reason = useEraBased
    ? `Tier-based (era pool empty): ${blend.eraBased}% era / ${blend.tierBased}% tier blend`
    : `Tier-based: ${blend.eraBased}% era / ${blend.tierBased}% tier blend`;

  return selectSwissPair(candidates, session, birthDecade, postOnboardingComparisons, reason, vibes, rankedMovies);
}

/**
 * Select a pair of two known (already compared) movies
 * Used after consecutive skips to give user familiar content
 */
function selectKnownPair(
  movies: Movie[],
  session: UserSession,
  poolUnlockedTier?: 1 | 2 | 3 | 4
): PairSelectionResult | null {
  const recentIds = new Set(session.recentlyShownIds.slice(-RECENTLY_SHOWN_BUFFER));
  const currentTier = getCurrentTier(session.totalComparisons, poolUnlockedTier);

  // Get movies that are "known" (have been compared before) and in current tier
  // Deduplicate before filtering recently shown so the collection
  // representative stays stable (same fix as main path).
  const knownAll = movies.filter(m =>
    m.status === 'known' &&
    m.totalComparisons > 0 &&
    (m.tier || 1) <= currentTier
  );
  const knownDeduped = deduplicateByCollection(knownAll);
  const knownMovies = knownDeduped.filter(m => !recentIds.has(m.id));

  if (knownMovies.length < 2) {
    return null;
  }

  // Sort by beta and pick two with similar betas (Swiss-style)
  const sorted = [...knownMovies].sort((a, b) => b.beta - a.beta);

  // Pick a random starting point, then find an adjacent movie not from same collection
  const startIdx = Math.floor(Math.random() * (sorted.length - 1));
  const movieA = sorted[startIdx];

  // Try to find a nearby movie not from same collection (Tier 1 only)
  let movieB: Movie | null = null;
  // Search forward first
  for (let i = startIdx + 1; i < sorted.length; i++) {
    if (!shouldAvoidSameCollectionPair(movieA, sorted[i])) {
      movieB = sorted[i];
      break;
    }
  }
  // If not found, search backward
  if (!movieB) {
    for (let i = startIdx - 1; i >= 0; i--) {
      if (!shouldAvoidSameCollectionPair(movieA, sorted[i])) {
        movieB = sorted[i];
        break;
      }
    }
  }
  // Final fallback: just use adjacent
  if (!movieB) {
    movieB = sorted[startIdx + 1];
  }

  const betaDiff = Math.abs(movieA.beta - movieB.beta);

  return {
    movieA,
    movieB,
    reason: `Known pair: Two movies you've ranked (after ${session.consecutiveSkips} skips)`,
    strategy: 'known_pair',
    pairType: 'known_pair',
    quality: {
      betaDiff: Math.round(betaDiff * 100) / 100,
      isCompetitive: betaDiff <= COMPETITIVE_BETA_RANGE,
      sameStatus: true,
    },
  };
}

/**
 * Swiss-style pair selection with boundary targeting
 *
 * 1. In exploration phase, may force selection of never-compared movies
 * 2. Build ranking index for boundary detection
 * 3. Select first movie: weighted by undercompared bonus + freshness + convergence penalty
 * 4. Select second movie: weighted by beta proximity + boundary bonus for adjacent ranks
 */
function selectSwissPair(
  candidates: Movie[],
  session: UserSession,
  birthDecade: number | null,
  postOnboardingComparisons: number = 0,
  customReason?: string,
  vibes?: Vibes,
  rankedMovies: Movie[] = []
): PairSelectionResult {
  // Get phase multipliers for progressive tuning
  const phase = getPhaseMultipliers(postOnboardingComparisons);

  // Compute genre affinity once for this selection
  const genreAffinity = computeGenreAffinity(vibes, rankedMovies, postOnboardingComparisons);

  // EXPLORATION MODE: In early phase, introduce new movies (preferring user's era)
  // Post-onboarding: prefer pairing new movie + seen-once movie so exploration
  // also builds rankings. Falls back to two-new if no seen-once movies available.
  const inExplorationPhase = postOnboardingComparisons < EXPLORATION_PHASE_LIMIT;
  const neverCompared = candidates.filter(m => m.totalComparisons === 0);
  const explorationRate = getExplorationRate(postOnboardingComparisons);

  if (inExplorationPhase && neverCompared.length >= 1 && Math.random() < explorationRate) {
    // Prefer movies from user's era if birthDecade is set
    let explorationPool = neverCompared;
    if (birthDecade) {
      const formativeStart = birthDecade + 15;
      const formativeEnd = birthDecade + 30;
      const adjacentStart = formativeStart - ADJACENT_YEARS_RANGE;
      const adjacentEnd = formativeEnd + ADJACENT_YEARS_RANGE;

      // Try prime years first
      const primeYearMovies = neverCompared.filter(m => m.year >= formativeStart && m.year <= formativeEnd);
      if (primeYearMovies.length >= 1) {
        explorationPool = primeYearMovies;
      } else {
        // Fall back to adjacent years
        const adjacentMovies = neverCompared.filter(m => m.year >= adjacentStart && m.year <= adjacentEnd);
        if (adjacentMovies.length >= 1) {
          explorationPool = adjacentMovies;
        }
        // Otherwise use all never-compared (includes classics)
      }
    }

    // Select movieA (the new movie) using genre-weighted random
    const explorationWeights = explorationPool.map(m => {
      let w = 1.0;
      if (genreAffinity && m.genres.length > 0) {
        const maxAff = Math.max(...m.genres.map(g => genreAffinity[g] || 0));
        w *= 1.0 + maxAff * GENRE_AFFINITY_MAX_BOOST;
      }
      return w;
    });
    const movieAIndex = weightedRandomSelect(explorationWeights);
    const movieA = explorationPool[movieAIndex];

    // Select movieB: prefer a seen-once movie (1 comparison) so this pair
    // also pushes that movie to ranked status. Falls back to another new movie.
    const seenOnce = candidates.filter(m =>
      m.id !== movieA.id &&
      m.totalComparisons === 1 &&
      !shouldAvoidSameCollectionPair(movieA, m)
    );

    let movieB: Movie;
    let reason: string;

    if (seenOnce.length > 0) {
      // Pair new movie with a seen-once movie — exploration + ranking in one
      const seenOnceWeights = seenOnce.map(m => {
        let w = 1.0;
        if (genreAffinity && m.genres.length > 0) {
          const maxAff = Math.max(...m.genres.map(g => genreAffinity[g] || 0));
          w *= 1.0 + maxAff * GENRE_AFFINITY_MAX_BOOST;
        }
        return w;
      });
      movieB = seenOnce[weightedRandomSelect(seenOnceWeights)];
      reason = customReason || `Exploration: New + ranking-ready (${neverCompared.length} unseen)`;
    } else if (explorationPool.length >= 2) {
      // No seen-once available, pair two new movies
      const remainingExploration = explorationPool.filter((m, i) =>
        i !== movieAIndex && !shouldAvoidSameCollectionPair(movieA, m)
      );
      const fallbackExploration = remainingExploration.length > 0
        ? remainingExploration
        : explorationPool.filter((_, i) => i !== movieAIndex);
      const movieBWeights = fallbackExploration.map(m => {
        let w = 1.0;
        if (genreAffinity && m.genres.length > 0) {
          const maxAff = Math.max(...m.genres.map(g => genreAffinity[g] || 0));
          w *= 1.0 + maxAff * GENRE_AFFINITY_MAX_BOOST;
        }
        return w;
      });
      movieB = fallbackExploration[weightedRandomSelect(movieBWeights)];
      reason = customReason || `Exploration: Two new movies (${neverCompared.length} unseen remaining)`;
    } else {
      // Only 1 new movie and no seen-once — fall through to Swiss selection
      movieB = null as any;
      reason = '';
    }

    if (movieB) {
      const betaDiff = Math.abs(movieA.beta - movieB.beta);
      return {
        movieA,
        movieB,
        reason,
        strategy: 'swiss',
        pairType: 'regular',
        quality: {
          betaDiff: Math.round(betaDiff * 100) / 100,
          isCompetitive: true,
          sameStatus: movieA.status === movieB.status,
        },
      };
    }
  }

  // TOP-N REFINEMENT CARVE-OUT: After exploration, dedicate some comparisons
  // to refining the top rankings where precision matters most
  if (!inExplorationPhase) {
    const carveoutRate = getTopNCarveoutRate(postOnboardingComparisons);

    if (carveoutRate > 0 && Math.random() < carveoutRate) {
      // Build ranked list for refinement check
      const rankedForRefinement = [...candidates]
        .filter(m => m.totalComparisons > 0)
        .sort((a, b) => b.beta - a.beta);

      if (isTopNStable(rankedForRefinement, postOnboardingComparisons)) {
        const recentIds = new Set(session.recentlyShownIds.slice(-RECENTLY_SHOWN_BUFFER));
        const refinementPair = selectTopNRefinementPair(rankedForRefinement, recentIds);

        if (refinementPair) {
          const { movieA, movieB, rankA, rankB, betaGap } = refinementPair;

          return {
            movieA,
            movieB,
            reason: `Top-N Refinement: #${rankA} vs #${rankB} (Δβ=${betaGap.toFixed(2)})`,
            strategy: 'swiss',
            pairType: 'regular',
            quality: {
              betaDiff: Math.round(betaGap * 100) / 100,
              isCompetitive: true,
              sameStatus: movieA.status === movieB.status,
            },
          };
        }
      }
    }
  }

  // If only 1 never-compared movie in era, pair it with a low-comparison movie from same era
  if (inExplorationPhase && neverCompared.length >= 1 && Math.random() < explorationRate) {
    let movieA = neverCompared[0];

    // Prefer a movie from user's era
    if (birthDecade) {
      const formativeStart = birthDecade + 15;
      const formativeEnd = birthDecade + 30;
      const adjacentStart = formativeStart - ADJACENT_YEARS_RANGE;
      const adjacentEnd = formativeEnd + ADJACENT_YEARS_RANGE;

      const eraMovies = neverCompared.filter(m => m.year >= adjacentStart && m.year <= adjacentEnd);
      if (eraMovies.length > 0) {
        movieA = eraMovies[Math.floor(Math.random() * eraMovies.length)];
      }
    }

    const lowComparison = candidates
      .filter(m => m.id !== movieA.id && m.totalComparisons < UNDERCOMPARED_THRESHOLD && !shouldAvoidSameCollectionPair(movieA, m))
      .sort(() => Math.random() - 0.5);

    // Fall back to any low-comparison movie if all are from same collection
    const lowComparisonFallback = lowComparison.length > 0 ? lowComparison : candidates
      .filter(m => m.id !== movieA.id && m.totalComparisons < UNDERCOMPARED_THRESHOLD)
      .sort(() => Math.random() - 0.5);

    if (lowComparisonFallback.length > 0) {
      const movieB = lowComparisonFallback[0];
      const betaDiff = Math.abs(movieA.beta - movieB.beta);

      return {
        movieA,
        movieB,
        reason: customReason || `Exploration: New movie + low-comparison (${neverCompared.length} unseen)`,
        strategy: 'swiss',
        pairType: 'regular',
        quality: {
          betaDiff: Math.round(betaDiff * 100) / 100,
          isCompetitive: true,
          sameStatus: movieA.status === movieB.status,
        },
      };
    }
  }

  // Build ranking for boundary detection (sorted by beta descending)
  const ranked = [...candidates]
    .filter(m => m.totalComparisons > 0) // Only compared movies
    .sort((a, b) => b.beta - a.beta);

  // Create lookup: movieId -> { rank, upperGap, lowerGap }
  const rankInfo = new Map<string, { rank: number; upperGap: number; lowerGap: number }>();
  ranked.forEach((m, i) => {
    const upperGap = i > 0 ? ranked[i - 1].beta - m.beta : Infinity;
    const lowerGap = i < ranked.length - 1 ? m.beta - ranked[i + 1].beta : Infinity;
    rankInfo.set(m.id, { rank: i + 1, upperGap, lowerGap });
  });

  // Calculate base weights for all candidates (with genre affinity)
  const baseWeights = candidates.map(m =>
    calculateBaseWeight(m, session.totalComparisons, birthDecade, phase.undercomparedMult, genreAffinity)
  );

  // Select first movie (exploration-weighted)
  const movieAIndex = weightedRandomSelect(baseWeights);
  const movieA = candidates[movieAIndex];
  const movieARankInfo = rankInfo.get(movieA.id);

  // Build pool for second movie (exclude first and same-collection movies for Tier 1)
  const remainingCandidates = candidates.filter((m, i) =>
    i !== movieAIndex && !shouldAvoidSameCollectionPair(movieA, m)
  );

  // If all remaining candidates are from same collection, fall back to just excluding first
  const finalRemainingCandidates = remainingCandidates.length > 0
    ? remainingCandidates
    : candidates.filter((_, i) => i !== movieAIndex);

  const remainingBaseWeights = candidates
    .map((m, i) => ({ weight: baseWeights[i], include: finalRemainingCandidates.includes(m) }))
    .filter(x => x.include)
    .map(x => x.weight);

  // Weight second movie by beta proximity + boundary bonus
  const proximityWeights = finalRemainingCandidates.map((m, i) => {
    let weight = remainingBaseWeights[i];

    // Beta proximity bonus (Swiss-style) — scaled by phase
    const betaDiff = Math.abs(m.beta - movieA.beta);
    const proximityBonus = Math.exp(-BETA_PROXIMITY_DECAY * phase.betaSimilarityMult * betaDiff);
    weight *= proximityBonus;

    // Boundary targeting bonus: if movieA and m are adjacent in ranking with small gap
    if (movieARankInfo && m.totalComparisons > 0) {
      const mRankInfo = rankInfo.get(m.id);
      if (mRankInfo) {
        const rankDiff = Math.abs(movieARankInfo.rank - mRankInfo.rank);

        // Adjacent in ranking (rank difference of 1)
        if (rankDiff === 1) {
          // Check if this is an uncertain boundary
          const gap = betaDiff; // They're adjacent, so betaDiff IS the gap
          if (gap < BOUNDARY_GAP_THRESHOLD) {
            // Uncertain boundary - boost this pair (scaled by phase)
            let boundaryBonus = BOUNDARY_BONUS * phase.boundaryMult;

            // Extra bonus for top 10 boundaries
            const minRank = Math.min(movieARankInfo.rank, mRankInfo.rank);
            if (minRank <= 10) {
              boundaryBonus *= TOP_RANK_BONUS;
            }

            weight *= boundaryBonus;
          }
        }
      }
    }

    return weight;
  });

  const movieBIndex = weightedRandomSelect(proximityWeights);
  const movieB = finalRemainingCandidates[movieBIndex];

  const betaDiff = Math.abs(movieA.beta - movieB.beta);
  const isCompetitive = betaDiff <= COMPETITIVE_BETA_RANGE;

  // Check if this is a boundary pair
  const movieARank = rankInfo.get(movieA.id)?.rank;
  const movieBRank = rankInfo.get(movieB.id)?.rank;
  const isBoundaryPair = movieARank && movieBRank &&
    Math.abs(movieARank - movieBRank) === 1 &&
    betaDiff < BOUNDARY_GAP_THRESHOLD;

  // Build reason string
  let reason = customReason || '';
  if (!reason) {
    if (isBoundaryPair) {
      const boundaryRank = Math.min(movieARank!, movieBRank!);
      reason = `Boundary #${boundaryRank}/#${boundaryRank + 1}: Resolving close rankings (Δβ=${betaDiff.toFixed(2)})`;
    } else if (isCompetitive) {
      reason = `Swiss match: Close betas (Δβ=${betaDiff.toFixed(2)})`;
    } else {
      reason = `Swiss match: ${movieA.title} vs ${movieB.title}`;
    }

    // Add context about undercompared movies
    const aUnder = movieA.totalComparisons < UNDERCOMPARED_THRESHOLD;
    const bUnder = movieB.totalComparisons < UNDERCOMPARED_THRESHOLD;
    if (aUnder && bUnder) {
      reason += ' [both new]';
    } else if (aUnder) {
      reason += ` [${movieA.title} is new]`;
    } else if (bUnder) {
      reason += ` [${movieB.title} is new]`;
    }
  }

  return {
    movieA,
    movieB,
    reason,
    strategy: 'swiss',
    pairType: 'regular',
    quality: {
      betaDiff: Math.round(betaDiff * 100) / 100,
      isCompetitive: isCompetitive || !!isBoundaryPair,
      sameStatus: movieA.status === movieB.status,
    },
  };
}

/**
 * Calculate base selection weight for a movie
 *
 * Factors:
 * - Undercompared bonus (2x for <5 comparisons)
 * - Ranking-ready bonus (3x for exactly 1 comparison — one away from ranked)
 * - Convergence penalty (0.5x for 10+ comparisons)
 * - Freshness (higher weight if not shown recently)
 * - Formative years bonus (2.5x prime, 1.5x adjacent, penalty for distant)
 */
function calculateBaseWeight(
  movie: Movie,
  currentComparison: number,
  birthDecade: number | null,
  undercomparedMult: number = UNDERCOMPARED_BONUS,
  genreAffinity: Record<Genre, number> | null = null
): number {
  let weight = 1.0;

  // Undercompared bonus: prioritize movies needing more data (phase-scaled)
  if (movie.totalComparisons < UNDERCOMPARED_THRESHOLD) {
    weight *= undercomparedMult;
  }

  // Ranking-ready bonus: movies with exactly 1 comparison are one away from
  // entering the rankings. Extra weight so they get their second comparison fast.
  if (movie.totalComparisons === 1) {
    weight *= RANKING_READY_BONUS;
  }

  // Convergence penalty: deprioritize well-established movies
  if (movie.totalComparisons >= CONVERGED_THRESHOLD) {
    weight *= CONVERGED_PENALTY;
  }

  // Freshness: prefer movies not shown recently
  const comparisonsSinceShown = currentComparison - movie.lastShownAt;
  const freshness = 1 - Math.exp(-FRESHNESS_DECAY * comparisonsSinceShown);
  weight *= (0.3 + 0.7 * freshness); // Min 30% weight even if just shown

  // Era-based weighting: bonus for prime years, penalty for distant eras
  if (birthDecade) {
    const formativeStart = birthDecade + 15; // Age 15
    const formativeEnd = birthDecade + 30;   // Age 30
    const adjacentStart = formativeStart - ADJACENT_YEARS_RANGE;
    const adjacentEnd = formativeEnd + ADJACENT_YEARS_RANGE;

    if (movie.year >= formativeStart && movie.year <= formativeEnd) {
      // Prime years: strong bonus (must compete with undercompared 2x bonus)
      weight *= 2.5;
    } else if (movie.year >= adjacentStart && movie.year <= adjacentEnd) {
      // Adjacent years: moderate bonus
      weight *= 1.5;
    } else {
      // Outside era: penalty based on distance
      const distanceFromEra = Math.min(
        Math.abs(movie.year - adjacentStart),
        Math.abs(movie.year - adjacentEnd)
      );
      // 15% penalty per decade outside adjacent era, max 60% penalty
      const eraPenalty = Math.max(0.4, 1 - (distanceFromEra / 65));
      weight *= eraPenalty;
    }
  }

  // Genre affinity boost: movies matching preferred genres get up to 1.8x
  if (genreAffinity && movie.genres.length > 0) {
    const maxAffinity = Math.max(...movie.genres.map(g => genreAffinity[g] || 0));
    weight *= 1.0 + maxAffinity * GENRE_AFFINITY_MAX_BOOST;
  }

  // Small random factor to prevent deterministic patterns
  weight *= (0.9 + 0.2 * Math.random());

  return Math.max(0.01, weight);
}

/**
 * Fallback pair selection (random)
 */
function selectFallbackPair(movies: Movie[], reason: string): PairSelectionResult {
  const shuffled = [...movies].sort(() => Math.random() - 0.5);
  const movieA = shuffled[0];
  const movieB = shuffled[1];
  const betaDiff = Math.abs(movieA.beta - movieB.beta);

  return {
    movieA,
    movieB,
    reason: `Fallback: ${reason}`,
    strategy: 'fallback',
    pairType: 'regular',
    quality: {
      betaDiff: Math.round(betaDiff * 100) / 100,
      isCompetitive: betaDiff <= COMPETITIVE_BETA_RANGE,
      sameStatus: movieA.status === movieB.status,
    },
  };
}

/**
 * Weighted random selection helper
 */
function weightedRandomSelect(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * total;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }

  return weights.length - 1;
}

// ============================================
// ASYNC SELECTION WITH DISCOVERY
// ============================================

/**
 * Check if we should attempt a discovery pair
 */
function shouldTryDiscovery(session: UserSession): boolean {
  // Need minimum comparisons first
  if (session.totalComparisons < MIN_COMPARISONS_FOR_DISCOVERY) {
    return false;
  }

  // Every 5th comparison after reaching threshold
  return session.consecutiveRegularPairs >= DISCOVERY_INTERVAL - 1;
}

/**
 * Async pair selection with discovery integration
 *
 * Priority order:
 * 1. Deferred discovery (if discovery was skipped due to consecutive skips)
 * 2. Known pair (if 3+ consecutive skips - defer discovery if it was due)
 * 3. Discovery (every 5th comparison after 20+ total)
 * 4. Bespoke pools selection (era-based + tier-based blend)
 */
export async function selectPairAsync(
  movies: Movie[],
  session: UserSession,
  vibes?: Vibes,
  userId?: string,
  birthDecade: number | null = null,
  postOnboardingComparisons: number = 0,
  primeYearsStart: number | null = null,
  primeYearsEnd: number | null = null,
  rankedMovies: Movie[] = []
): Promise<PairSelectionResult | null> {
  // Check for deferred discovery first (discovery was skipped due to consecutive skips)
  if (session.deferredDiscovery && userId) {
    log.info(' Attempting deferred discovery pair...');
    try {
      const discoveryResult = await attemptDiscoveryPair(movies, userId);
      if (discoveryResult) {
        return discoveryResult;
      }
      log.info(' Deferred discovery failed, using Swiss selection');
    } catch (error) {
      log.error(' Deferred discovery error:', error);
    }
  }

  // Check for consecutive skips - show known pair instead
  if (session.consecutiveSkips >= CONSECUTIVE_SKIPS_THRESHOLD) {
    const knownPair = selectKnownPair(movies, session);
    if (knownPair) {
      console.log(`[PairSelector] Showing known pair after ${session.consecutiveSkips} skips`);
      return knownPair;
    }
  }

  // Check for discovery pair
  if (userId && shouldTryDiscovery(session)) {
    console.log(`[PairSelector] Attempting discovery pair (${session.consecutiveRegularPairs + 1} regular since last)...`);

    try {
      const discoveryResult = await attemptDiscoveryPair(movies, userId);
      if (discoveryResult) {
        return discoveryResult;
      }
      log.info(' Discovery failed, using Swiss selection');
    } catch (error) {
      log.error(' Discovery error:', error);
    }
  }

  // Fall back to regular bespoke pools selection
  return selectPair(movies, session, vibes, birthDecade, postOnboardingComparisons, primeYearsStart, primeYearsEnd, undefined, rankedMovies);
}

/**
 * Attempt to generate a discovery pair from similar users
 */
async function attemptDiscoveryPair(
  movies: Movie[],
  userId: string
): Promise<PairSelectionResult | null> {
  // Get ranked movies for opponent selection
  const rankedMovies = movies
    .filter(m => m.status === 'known' && m.totalComparisons > 0)
    .sort((a, b) => b.beta - a.beta);

  if (rankedMovies.length < 5) {
    // Not enough ranked movies for meaningful discovery
    return null;
  }

  const allMoviesMap = new Map(movies.map(m => [m.id, m]));

  // Try to generate discovery pair
  const discoveryPair = await discoveryService.generateDiscoveryPair(
    userId,
    rankedMovies,
    allMoviesMap
  );

  if (!discoveryPair) {
    return null;
  }

  const discoveryMovie = allMoviesMap.get(discoveryPair.discoveryMovie.movieId);
  if (!discoveryMovie) {
    return null;
  }

  const opponent = discoveryPair.opponentMovie;
  const betaDiff = Math.abs(discoveryMovie.beta - opponent.beta);
  const matchPercent = Math.round(discoveryPair.discoveryMovie.recommendedBy.rSquared * 100);

  console.log(`[PairSelector] Discovery: "${discoveryMovie.title}" (from ${discoveryPair.discoveryMovie.recommendedBy.displayName}, ${matchPercent}% match) vs "${opponent.title}"`);

  return {
    movieA: discoveryMovie,
    movieB: opponent,
    reason: `Discovery: Loved by your ${matchPercent}% taste match`,
    strategy: 'discovery_similar_users',
    pairType: 'discovery_similar_users',
    quality: {
      betaDiff: Math.round(betaDiff * 100) / 100,
      isCompetitive: true, // Discovery pairs are designed to be informative
      sameStatus: false,
    },
    discoveryInfo: {
      discoveryMovieId: discoveryMovie.id,
      recommendedBy: discoveryPair.discoveryMovie.recommendedBy,
    },
  };
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Create initial session state
 */
export function createSession(): UserSession {
  return {
    totalComparisons: 0,
    consecutiveSkips: 0,
    consecutiveRegularPairs: 0,
    recentlyShownIds: [],
    lastComparisonTime: Date.now(),
    deferredDiscovery: false,
  };
}

/**
 * Update session after a comparison
 */
export function updateSession(
  session: UserSession,
  movieAId: string,
  movieBId: string,
  skipped: boolean
): UserSession {
  // Keep a larger buffer of recently shown movies to prevent quick repeats
  const newRecentlyShown = [...session.recentlyShownIds, movieAId, movieBId];
  // Limit to buffer size
  const trimmedRecent = newRecentlyShown.length > RECENTLY_SHOWN_BUFFER
    ? newRecentlyShown.slice(-RECENTLY_SHOWN_BUFFER)
    : newRecentlyShown;

  return {
    totalComparisons: session.totalComparisons + 1,
    consecutiveSkips: skipped ? session.consecutiveSkips + 1 : 0,
    consecutiveRegularPairs: session.consecutiveRegularPairs + 1,
    recentlyShownIds: trimmedRecent,
    lastComparisonTime: Date.now(),
    deferredDiscovery: session.deferredDiscovery,
  };
}

/**
 * Update session with pair type tracking (for discovery reset)
 */
export function updateSessionWithPairType(
  session: UserSession,
  movieAId: string,
  movieBId: string,
  skipped: boolean,
  pairType: PairType
): UserSession {
  const isDiscovery = pairType === 'discovery_similar_users';
  const isKnownPair = pairType === 'known_pair';

  // Check if discovery was due when known pair was shown (to defer it)
  const discoveryWasDue = session.consecutiveRegularPairs >= DISCOVERY_INTERVAL - 1 &&
    session.totalComparisons >= MIN_COMPARISONS_FOR_DISCOVERY;

  // Set deferredDiscovery if:
  // - Known pair was shown AND discovery was due
  // Clear deferredDiscovery if:
  // - Discovery pair was shown (either regular or deferred)
  let newDeferredDiscovery = session.deferredDiscovery;
  if (isKnownPair && discoveryWasDue) {
    newDeferredDiscovery = true;
  } else if (isDiscovery) {
    newDeferredDiscovery = false;
  }

  return {
    totalComparisons: session.totalComparisons + 1,
    consecutiveSkips: skipped ? session.consecutiveSkips + 1 : 0,
    // Reset counter after discovery, increment after regular/known
    consecutiveRegularPairs: isDiscovery ? 0 : session.consecutiveRegularPairs + 1,
    recentlyShownIds: [...session.recentlyShownIds, movieAId, movieBId].slice(-RECENTLY_SHOWN_BUFFER),
    lastComparisonTime: Date.now(),
    deferredDiscovery: newDeferredDiscovery,
  };
}

// ============================================
// DEBUG UTILITIES
// ============================================

/**
 * Explain why a pair was selected
 */
export function explainSelection(result: PairSelectionResult): string {
  const { movieA, movieB, strategy, quality, reason } = result;

  return `
=== Pair Selection ===
Strategy: ${strategy.toUpperCase()}
Reason: ${reason}

Movie A: ${movieA.title} (${movieA.year})
  - Status: ${movieA.status}
  - Beta: ${movieA.beta.toFixed(2)}
  - Comparisons: ${movieA.totalComparisons}

Movie B: ${movieB.title} (${movieB.year})
  - Status: ${movieB.status}
  - Beta: ${movieB.beta.toFixed(2)}
  - Comparisons: ${movieB.totalComparisons}

Quality:
  - Beta Difference: ${quality.betaDiff}
  - Competitive: ${quality.isCompetitive ? 'YES' : 'NO'}
  - Same Status: ${quality.sameStatus ? 'YES' : 'NO'}
`.trim();
}

/**
 * Get pool statistics for debugging
 */
export function getPoolStats(movies: Movie[], session: UserSession): {
  total: number;
  eligible: number;
  undercompared: number;
  converged: number;
  byStatus: Record<MovieStatus, number>;
} {
  const recentIds = new Set(session.recentlyShownIds.slice(-RECENTLY_SHOWN_BUFFER));
  const eligible = movies.filter(m => m.status !== 'unknown' && !recentIds.has(m.id));

  return {
    total: movies.length,
    eligible: eligible.length,
    undercompared: eligible.filter(m => m.totalComparisons < UNDERCOMPARED_THRESHOLD).length,
    converged: eligible.filter(m => m.totalComparisons >= CONVERGED_THRESHOLD).length,
    byStatus: {
      known: movies.filter(m => m.status === 'known').length,
      uncertain: movies.filter(m => m.status === 'uncertain').length,
      uncompared: movies.filter(m => m.status === 'uncompared').length,
      unknown: movies.filter(m => m.status === 'unknown').length,
    },
  };
}
