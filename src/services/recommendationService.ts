import { supabase } from './supabase';
import { calculateSmartCorrelation, calculateCorrelationFromData, SmartCorrelationResult } from '../utils/correlationUtils';
import { getDismissedMovieIds } from './database';
import { VIBE_GENRE_MAP } from '../utils/genreAffinity';

// ============================================
// TYPES
// ============================================

export interface UserSimilarity {
  userId: string;
  displayName: string | null;
  rSquared: number;
  correlation: number;
  overlapCount: number;
  totalComparisons: number;
  expandedToTop25?: boolean;
}

export interface SimilarityResult {
  rSquared: number;
  correlation: number;
  overlapCount: number;
  overlappingMovies: Array<{
    movieId: string;
    betaA: number;
    betaB: number;
  }>;
}

export interface MovieRecommendation {
  movieId: string;
  title: string;
  year: number;
  posterUrl: string | null;
  genres?: string[];
  recommendedBy: {
    userId: string;
    displayName: string | null;
    similarity: number;
    theirBeta: number;
    theirRank: number;
  };
  score: number;
  reason: string;
  sharedHighRatedMovies: string[];
  recommendedByMultiple: boolean;
}

export interface RecommendationsResult {
  recommendations: MovieRecommendation[];
  similarUsersCount: number;
  bestMatch: UserSimilarity | null;
  message: string;
}

interface UserMovieData {
  movie_id: string;
  beta: number;
  status: string;
  total_comparisons: number;
}

// ============================================
// CONSTANTS
// ============================================

const MIN_OVERLAP_FOR_CORRELATION = 5;
const MIN_SIMILARITY_THRESHOLD = 0.25; // 50% match minimum (r² = 0.25 means r = 0.5)
const MIN_COMPARISONS_FOR_SIMILARITY = 10;
const HIGH_BETA_THRESHOLD = 0.0; // Beta > 0 means above average

// Childhood movie deprioritization for content-based phase.
// Animation + G/PG = likely childhood movie. Adults who didn't watch these
// as kids rarely seek them out, so we soft-penalize in pre-CF recommendations.
// CF phase removes this penalty since it's based on real taste similarity.
const CHILDHOOD_PENALTY = 0.3;

function isChildhoodMovie(genres?: string[], certification?: string | null): boolean {
  if (!genres?.includes('animation')) return false;
  if (!certification) return false;
  const cert = certification.toUpperCase();
  return cert === 'G' || cert === 'PG';
}

// VIBE_GENRE_MAP imported from ../utils/genreAffinity

// ============================================
// CONTENT-BASED FILTERING TYPES
// ============================================

export function getEffectiveTier(totalComparisons: number, poolUnlockedTier?: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  const compTier = totalComparisons >= 750 ? 4 : totalComparisons >= 400 ? 3 : totalComparisons >= 200 ? 2 : 1;
  return Math.max(compTier, poolUnlockedTier || 1) as 1 | 2 | 3 | 4;
}

export interface ContentBasedPreferences {
  genreScores: Record<string, number>;
  moviePrimeStart: number | null;
  moviePrimeEnd: number | null;
  vibes?: {
    tone: 'light' | 'heavy' | null;
    entertainment: 'laughs' | 'thrills' | null;
    pacing: 'slow' | 'fast' | null;
  };
  maxTier?: 1 | 2 | 3 | 4;
}

// ============================================
// CONTENT-BASED SCORING HELPERS
// ============================================

/**
 * Derive genre weights from user's actual ranked movies.
 * Each top movie contributes its beta to its genres, giving us a signal
 * of what genres the user actually likes based on comparison outcomes.
 */
async function deriveLearnedGenreScores(
  userId: string
): Promise<{ learnedScores: Record<string, number>; rankedCount: number }> {
  // Get user's top-rated movies (positive beta = above average)
  const { data: topMovies, error: userError } = await supabase
    .from('user_movies')
    .select('movie_id, beta')
    .eq('user_id', userId)
    .eq('status', 'known')
    .gt('beta', 0)
    .order('beta', { ascending: false })
    .limit(30);

  if (userError || !topMovies || topMovies.length === 0) {
    return { learnedScores: {}, rankedCount: 0 };
  }

  // Fetch genres for these movies (could be parallelized with the above query,
  // but we need movie_ids from the first result)
  const movieIds = topMovies.map(m => m.movie_id);
  const { data: movieDetails, error: moviesError } = await supabase
    .from('movies')
    .select('id, genres')
    .in('id', movieIds);

  if (moviesError || !movieDetails) {
    return { learnedScores: {}, rankedCount: 0 };
  }

  const genreMap = new Map(movieDetails.map(m => [m.id, m.genres || []]));

  // Accumulate beta-weighted genre scores
  const learnedScores: Record<string, number> = {};
  for (const movie of topMovies) {
    const genres = genreMap.get(movie.movie_id) || [];
    for (const genre of genres) {
      learnedScores[genre] = (learnedScores[genre] || 0) + movie.beta;
    }
  }

  return { learnedScores, rankedCount: topMovies.length };
}

/**
 * Blend onboarding genre scores with learned scores from comparisons.
 * As the user makes more comparisons, learned scores dominate.
 */
