import { Movie, MovieStatus } from '../types';

/**
 * Matchmaking Utilities
 *
 * Helper functions for movie weight calculations and matchup quality assessment.
 * Main pair selection logic is in pairSelector.ts
 */

// ============================================
// WEIGHT CALCULATION (for external use)
// ============================================

// Status multipliers - how likely to show each status
const STATUS_MULTIPLIERS: Record<MovieStatus, number> = {
  uncompared: 1.0,  // Full weight - we need initial data
  known: 1.0,       // Full weight - good comparison data
  uncertain: 0.6,   // 60% weight - give another chance
  unknown: 0.2,     // 20% weight - rarely show unfamiliar movies
};

// Freshness decay rate
const FRESHNESS_DECAY = 0.05;

// Usage penalty rate
const USAGE_PENALTY_RATE = 0.1;

// Formative years bonus
const FORMATIVE_YEARS_BONUS = 1.5;

// Exploration factor
const EPSILON = 0.15;

/**
 * Calculate the user's formative movie years based on birth decade
 */
function getFormativeYearRange(birthDecade: number | null): { start: number; end: number } | null {
  if (!birthDecade) return null;
  const birthYear = birthDecade + 5;
  return {
    start: birthYear + 10,
    end: birthYear + 25,
  };
}

/**
 * Calculate selection weight for a single movie
 * Used by external systems that need movie weights
 */
export function calculateMovieWeight(
  movie: Movie,
  currentComparisonNumber: number,
  birthDecade: number | null = null
): number {
  // 1. Strength Weight
  const strengthWeight = Math.exp(movie.beta);

  // 2. Freshness Weight
  const comparisonsSinceShown = currentComparisonNumber - movie.lastShownAt;
  const freshnessWeight = 1 - Math.exp(-FRESHNESS_DECAY * comparisonsSinceShown);

  // 3. Usage Penalty
  const usagePenalty = Math.exp(-USAGE_PENALTY_RATE * movie.timesShown);

  // 4. Status Multiplier
  const statusMultiplier = STATUS_MULTIPLIERS[movie.status];

  // 5. Formative Years Bonus
  let formativeBonus = 1.0;
  const formativeRange = getFormativeYearRange(birthDecade);
  if (formativeRange && movie.year >= formativeRange.start && movie.year <= formativeRange.end) {
    formativeBonus = FORMATIVE_YEARS_BONUS;
  }

  // 6. Base Weight
  const baseWeight = strengthWeight * freshnessWeight * usagePenalty * statusMultiplier * formativeBonus;

  // 7. Exploration Bonus
  const explorationBonus = Math.random();
  const finalWeight = (1 - EPSILON) * baseWeight + EPSILON * explorationBonus;

  return Math.max(0.001, finalWeight);
}

/**
 * Calculate weight breakdown for debugging
 */
export function getWeightBreakdown(
  movie: Movie,
  currentComparisonNumber: number
): {
  strengthWeight: number;
  freshnessWeight: number;
  usagePenalty: number;
  statusMultiplier: number;
  baseWeight: number;
  finalWeight: number;
} {
  const strengthWeight = Math.exp(movie.beta);
  const comparisonsSinceShown = currentComparisonNumber - movie.lastShownAt;
  const freshnessWeight = 1 - Math.exp(-FRESHNESS_DECAY * comparisonsSinceShown);
  const usagePenalty = Math.exp(-USAGE_PENALTY_RATE * movie.timesShown);
  const statusMultiplier = STATUS_MULTIPLIERS[movie.status];
  const baseWeight = strengthWeight * freshnessWeight * usagePenalty * statusMultiplier;
  const finalWeight = (1 - EPSILON) * baseWeight + EPSILON * Math.random();

  return {
    strengthWeight: Math.round(strengthWeight * 1000) / 1000,
    freshnessWeight: Math.round(freshnessWeight * 1000) / 1000,
    usagePenalty: Math.round(usagePenalty * 1000) / 1000,
    statusMultiplier,
    baseWeight: Math.round(baseWeight * 1000) / 1000,
    finalWeight: Math.round(finalWeight * 1000) / 1000,
  };
}

// ============================================
// MATCHUP QUALITY
// ============================================

/**
 * Get matchup quality score (for debugging/display)
 */
export function getMatchupQuality(movieA: Movie, movieB: Movie): {
  score: number;
  competitiveness: number;
  diversity: number;
  reasoning: string;
} {
  // Competitiveness: how close are their betas?
  const betaDiff = Math.abs(movieA.beta - movieB.beta);
  const competitiveness = Math.exp(-0.3 * betaDiff);

  // Diversity: are they from different genres?
  const sharedGenres = movieA.genres.filter(g => movieB.genres.includes(g)).length;
  const totalGenres = new Set([...movieA.genres, ...movieB.genres]).size;
  const diversity = totalGenres > 0 ? 1 - (sharedGenres / totalGenres) : 0;

  // Combined score
  const score = (competitiveness * 0.7) + (diversity * 0.3);

  // Reasoning
  let reasoning = '';
  if (competitiveness > 0.8) {
    reasoning = 'Very close matchup! ';
  } else if (competitiveness > 0.5) {
    reasoning = 'Competitive matchup. ';
  } else {
    reasoning = 'Mismatch (one is clearly stronger). ';
  }

  if (diversity > 0.7) {
    reasoning += 'Different genres - interesting choice!';
  } else if (diversity > 0.3) {
    reasoning += 'Some genre overlap.';
  } else {
    reasoning += 'Same genre - direct comparison.';
  }

  return {
    score: Math.round(score * 100) / 100,
    competitiveness: Math.round(competitiveness * 100) / 100,
    diversity: Math.round(diversity * 100) / 100,
    reasoning,
  };
}

// ============================================
// STARTER MOVIES
// ============================================

/**
 * Get starter movies for first-time users
 */
export function getStarterMovies(movies: Movie[], count: number = 20): Movie[] {
  return [...movies]
    .filter(m => m.status === 'uncompared')
    .sort((a, b) => {
      // Prefer 1990s-2010s movies (most recognizable)
      const aDecadeScore = a.year >= 1990 && a.year <= 2019 ? 1 : 0;
      const bDecadeScore = b.year >= 1990 && b.year <= 2019 ? 1 : 0;
      if (aDecadeScore !== bDecadeScore) return bDecadeScore - aDecadeScore;

      // Then by number of genres
      return b.genres.length - a.genres.length;
    })
    .slice(0, count);
}

// ============================================
// DEBUG
// ============================================

/**
 * Debug: Print weight distribution
 */
export function debugWeightDistribution(
  movies: Movie[],
  currentComparisonNumber: number
): void {
  const movieWeights = movies.map(m => ({
    title: m.title,
    ...getWeightBreakdown(m, currentComparisonNumber),
    status: m.status,
    beta: m.beta.toFixed(2),
    timesShown: m.timesShown,
  }));

  movieWeights.sort((a, b) => b.finalWeight - a.finalWeight);

  console.log('=== Weight Distribution ===');
  console.table(movieWeights.slice(0, 10));
}
