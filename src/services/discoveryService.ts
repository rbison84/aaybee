import { supabase } from './supabase';
import { calculateSmartCorrelation, getUserTopMovies } from '../utils/correlationUtils';
import { Movie } from '../types';

// ============================================
// TYPES
// ============================================

export interface DiscoveryCandidate {
  movieId: string;
  title: string;
  year: number;
  posterUrl: string | null;
  score: number; // recommender's beta × R² match
  recommendedBy: {
    userId: string;
    displayName: string;
    rSquared: number;
    theirRank: number;
  };
}

export interface DiscoveryPair {
  discoveryMovie: DiscoveryCandidate;
  opponentMovie: Movie;
  type: 'discovery';
}

export interface SimilarUser {
  userId: string;
  displayName: string;
  rSquared: number;
  topMovies: Array<{ movie_id: string; beta: number; rank: number }>;
}

// ============================================
// CONSTANTS
// ============================================

const MIN_COMPARISONS_FOR_DISCOVERY = 20; // Need base ranking first
const DISCOVERY_INTERVAL = 5; // Every 5th comparison is discovery
const MIN_RSQUARED_FOR_DISCOVERY = 0.5; // R² > 0.5 for similar users
const MID_RANK_START = 5;
const MID_RANK_END = 15;

// ============================================
// DISCOVERY SERVICE
// ============================================