function blendGenreScores(
  onboardingScores: Record<string, number>,
  learnedScores: Record<string, number>,
  rankedCount: number
): Record<string, number> {
  // Learned weight ramps from 0 to 1 over first 15 ranked movies
  const learnedWeight = Math.min(rankedCount / 15, 1.0);
  const onboardingWeight = 1.0 - learnedWeight;

  // Normalize learned scores to 0-1 range
  const maxLearned = Math.max(...Object.values(learnedScores), 1);

  // Collect all genre keys
  const allGenres = new Set([
    ...Object.keys(onboardingScores),
    ...Object.keys(learnedScores),
  ]);

  // Normalize onboarding scores to 0-1 range
  const maxOnboarding = Math.max(...Object.values(onboardingScores), 1);

  const blended: Record<string, number> = {};
  for (const genre of allGenres) {
    const onboardingNorm = (onboardingScores[genre] || 0) / maxOnboarding;
    const learnedNorm = (learnedScores[genre] || 0) / maxLearned;
    blended[genre] = onboardingWeight * onboardingNorm + learnedWeight * learnedNorm;
  }

  return blended;
}

function calculateContentScore(
  movie: { genres?: string[]; year: number; vote_average?: number },
  preferences: ContentBasedPreferences
): { score: number; genreMatch: number; eraMatch: number; vibeMatch: number } {
  const genres = movie.genres || [];

  // Genre match (0-1)
  let genreMatch = 0.5;
  if (genres.length > 0 && Object.keys(preferences.genreScores).length > 0) {
    const maxGenreScore = Math.max(...Object.values(preferences.genreScores), 1);
    let genreSum = 0;
    for (const g of genres) {
      genreSum += preferences.genreScores[g] || 0;
    }
    genreMatch = Math.max(0, Math.min(1, genreSum / (maxGenreScore * genres.length)));
  }

  // Era match (0-1)
  let eraMatch = 0.5;
  if (preferences.moviePrimeStart != null && preferences.moviePrimeEnd != null) {
    const year = movie.year;
    if (year >= preferences.moviePrimeStart && year <= preferences.moviePrimeEnd) {
      eraMatch = 1.0;
    } else {
      const distanceOutside = year < preferences.moviePrimeStart
        ? preferences.moviePrimeStart - year
        : year - preferences.moviePrimeEnd;
      eraMatch = Math.max(0, 1.0 - distanceOutside * 0.05);
    }
  }

  // Vibe match (0-1)
  let vibeMatch = 0.5;
  if (preferences.vibes) {
    const dimensions = ['tone', 'entertainment', 'pacing'] as const;
    let activeCount = 0;
    let matchCount = 0;

    for (const dim of dimensions) {
      const value = preferences.vibes[dim];
      if (value) {
        activeCount++;
        const mappedGenres = (VIBE_GENRE_MAP[dim] as Record<string, string[]>)?.[value] || [];
        const hasMatch = genres.some(g => mappedGenres.includes(g));
        if (hasMatch) matchCount++;
      }
    }

    if (activeCount > 0) {
      vibeMatch = matchCount / activeCount;
    }
  }

  // Combined score
  const combined = 0.50 * genreMatch + 0.25 * eraMatch + 0.25 * vibeMatch;

  // Quality floor: blend with vote_average
  const voteNorm = (movie.vote_average || 5) / 10;
  const score = combined * 0.8 + voteNorm * 0.2;

  return { score, genreMatch, eraMatch, vibeMatch };
}

function generateContentReason(
  genreMatch: number,
  eraMatch: number,
  vibeMatch: number,
  movieGenres?: string[]
): string {
  // Pick dominant signal
  if (genreMatch > 0.6 && genreMatch >= eraMatch && genreMatch >= vibeMatch) {
    const topGenre = movieGenres?.[0];
    if (topGenre) {
      return `Matches your love of ${topGenre}`;
    }
    return 'Matches your genre preferences';
  }

  if (eraMatch > 0.8 && eraMatch >= genreMatch && eraMatch >= vibeMatch) {
    return 'From your prime movie years';
  }

  if (vibeMatch > 0.6 && vibeMatch >= genreMatch && vibeMatch >= eraMatch) {
    return 'Fits your vibe preferences';
  }

  return 'Picked for your taste profile';
}

// ============================================
// RECOMMENDATION SERVICE
// ============================================

// ============================================
// CF SIMILARITY CACHE
// ============================================

const similarityCache = new Map<string, {
  similarities: UserSimilarity[];
  timestamp: number;
  comparisonCount: number;
}>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_COMP_THRESHOLD = 5;

function groupAndLimit(
  rows: { user_id: string; movie_id: string; beta: number }[],
  limit: number
): Map<string, { movie_id: string; beta: number }[]> {
  const grouped = new Map<string, { movie_id: string; beta: number }[]>();
  for (const row of rows) {
    let arr = grouped.get(row.user_id);
    if (!arr) {
      arr = [];
      grouped.set(row.user_id, arr);
    }
    // Rows are pre-sorted by beta DESC from the query; just take first `limit`
    if (arr.length < limit) {
      arr.push({ movie_id: row.movie_id, beta: row.beta });
    }
  }
  return grouped;
}

