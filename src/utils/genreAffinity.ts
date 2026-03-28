import { Movie, Genre } from '../types';

// Genre affinity constants
export const GENRE_AFFINITY_MAX_BOOST = 2.0; // Max 3.0x multiplier for perfect genre match

// Vibes type (matches store's preferences.vibes)
export type Vibes = {
  tone: 'light' | 'heavy' | null;
  entertainment: 'laughs' | 'thrills' | null;
  pacing: 'slow' | 'fast' | null;
};

// Vibe-to-genre mapping (single source of truth)
export const VIBE_GENRE_MAP: {
  tone: { light: Genre[]; heavy: Genre[] };
  entertainment: { laughs: Genre[]; thrills: Genre[] };
  pacing: { slow: Genre[]; fast: Genre[] };
} = {
  tone: {
    light: ['comedy', 'animation', 'romance', 'adventure', 'fantasy'],
    heavy: ['drama', 'thriller', 'horror', 'scifi'],
  },
  entertainment: {
    laughs: ['comedy', 'animation'],
    thrills: ['action', 'thriller', 'horror', 'adventure'],
  },
  pacing: {
    slow: ['drama', 'romance'],
    fast: ['action', 'adventure', 'thriller', 'scifi'],
  },
};

/**
 * Compute genre affinity scores blending vibes (cold-start) with revealed preference (warm signal).
 *
 * Vibe signal: count how many vibe dimensions mention each genre (0–3), normalize to 0–1.
 * Revealed signal: genre frequency in top-N ranked movies, normalized to 0–1.
 * Blend shifts from vibes-dominant to revealed-preference-dominant as comparisons increase.
 */
export function computeGenreAffinity(
  vibes: Vibes | undefined,
  rankedMovies: Movie[],
  postOnboardingComparisons: number
): Record<Genre, number> | null {
  const allGenres: Genre[] = ['action', 'comedy', 'drama', 'scifi', 'romance', 'thriller', 'animation', 'horror', 'adventure', 'fantasy'];

  const hasVibes = vibes && (vibes.tone || vibes.entertainment || vibes.pacing);
  const hasRanked = rankedMovies.length > 0;

  if (!hasVibes && !hasRanked) return null;

  // --- Vibe signal ---
  const vibeCounts: Record<Genre, number> = {} as Record<Genre, number>;
  for (const g of allGenres) vibeCounts[g] = 0;

  if (vibes) {
    if (vibes.tone) {
      for (const g of VIBE_GENRE_MAP.tone[vibes.tone]) vibeCounts[g]++;
    }
    if (vibes.entertainment) {
      for (const g of VIBE_GENRE_MAP.entertainment[vibes.entertainment]) vibeCounts[g]++;
    }
    if (vibes.pacing) {
      for (const g of VIBE_GENRE_MAP.pacing[vibes.pacing]) vibeCounts[g]++;
    }
  }

  const activeDimensions = (vibes ? [vibes.tone, vibes.entertainment, vibes.pacing].filter(v => v !== null).length : 0) || 1;
  const vibeScores: Record<Genre, number> = {} as Record<Genre, number>;
  for (const g of allGenres) vibeScores[g] = vibeCounts[g] / activeDimensions;

  // --- Revealed signal ---
  const topN = rankedMovies.slice(0, Math.min(20, rankedMovies.length));
  const genreFreq: Record<Genre, number> = {} as Record<Genre, number>;
  for (const g of allGenres) genreFreq[g] = 0;

  for (const movie of topN) {
    for (const g of movie.genres) genreFreq[g]++;
  }

  const maxFreq = Math.max(1, ...Object.values(genreFreq));
  const revealedScores: Record<Genre, number> = {} as Record<Genre, number>;
  for (const g of allGenres) revealedScores[g] = genreFreq[g] / maxFreq;

  // --- Blend ---
  const vibeWeight = Math.max(0, 1 - postOnboardingComparisons / 250);
  const affinity: Record<Genre, number> = {} as Record<Genre, number>;
  for (const g of allGenres) {
    affinity[g] = vibeWeight * vibeScores[g] + (1 - vibeWeight) * revealedScores[g];
  }

  return affinity;
}
