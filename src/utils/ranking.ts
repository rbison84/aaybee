/**
 * Ranking algorithm utilities
 * Pure functions for beta/ELO calculations
 */

// Constants
export const INITIAL_BETA = 0;
export const K_BASE = 0.5;
export const K_FLOOR = 0.35;
export const K_DECAY = 0.05;

/**
 * Adaptive K-factor: decreases as movie gets more comparisons
 * - Early: High K (0.625) for quick positioning
 * - Late: Low K (0.125) for stability, but never zero
 */
export function getAdaptiveK(movieComparisons: number): number {
  const decay = Math.exp(-K_DECAY * movieComparisons);
  return K_BASE * (decay + K_FLOOR);
}

/**
 * Calculate expected probability of A winning
 * Based on Bradley-Terry model
 */
export function calculateExpectedScore(betaA: number, betaB: number): number {
  return 1 / (1 + Math.exp(betaB - betaA));
}

/**
 * Calculate new beta values after a comparison
 * Returns [newBetaA, newBetaB]
 */
export function calculateBetaUpdate(
  betaA: number,
  betaB: number,
  aWon: boolean,
  kA: number,
  kB: number
): [number, number] {
  const expectedA = calculateExpectedScore(betaA, betaB);
  const actualA = aWon ? 1 : 0;

  const newBetaA = betaA + kA * (actualA - expectedA);
  const newBetaB = betaB + kB * ((1 - actualA) - (1 - expectedA));

  // Clamp to [-4, 4] range
  return [
    Math.max(-4, Math.min(4, newBetaA)),
    Math.max(-4, Math.min(4, newBetaB)),
  ];
}

/**
 * Calculate weighted score for movie ranking
 * Used for curating the movie list
 */
export function calculateWeightedScore(rating: number, voteCount: number): number {
  if (voteCount <= 0) return 0;
  return rating * Math.log10(voteCount);
}

/**
 * Determine tier based on position in ranked list
 * Tier 1: 1-100, Tier 2: 101-175, Tier 3: 176-275, Tier 4: 276+
 */
export function getTierFromPosition(position: number): 1 | 2 | 3 | 4 {
  if (position < 100) return 1;
  if (position < 175) return 2;
  if (position < 275) return 3;
  return 4;
}