export const discoveryService = {
  /**
   * Check if we should show a discovery pair
   */
  shouldShowDiscoveryPair: (
    totalComparisons: number,
    consecutiveRegularPairs: number
  ): boolean => {
    // Don't show discovery until user has enough comparisons
    if (totalComparisons < MIN_COMPARISONS_FOR_DISCOVERY) {
      return false;
    }

    // Every Nth comparison should be a discovery pair
    return consecutiveRegularPairs >= DISCOVERY_INTERVAL - 1;
  },

  /**
   * Find top 5 similar users for discovery
   */
  findSimilarUsersForDiscovery: async (
    userId: string
  ): Promise<SimilarUser[]> => {
    try {
      // Get all other users with enough comparisons
      const { data: otherUsers, error } = await supabase
        .from('user_profiles')
        .select('id, display_name, total_comparisons')
        .neq('id', userId)
        .gte('total_comparisons', 20);

      if (error || !otherUsers?.length) {
        return [];
      }

      // Calculate similarity and collect results
      const similarUsers: SimilarUser[] = [];

      for (const otherUser of otherUsers) {
        const result = await calculateSmartCorrelation(userId, otherUser.id);

        if (result && result.rSquared >= MIN_RSQUARED_FOR_DISCOVERY) {
          // Get their top 15 movies
          const topMovies = await getUserTopMovies(otherUser.id, 15);

          similarUsers.push({
            userId: otherUser.id,
            displayName: otherUser.display_name || 'User',
            rSquared: result.rSquared,
            topMovies,
          });
        }
      }

      // Sort by R² and return top 5
      return similarUsers
        .sort((a, b) => b.rSquared - a.rSquared)
        .slice(0, 5);
    } catch (error) {
      console.error('[Discovery] Error finding similar users:', error);
      return [];
    }
  },

  /**
   * Get discovery candidates from similar users
   * Movies the current user hasn't compared yet
   */
  getDiscoveryCandidates: async (
    userId: string,
    similarUsers: SimilarUser[],
    userComparedMovieIds: Set<string>
  ): Promise<DiscoveryCandidate[]> => {
    if (similarUsers.length === 0) {
      return [];
    }

    // Collect all candidate movies
    const candidateMap = new Map<string, DiscoveryCandidate>();

    for (const similarUser of similarUsers) {
      for (const movie of similarUser.topMovies) {
        // Skip if user has already compared this movie
        if (userComparedMovieIds.has(movie.movie_id)) {
          continue;
        }

        // Skip if we already have a better recommender for this movie
        const existing = candidateMap.get(movie.movie_id);
        const score = movie.beta * similarUser.rSquared;

        if (!existing || score > existing.score) {
          candidateMap.set(movie.movie_id, {
            movieId: movie.movie_id,
            title: '', // Will be filled in
            year: 0,
            posterUrl: null,
            score,
            recommendedBy: {
              userId: similarUser.userId,
              displayName: similarUser.displayName,
              rSquared: similarUser.rSquared,
              theirRank: movie.rank,
            },
          });
        }
      }
    }

    const candidates = Array.from(candidateMap.values());

    if (candidates.length === 0) {
      return [];
    }

    // Fetch movie details
    const movieIds = candidates.map(c => c.movieId);
    const { data: movies, error } = await supabase
      .from('movies')
      .select('id, title, year, poster_url')
      .in('id', movieIds);

    if (error || !movies) {
      return [];
    }

    // Merge in movie details
    const movieMap = new Map(movies.map(m => [m.id, m]));
    for (const candidate of candidates) {
      const movie = movieMap.get(candidate.movieId);
      if (movie) {
        candidate.title = movie.title;
        candidate.year = movie.year;
        candidate.posterUrl = movie.poster_url;
      }
    }

    // Filter out candidates without details and sort by score
    return candidates
      .filter(c => c.title)
      .sort((a, b) => b.score - a.score);
  },

  /**
   * Get a mid-ranked movie as opponent (rank #5-15)
   */
  getMidRankedOpponent: (rankedMovies: Movie[]): Movie | null => {
    // Get movies ranked #5-15
    const midRankedMovies = rankedMovies.slice(MID_RANK_START - 1, MID_RANK_END);

    if (midRankedMovies.length === 0) {
      return null;
    }

    // Pick a random one from the middle range
    const randomIndex = Math.floor(Math.random() * midRankedMovies.length);
    return midRankedMovies[randomIndex];
  },

  /**
   * Get global top movies as fallback when no similar users
   */
  getGlobalFallbackCandidates: async (
    userComparedMovieIds: Set<string>,
    limit: number = 50
  ): Promise<DiscoveryCandidate[]> => {
    try {
      const { data: globalStats, error } = await supabase
        .from('global_movie_stats')
        .select('movie_id, global_beta, average_user_beta')
        .order('global_beta', { ascending: false })
        .limit(limit);

      if (error || !globalStats) {
        return [];
      }

      // Filter to movies user hasn't compared
      const candidates: DiscoveryCandidate[] = [];

      globalStats.forEach((stat, index) => {
        if (userComparedMovieIds.has(stat.movie_id)) {
          return;
        }

        candidates.push({
          movieId: stat.movie_id,
          title: '',
          year: 0,
          posterUrl: null,
          score: stat.average_user_beta || stat.global_beta || 0,
          recommendedBy: {
            userId: 'global',
            displayName: 'Global Top 50',
            rSquared: 0.5, // Default weight
            theirRank: index + 1, // Compute rank from sorted position
          },
        });
      });

      if (candidates.length === 0) {
        return [];
      }

      // Fetch movie details
      const movieIds = candidates.map(c => c.movieId);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title, year, poster_url')
        .in('id', movieIds);

      if (movies) {
        const movieMap = new Map(movies.map(m => [m.id, m]));
        for (const candidate of candidates) {
          const movie = movieMap.get(candidate.movieId);
          if (movie) {
            candidate.title = movie.title;
            candidate.year = movie.year;
            candidate.posterUrl = movie.poster_url;
          }
        }
      }

      return candidates.filter(c => c.title);
    } catch (error) {
      console.error('[Discovery] Error getting global fallback:', error);
      return [];
    }
  },

  /**
   * Generate a discovery pair for the comparison flow
   */
  generateDiscoveryPair: async (
    userId: string,
    rankedMovies: Movie[],
    allUserMovies: Map<string, Movie>
  ): Promise<DiscoveryPair | null> => {
    try {
      // Get IDs of all movies user has compared
      const comparedMovieIds = new Set(
        Array.from(allUserMovies.values())
          .filter(m => m.totalComparisons > 0)
          .map(m => m.id)
      );

      // Step 1: Find similar users
      const similarUsers = await discoveryService.findSimilarUsersForDiscovery(userId);

      // Step 2: Get discovery candidates
      let candidates: DiscoveryCandidate[];

      if (similarUsers.length > 0) {
        candidates = await discoveryService.getDiscoveryCandidates(
          userId,
          similarUsers,
          comparedMovieIds
        );
      } else {
        // Fallback to global top movies
        console.log('[Discovery] No similar users, using global fallback');
        candidates = await discoveryService.getGlobalFallbackCandidates(comparedMovieIds);
      }

      if (candidates.length === 0) {
        console.log('[Discovery] No discovery candidates available');
        return null;
      }

      // Step 3: Pick top candidate
      const discoveryMovie = candidates[0];

      // Step 4: Get mid-ranked opponent
      const opponent = discoveryService.getMidRankedOpponent(rankedMovies);

      if (!opponent) {
        console.log('[Discovery] No suitable opponent found');
        return null;
      }

      console.log(`[Discovery] Generated pair: "${discoveryMovie.title}" vs "${opponent.title}" (opponent rank #${rankedMovies.indexOf(opponent) + 1})`);

      return {
        discoveryMovie,
        opponentMovie: opponent,
        type: 'discovery',
      };
    } catch (error) {
      console.error('[Discovery] Error generating discovery pair:', error);
      return null;
    }
  },

  /**
   * Convert discovery candidate to Movie format for comparison
   */
  candidateToMovie: (candidate: DiscoveryCandidate, allMovies: Map<string, Movie>): Movie | null => {
    // Try to get from existing movies
    const existing = allMovies.get(candidate.movieId);
    if (existing) {
      return existing;
    }

    // Create a minimal movie object
    // This shouldn't normally happen if the movie is in our catalog
    return null;
  },
};

export default discoveryService;