export const recommendationService = {
  /**
   * Calculate R² correlation between two users
   * Uses SMART correlation: only top 15 movies with weighted ranks
   * Returns null if insufficient overlap or data
   */
  calculateUserSimilarity: async (
    userAId: string,
    userBId: string
  ): Promise<SimilarityResult | null> => {
    try {
      // Use the new smart correlation (top 15, weighted)
      const smartResult = await calculateSmartCorrelation(userAId, userBId);

      if (!smartResult) {
        return null;
      }

      // Convert to the expected format
      return {
        rSquared: smartResult.rSquared,
        correlation: smartResult.correlation,
        overlapCount: smartResult.overlapCount,
        overlappingMovies: smartResult.overlappingMovies.map(m => ({
          movieId: m.movieId,
          betaA: m.betaA,
          betaB: m.betaB,
        })),
      };
    } catch (error) {
      console.error('[Recommendations] Error calculating similarity:', error);
      return null;
    }
  },

  /**
   * Find users with similar taste to the given user
   * Uses batch queries (2 instead of 2N) + 30-min TTL cache
   */
  findSimilarUsers: async (
    userId: string,
    limit = 10,
    forceRefresh = false
  ): Promise<UserSimilarity[]> => {
    try {
      // Get all other users who have enough comparisons
      const { data: otherUsers, error } = await supabase
        .from('user_profiles')
        .select('id, display_name, total_comparisons')
        .neq('id', userId)
        .gte('total_comparisons', MIN_COMPARISONS_FOR_SIMILARITY);

      if (error) {
        console.error('[Recommendations] Failed to fetch users:', error);
        return [];
      }

      if (!otherUsers?.length) {
        console.log('[Recommendations] No other users with enough comparisons');
        return [];
      }

      // Get current user's profile for cache invalidation
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('total_comparisons')
        .eq('id', userId)
        .single();

      const currentCompCount = userProfile?.total_comparisons || 0;

      // Check cache
      const cached = similarityCache.get(userId);
      if (
        !forceRefresh &&
        cached &&
        Date.now() - cached.timestamp < CACHE_TTL &&
        currentCompCount - cached.comparisonCount < CACHE_COMP_THRESHOLD
      ) {
        console.log(`[Recommendations] Using cached similarities (${cached.similarities.length} users, age=${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
        return cached.similarities.slice(0, limit);
      }

      console.log(`[Recommendations] Computing similarities with ${otherUsers.length} users (batched)...`);

      // 1. Fetch current user's top-25 movies (1 query)
      // Require 2+ comparisons to filter out noisy single-comparison betas
      const { data: currentUserMovies, error: currentError } = await supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userId)
        .eq('status', 'known')
        .gte('total_comparisons', 2)
        .order('beta', { ascending: false })
        .limit(25);

      if (currentError || !currentUserMovies || currentUserMovies.length < 10) {
        console.log('[Recommendations] Current user has insufficient movies');
        return [];
      }

      // 2. Batch-fetch candidates' top movies (chunked to avoid URL size + row limits)
      //    Supabase caps responses at ~1000 rows by default, so keep chunks small
      //    enough that CHUNK_SIZE * 30 stays under that limit.
      const candidateIds = otherUsers.map(u => u.id);
      const allCandidateMovies: Array<{ user_id: string; movie_id: string; beta: number }> = [];
      const CHUNK_SIZE = 30;

      const chunks: string[][] = [];
      for (let i = 0; i < candidateIds.length; i += CHUNK_SIZE) {
        chunks.push(candidateIds.slice(i, i + CHUNK_SIZE));
      }
      const chunkResults = await Promise.all(
        chunks.map(chunk => {
          const rowLimit = chunk.length * 30;
          return supabase
            .from('user_movies')
            .select('user_id, movie_id, beta')
            .in('user_id', chunk)
            .eq('status', 'known')
            .order('beta', { ascending: false })
            .limit(rowLimit);
        })
      );
      for (const { data: chunkMovies, error: chunkError } of chunkResults) {
        if (chunkError) {
          console.error('[Recommendations] Batch fetch chunk failed:', chunkError);
          continue;
        }
        if (chunkMovies) {
          allCandidateMovies.push(...chunkMovies);
        }
      }

      console.log(`[Recommendations] Fetched ${allCandidateMovies.length} candidate movie rows`);

      if (allCandidateMovies.length === 0) {
        console.error('[Recommendations] Batch fetch returned no movies');
        return [];
      }

      // 3. Group by user_id, take top 25 each
      const moviesByUser = groupAndLimit(allCandidateMovies, 25);

      console.log(`[Recommendations] Grouped movies for ${moviesByUser.size} candidates`);

      // Build lookup for other user metadata
      const userMap = new Map(otherUsers.map(u => [u.id, u]));

      // 4. Compute correlations locally
      const similarities: UserSimilarity[] = [];

      for (const [candidateId, candidateMovies] of moviesByUser) {
        const result = calculateCorrelationFromData(currentUserMovies, candidateMovies);
        const otherUser = userMap.get(candidateId);

        if (result && otherUser) {
          if (result.rSquared >= MIN_SIMILARITY_THRESHOLD) {
            similarities.push({
              userId: candidateId,
              displayName: otherUser.display_name || `User ${candidateId.slice(0, 4)}`,
              rSquared: result.rSquared,
              correlation: result.correlation,
              overlapCount: result.overlapCount,
              totalComparisons: otherUser.total_comparisons,
              expandedToTop25: result.expandedToTop25,
            });
          }
        }
      }

      // Sort by R² descending
      similarities.sort((a, b) => b.rSquared - a.rSquared);

      console.log(`[Recommendations] Found ${similarities.length} similar users (batched, 2 queries)`);

      // Cache results
      similarityCache.set(userId, {
        similarities,
        timestamp: Date.now(),
        comparisonCount: currentCompCount,
      });

      return similarities.slice(0, limit);
    } catch (error) {
      console.error('[Recommendations] Error finding similar users:', error);
      return [];
    }
  },

  /**
   * Get movie recommendations based on similar users' preferences
   * Blends collaborative filtering with content-based scoring when preferences are available.
   * @param userId - The user to get recommendations for
   * @param limit - Maximum number of recommendations to return
   * @param excludeMovieIds - Movie IDs to exclude (e.g., already revealed/recommended)
   * @param userPreferences - Optional user preferences for content-based scoring
   */
  getRecommendations: async (
    userId: string,
    limit = 10,
    excludeMovieIds: string[] = [],
    userPreferences?: ContentBasedPreferences,
    forceRefresh = false
  ): Promise<RecommendationsResult> => {
    try {
      // Step 1: Find similar users
      const similarUsers = await recommendationService.findSimilarUsers(userId, 10, forceRefresh);

      // Calculate CF weight based on number of similar users (0 to 1, maxes at 5 users)
      const cfWeight = Math.min(similarUsers.length / 5, 1.0);

      if (similarUsers.length === 0) {
        // No similar users: use content-based if preferences available, else global fallback
        if (userPreferences) {
          console.log('[Recommendations] No similar users found, using content-based filtering');
          return await recommendationService.getContentBasedRecommendations(userId, userPreferences, limit, excludeMovieIds);
        }
        console.log('[Recommendations] No similar users found, falling back to global top movies');
        return await recommendationService.getGlobalFallbackRecommendations(userId, limit, excludeMovieIds);
      }

      // Step 2: Get ALL movies user has interacted with (to exclude from recommendations)
      const { data: userMovies, error: userError } = await supabase
        .from('user_movies')
        .select('movie_id, status, beta, total_comparisons')
        .eq('user_id', userId);

      if (userError) {
        console.error('[Recommendations] Failed to fetch user movies:', userError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading your movies. Please try again.',
        };
      }

      // Exclude ALL movies user has compared (any status with comparisons > 0)
      // Also exclude movies already recommended/revealed (passed via excludeMovieIds)
      // This ensures we never recommend movies they've already seen/ranked
      const seenMovieIds = new Set(
        (userMovies || [])
          .filter(m => m.total_comparisons > 0 || m.status === 'known' || m.status === 'uncertain')
          .map(m => m.movie_id)
      );

      // Add excluded movie IDs (already recommended/revealed)
      excludeMovieIds.forEach(id => seenMovieIds.add(id));

      // Exclude server-side dismissed/feedback movies
      const dismissedIds = await getDismissedMovieIds(userId);
      dismissedIds.forEach(id => seenMovieIds.add(id));

      const userHighRatedMovies = (userMovies || [])
        .filter(m => m.beta > HIGH_BETA_THRESHOLD && m.status === 'known')
        .map(m => m.movie_id);

      // Step 3: Get highly-rated movies from similar users
      const recommendations = new Map<string, MovieRecommendation>();

      for (const similarUser of similarUsers) {
        // Get similar user's top movies
        const { data: theirMovies, error: theirError } = await supabase
          .from('user_movies')
          .select('movie_id, beta, total_comparisons')
          .eq('user_id', similarUser.userId)
          .gt('beta', HIGH_BETA_THRESHOLD)
          .order('beta', { ascending: false })
          .limit(30);

        if (theirError || !theirMovies) continue;

        // Get their rankings to find shared high-rated movies
        const theirHighRated = new Set(theirMovies.map(m => m.movie_id));
        const sharedHighRated = userHighRatedMovies.filter(id => theirHighRated.has(id));

        // Rank their movies
        const theirRankMap = new Map(theirMovies.map((m, i) => [m.movie_id, i + 1]));

        for (const movie of theirMovies) {
          // Only recommend movies the user hasn't seen/compared
          if (seenMovieIds.has(movie.movie_id)) continue;

          // Calculate recommendation score
          const score = movie.beta * similarUser.rSquared * Math.log(movie.total_comparisons + 1);

          const existing = recommendations.get(movie.movie_id);
          if (existing) {
            // If already recommended by another user, boost score and mark
            existing.score += score;
            existing.recommendedByMultiple = true;
          } else {
            recommendations.set(movie.movie_id, {
              movieId: movie.movie_id,
              title: '', // Will be filled in later
              year: 0,
              posterUrl: null,
              recommendedBy: {
                userId: similarUser.userId,
                displayName: similarUser.displayName,
                similarity: Math.round(similarUser.rSquared * 100),
                theirBeta: movie.beta,
                theirRank: theirRankMap.get(movie.movie_id) || 0,
              },
              score,
              reason: '',
              sharedHighRatedMovies: sharedHighRated.slice(0, 3),
              recommendedByMultiple: false,
            });
          }
        }
      }

      // Step 4: Sort CF candidates by score
      const cfCandidates = Array.from(recommendations.values())
        .sort((a, b) => b.score - a.score);

      // Step 4b: Blend with content-based filtering if preferences available and cfWeight < 1.0
      let sortedRecs: MovieRecommendation[];

      if (userPreferences && cfWeight < 1.0 && cfCandidates.length > 0) {
        // Blended mode: merge CF and CBF candidates
        console.log(`[Recommendations] Blending CF (weight=${cfWeight.toFixed(2)}) with CBF`);

        const cbfResult = await recommendationService.getContentBasedRecommendations(
          userId, userPreferences, limit * 2, excludeMovieIds
        );

        // Build CBF lookup by movieId
        const cbfMap = new Map(cbfResult.recommendations.map(r => [r.movieId, r]));

        // Normalize CF scores to 0-1
        const maxCfScore = cfCandidates.length > 0 ? cfCandidates[0].score : 1;
        const normalizedCf = maxCfScore > 0 ? maxCfScore : 1;

        // Collect all unique movie IDs from both sets
        const allMovieIds = new Set<string>();
        cfCandidates.slice(0, limit * 2).forEach(r => allMovieIds.add(r.movieId));
        cbfResult.recommendations.forEach(r => allMovieIds.add(r.movieId));

        // Score and merge
        const blended: MovieRecommendation[] = [];
        for (const movieId of allMovieIds) {
          const cfRec = recommendations.get(movieId);
          const cbfRec = cbfMap.get(movieId);

          const cfNorm = cfRec ? cfRec.score / normalizedCf : 0;
          const cbfScore = cbfRec ? cbfRec.score : 0;
          const finalScore = cfWeight * cfNorm + (1 - cfWeight) * cbfScore;

          // Use CF rec as base if available (has richer recommendedBy info), else CBF
          const baseRec = cfRec || cbfRec!;
          blended.push({
            ...baseRec,
            score: finalScore,
          });
        }

        blended.sort((a, b) => b.score - a.score);
        sortedRecs = blended.slice(0, limit);
      } else if (userPreferences && cfCandidates.length === 0 && similarUsers.length > 0) {
        // CF returned 0 results despite having similar users (all seen) — fall through to CBF
        console.log('[Recommendations] CF empty despite similar users, falling through to CBF');
        return await recommendationService.getContentBasedRecommendations(userId, userPreferences, limit, excludeMovieIds);
      } else {
        // Pure CF (cfWeight >= 1.0 or no preferences)
        sortedRecs = cfCandidates.slice(0, limit);
      }

      // Step 5: Fetch movie details
      if (sortedRecs.length > 0) {
        const movieIds = sortedRecs.map(r => r.movieId);
        const { data: movieDetails, error: movieError } = await supabase
          .from('movies')
          .select('id, title, year, poster_url')
          .in('id', movieIds);

        if (!movieError && movieDetails) {
          const movieMap = new Map(movieDetails.map(m => [m.id, m]));

          for (const rec of sortedRecs) {
            const movie = movieMap.get(rec.movieId);
            if (movie) {
              rec.title = movie.title;
              rec.year = movie.year;
              rec.posterUrl = movie.poster_url;
            }
          }
        }

        // Generate better reason text for CF-sourced recommendations
        const cfRecs = sortedRecs.filter(r => r.recommendedBy.userId !== 'taste-profile');
        if (cfRecs.length > 0) {
          const sharedIds = new Set(cfRecs.flatMap(r => r.sharedHighRatedMovies));
          let sharedTitleMap = new Map<string, string>();

          if (sharedIds.size > 0) {
            const { data: sharedMovies } = await supabase
              .from('movies')
              .select('id, title')
              .in('id', Array.from(sharedIds));

            if (sharedMovies) {
              sharedTitleMap = new Map(sharedMovies.map(m => [m.id, m.title]));
            }
          }

          for (const rec of cfRecs) {
            const sharedCount = rec.sharedHighRatedMovies.length;
            const similarity = rec.recommendedBy.similarity;

            if (rec.recommendedByMultiple) {
              rec.reason = 'Loved by multiple taste matches';
            } else if (sharedCount >= 3) {
              rec.reason = `${sharedCount} shared favorites`;
            } else if (sharedCount > 0) {
              const sharedTitle = sharedTitleMap.get(rec.sharedHighRatedMovies[0]);
              if (sharedTitle) {
                rec.reason = `You both loved ${sharedTitle}`;
              } else {
                rec.reason = `${similarity}% taste match`;
              }
            } else {
              rec.reason = `${similarity}% taste match`;
            }
          }
        }
      }

      console.log(`[Recommendations] Generated ${sortedRecs.length} recommendations (cfWeight=${cfWeight.toFixed(2)})`);

      // Generate message based on results
      let message = '';
      if (sortedRecs.length > 0) {
        if (cfWeight >= 1.0) {
          message = `Based on ${similarUsers.length} users with similar taste to yours`;
        } else if (cfWeight > 0) {
          message = `Blended from taste matches and your preferences`;
        } else {
          message = 'Based on your taste profile';
        }
      } else if (similarUsers.length > 0) {
        message = 'Similar users found, but they love the same movies you already know! Keep comparing to discover new recommendations.';
      } else {
        message = 'Keep comparing movies to build your taste profile and find users with similar taste!';
      }

      return {
        recommendations: sortedRecs,
        similarUsersCount: similarUsers.length,
        bestMatch: similarUsers[0] || null,
        message,
      };
    } catch (error) {
      console.error('[Recommendations] Error generating recommendations:', error);
      return {
        recommendations: [],
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Failed to generate recommendations. Please try again.',
      };
    }
  },

  /**
   * Generate human-readable reason for a recommendation
   */
  generateReasonText: (recommendation: MovieRecommendation): string => {
    const similarity = recommendation.recommendedBy.similarity;
    const name = recommendation.recommendedBy.displayName || 'Someone';
    const rank = recommendation.recommendedBy.theirRank;

    if (recommendation.recommendedByMultiple) {
      return `Multiple taste matches love this movie`;
    }

    if (recommendation.sharedHighRatedMovies.length > 0) {
      // Will be filled with actual titles later
      return `${name} (${similarity}% match) ranked this #${rank}`;
    }

    return `${name} (${similarity}% taste match) ranked this #${rank} in their list`;
  },

  /**
   * Find movies that both users rated highly
   * Used for "why this recommendation" explanations
   */
  findCommonFavorites: async (
    userAId: string,
    userBId: string,
    limit = 3
  ): Promise<string[]> => {
    try {
      // Get user A's highly rated movies with titles
      const { data: userAMovies, error: errorA } = await supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userAId)
        .gte('beta', 1.0)
        .order('beta', { ascending: false });

      // Get user B's highly rated movie IDs
      const { data: userBMovies, error: errorB } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', userBId)
        .gte('beta', 1.0);

      if (errorA || errorB || !userAMovies || !userBMovies) {
        return [];
      }

      const userBHighIds = new Set(userBMovies.map(m => m.movie_id));

      // Find overlapping high-rated movies
      const commonMovieIds = userAMovies
        .filter(m => userBHighIds.has(m.movie_id))
        .slice(0, limit)
        .map(m => m.movie_id);

      if (commonMovieIds.length === 0) {
        return [];
      }

      // Fetch movie titles
      const { data: movies, error: movieError } = await supabase
        .from('movies')
        .select('id, title')
        .in('id', commonMovieIds);

      if (movieError || !movies) {
        return [];
      }

      return movies.map(m => m.title);
    } catch (error) {
      console.error('[Recommendations] Error finding common favorites:', error);
      return [];
    }
  },

  /**
   * Get detailed explanation for why a movie was recommended
   */
  getRecommendationExplanation: async (
    userId: string,
    recommendation: MovieRecommendation
  ): Promise<{
    commonFavorites: string[];
    similarityDetails: string;
    confidenceLevel: 'high' | 'medium' | 'low';
  }> => {
    const commonFavorites = await recommendationService.findCommonFavorites(
      userId,
      recommendation.recommendedBy.userId
    );

    const similarity = recommendation.recommendedBy.similarity;
    let confidenceLevel: 'high' | 'medium' | 'low';
    let similarityDetails: string;

    if (similarity >= 80) {
      confidenceLevel = 'high';
      similarityDetails = `You and ${recommendation.recommendedBy.displayName} have very similar taste in movies`;
    } else if (similarity >= 50) {
      confidenceLevel = 'medium';
      similarityDetails = `You share similar preferences with ${recommendation.recommendedBy.displayName}`;
    } else {
      confidenceLevel = 'low';
      similarityDetails = `${recommendation.recommendedBy.displayName} has somewhat similar taste to yours`;
    }

    return {
      commonFavorites,
      similarityDetails,
      confidenceLevel,
    };
  },

  /**
   * Get quick stats about user's recommendation potential
   */
  getRecommendationStats: async (userId: string): Promise<{
    similarUsersCount: number;
    potentialRecommendations: number;
    topMatchPercentage: number;
  } | null> => {
    try {
      const similarUsers = await recommendationService.findSimilarUsers(userId, 5);

      if (similarUsers.length === 0) {
        return {
          similarUsersCount: 0,
          potentialRecommendations: 0,
          topMatchPercentage: 0,
        };
      }

      // Count unknown movies that similar users rated highly
      const { data: userUnknowns } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', userId)
        .eq('status', 'unknown');

      const unknownIds = new Set((userUnknowns || []).map(m => m.movie_id));
      let potentialCount = 0;

      for (const similar of similarUsers.slice(0, 3)) {
        const { data: theirTop } = await supabase
          .from('user_movies')
          .select('movie_id')
          .eq('user_id', similar.userId)
          .gt('beta', HIGH_BETA_THRESHOLD);

        if (theirTop) {
          for (const m of theirTop) {
            if (unknownIds.has(m.movie_id)) {
              potentialCount++;
            }
          }
        }
      }

      return {
        similarUsersCount: similarUsers.length,
        potentialRecommendations: Math.min(potentialCount, 20),
        topMatchPercentage: Math.round(similarUsers[0].rSquared * 100),
      };
    } catch (error) {
      console.error('[Recommendations] Error getting stats:', error);
      return null;
    }
  },

  /**
   * Content-based recommendations using user preferences (genre, era, vibes).
   * Used when no similar users exist, or blended with CF results.
   */
  getContentBasedRecommendations: async (
    userId: string,
    preferences: ContentBasedPreferences,
    limit = 10,
    excludeMovieIds: string[] = []
  ): Promise<RecommendationsResult> => {
    try {
      // Get user's seen movie IDs
      const { data: userMovies, error: userError } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', userId);

      if (userError) {
        console.error('[Recommendations] CBF: Failed to fetch user movies:', userError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading recommendations.',
        };
      }

      const seenIds = new Set((userMovies || []).map(m => m.movie_id));
      excludeMovieIds.forEach(id => seenIds.add(id));

      // Derive learned genre scores from user's actual comparison outcomes
      const { learnedScores, rankedCount } = await deriveLearnedGenreScores(userId);
      const blendedGenreScores = blendGenreScores(preferences.genreScores, learnedScores, rankedCount);

      console.log(`[Recommendations] CBF: Blending genres from ${rankedCount} ranked movies (learned weight=${Math.min(rankedCount / 15, 1.0).toFixed(2)})`);

      // Build enriched preferences with blended genre scores
      const enrichedPreferences: ContentBasedPreferences = {
        ...preferences,
        genreScores: blendedGenreScores,
      };

      // Query candidate movies, filtered by user's unlocked tier
      const maxTier = preferences.maxTier || 4;
      let query = supabase
        .from('movies')
        .select('id, title, year, poster_url, genres, vote_average, certification')
        .gte('vote_average', 6.0)
        .lte('tier', maxTier)
        .order('vote_average', { ascending: false })
        .limit(200);

      const { data: candidates, error: moviesError } = await query;

      if (moviesError || !candidates) {
        console.error('[Recommendations] CBF: Failed to fetch movies:', moviesError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading recommendations.',
        };
      }

      // Filter out seen + excluded, then score with enriched preferences
      const scored = candidates
        .filter(m => !seenIds.has(m.id))
        .map(movie => {
          const { score, genreMatch, eraMatch, vibeMatch } = calculateContentScore(movie, enrichedPreferences);
          const penalty = isChildhoodMovie(movie.genres, movie.certification) ? CHILDHOOD_PENALTY : 1;
          return { movie, score: score * penalty, genreMatch, eraMatch, vibeMatch };
        });

      // Sort by score desc, take top limit
      scored.sort((a, b) => b.score - a.score);
      const topScored = scored.slice(0, limit);

      console.log(`[Recommendations] CBF: Scored ${scored.length} candidates, returning top ${topScored.length}`);

      const recommendations: MovieRecommendation[] = topScored.map(({ movie, score, genreMatch, eraMatch, vibeMatch }) => ({
        movieId: movie.id,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.poster_url,
        genres: movie.genres,
        recommendedBy: {
          userId: 'taste-profile',
          displayName: 'Your Taste Profile',
          similarity: Math.round(score * 100),
          theirBeta: movie.vote_average || 0,
          theirRank: 0,
        },
        score,
        reason: generateContentReason(genreMatch, eraMatch, vibeMatch, movie.genres),
        sharedHighRatedMovies: [],
        recommendedByMultiple: false,
      }));

      return {
        recommendations,
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Based on your taste profile',
      };
    } catch (error) {
      console.error('[Recommendations] CBF error:', error);
      return {
        recommendations: [],
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Error loading recommendations.',
      };
    }
  },

  /**
   * Fallback recommendations when no similar users found.
   * Returns movies the user has marked as 'unknown' or 'uncertain' during comparisons,
   * sorted by global rating. Prefers 'unknown' (movies they've heard of but don't know)
   * over 'uncertain' (movies they're unsure about).
   */
  getGlobalFallbackRecommendations: async (
    userId: string,
    limit = 10,
    excludeMovieIds: string[] = []
  ): Promise<RecommendationsResult> => {
    try {
      // Get user's movies with status 'unknown' or 'uncertain'
      // These are movies they encountered in comparisons but don't know well
      const { data: candidateMovies, error: userError } = await supabase
        .from('user_movies')
        .select('movie_id, status')
        .eq('user_id', userId)
        .in('status', ['unknown', 'uncertain']);

      if (userError) {
        console.error('[Recommendations] Failed to fetch user movies:', userError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading recommendations.',
        };
      }

      if (!candidateMovies || candidateMovies.length === 0) {
        console.log('[Recommendations] Fallback: No unknown/uncertain movies, trying global unseen');
        // Second fallback: get top-rated movies user hasn't compared at all
        return await recommendationService.getGlobalUnseenRecommendations(userId, limit, excludeMovieIds);
      }

      // Filter out already revealed/excluded movies
      const excludeSet = new Set(excludeMovieIds);
      const eligibleMovies = candidateMovies.filter(m => !excludeSet.has(m.movie_id));

      if (eligibleMovies.length === 0) {
        console.log('[Recommendations] Fallback: All unknown/uncertain already revealed, trying unseen');
        // Fall back to unseen movies instead of returning empty
        return await recommendationService.getGlobalUnseenRecommendations(userId, limit, excludeMovieIds);
      }

      // Get movie details from the movies table
      const movieIds = eligibleMovies.map(m => m.movie_id);
      const { data: movieDetails, error: moviesError } = await supabase
        .from('movies')
        .select('id, title, year, poster_url, genres, vote_average, certification')
        .in('id', movieIds);

      if (moviesError || !movieDetails) {
        console.error('[Recommendations] Failed to fetch movie details:', moviesError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading recommendations.',
        };
      }

      // Create status lookup
      const statusMap = new Map(eligibleMovies.map(m => [m.movie_id, m.status]));

      // Sort: 'unknown' first, deprioritize childhood animation, then by vote_average
      const sortedMovies = movieDetails.sort((a, b) => {
        const statusA = statusMap.get(a.id) || 'uncertain';
        const statusB = statusMap.get(b.id) || 'uncertain';

        // Prefer 'unknown' over 'uncertain'
        if (statusA === 'unknown' && statusB !== 'unknown') return -1;
        if (statusB === 'unknown' && statusA !== 'unknown') return 1;

        // Deprioritize childhood animation
        const aChild = isChildhoodMovie(a.genres, a.certification);
        const bChild = isChildhoodMovie(b.genres, b.certification);
        if (aChild && !bChild) return 1;
        if (!aChild && bChild) return -1;

        // Within same status, sort by rating
        return (b.vote_average || 0) - (a.vote_average || 0);
      });

      const topMovies = sortedMovies.slice(0, limit);

      console.log(`[Recommendations] Fallback: Found ${topMovies.length} unknown/uncertain movies`);

      // Convert to recommendation format
      const recommendations: MovieRecommendation[] = topMovies.map(movie => {
        const status = statusMap.get(movie.id) || 'uncertain';
        return {
          movieId: movie.id,
          title: movie.title,
          year: movie.year,
          posterUrl: movie.poster_url,
          genres: movie.genres,
          recommendedBy: {
            userId: 'global',
            displayName: 'Highly Rated',
            similarity: 0,
            theirBeta: movie.vote_average || 0,
            theirRank: 0,
          },
          score: movie.vote_average || 0,
          reason: status === 'unknown'
            ? `Critically acclaimed (${(movie.vote_average || 0).toFixed(1)}/10)`
            : `Worth another look (${(movie.vote_average || 0).toFixed(1)}/10)`,
          sharedHighRatedMovies: [],
          recommendedByMultiple: false,
        };
      });

      return {
        recommendations,
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Movies you might want to check out',
      };
    } catch (error) {
      console.error('[Recommendations] Fallback error:', error);
      return {
        recommendations: [],
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Error loading recommendations.',
      };
    }
  },

  /**
   * Final fallback: recommend top-rated movies the user hasn't seen at all.
   * Used when no similar users and no unknown/uncertain movies.
   */
  getGlobalUnseenRecommendations: async (
    userId: string,
    limit = 10,
    excludeMovieIds: string[] = []
  ): Promise<RecommendationsResult> => {
    try {
      // Get ALL movie IDs user has interacted with
      const { data: userMovies, error: userError } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', userId);

      if (userError) {
        console.error('[Recommendations] Failed to fetch user movies:', userError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading recommendations.',
        };
      }

      // Build exclusion set
      const seenIds = new Set((userMovies || []).map(m => m.movie_id));
      excludeMovieIds.forEach(id => seenIds.add(id));

      // Get top-rated movies that user hasn't seen
      // Don't filter by tier since tier data may not be in database
      // Use vote_average to find quality movies
      console.log(`[Recommendations] Global unseen: User has ${seenIds.size} seen movies, fetching top-rated...`);

      const { data: topMovies, error: moviesError } = await supabase
        .from('movies')
        .select('id, title, year, poster_url, genres, vote_average, certification')
        .gte('vote_average', 7.0)  // Only well-rated movies
        .order('vote_average', { ascending: false })
        .limit(100);

      if (moviesError) {
        console.error('[Recommendations] Failed to fetch movies:', moviesError);
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'Error loading recommendations.',
        };
      }

      console.log(`[Recommendations] Global unseen: Got ${topMovies?.length || 0} movies from database`);

      // If no movies with vote_average >= 7.0, try without the filter
      let moviesToUse = topMovies || [];
      if (moviesToUse.length === 0) {
        console.log('[Recommendations] Global unseen: No movies with high vote_average, trying without filter...');
        const { data: anyMovies, error: anyError } = await supabase
          .from('movies')
          .select('id, title, year, poster_url, genres, vote_average, certification')
          .order('year', { ascending: false })
          .limit(100);

        if (!anyError && anyMovies && anyMovies.length > 0) {
          console.log(`[Recommendations] Global unseen: Got ${anyMovies.length} movies without vote filter`);
          moviesToUse = anyMovies;
        }
      }

      if (moviesToUse.length === 0) {
        console.log('[Recommendations] Global unseen: No movies in database at all');
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'No recommendations available yet.',
        };
      }

      // Filter out seen movies, deprioritize childhood animation
      const unseenMovies = moviesToUse
        .filter(m => !seenIds.has(m.id))
        .sort((a, b) => {
          const scoreA = (a.vote_average || 0) * (isChildhoodMovie(a.genres, a.certification) ? CHILDHOOD_PENALTY : 1);
          const scoreB = (b.vote_average || 0) * (isChildhoodMovie(b.genres, b.certification) ? CHILDHOOD_PENALTY : 1);
          return scoreB - scoreA;
        })
        .slice(0, limit);

      console.log(`[Recommendations] Global unseen: Found ${unseenMovies.length} movies`);

      if (unseenMovies.length === 0) {
        return {
          recommendations: [],
          similarUsersCount: 0,
          bestMatch: null,
          message: 'You\'ve compared most of our top movies! Keep going to unlock more.',
        };
      }

      // Convert to recommendation format
      const recommendations: MovieRecommendation[] = unseenMovies.map(movie => ({
        movieId: movie.id,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.poster_url,
        genres: movie.genres,
        recommendedBy: {
          userId: 'global',
          displayName: 'Top Rated',
          similarity: 0,
          theirBeta: movie.vote_average || 0,
          theirRank: 0,
        },
        score: movie.vote_average || 0,
        reason: `Critically acclaimed (${(movie.vote_average || 0).toFixed(1)}/10)`,
        sharedHighRatedMovies: [],
        recommendedByMultiple: false,
      }));

      return {
        recommendations,
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Discover these highly-rated movies',
      };
    } catch (error) {
      console.error('[Recommendations] Global unseen error:', error);
      return {
        recommendations: [],
        similarUsersCount: 0,
        bestMatch: null,
        message: 'Error loading recommendations.',
      };
    }
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate Pearson correlation coefficient
 * r = Σ((x - x̄)(y - ȳ)) / √(Σ(x - x̄)² × Σ(y - ȳ)²)
 */
function calculatePearsonCorrelation(
  data: Array<{ betaA: number; betaB: number }>
): number | null {
  const n = data.length;
  if (n === 0) return null;

  // Calculate means
  let sumA = 0;
  let sumB = 0;
  for (const { betaA, betaB } of data) {
    sumA += betaA;
    sumB += betaB;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  // Calculate correlation components
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (const { betaA, betaB } of data) {
    const diffA = betaA - meanA;
    const diffB = betaB - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }

  // Check for zero variance (all same values)
  if (denomA === 0 || denomB === 0) {
    return null;
  }

  const r = numerator / Math.sqrt(denomA * denomB);

  // Clamp to [-1, 1] to handle floating point errors
  return Math.max(-1, Math.min(1, r));
}

export default recommendationService;
