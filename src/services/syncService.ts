import { supabase } from './supabase';
import * as db from './database';
import * as queue from './offlineQueue';
import { checkIsOnline } from '../hooks/useNetworkStatus';
import type { Movie, Genre, UserPreferences } from '../types';

// ============================================
// SYNC STATUS
// ============================================

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

let currentSyncStatus: SyncStatus = 'idle';
let syncListeners: Array<(status: SyncStatus) => void> = [];

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function setSyncStatus(status: SyncStatus) {
  currentSyncStatus = status;
  syncListeners.forEach(l => l(status));
}

// ============================================
// PROFILE SYNC
// ============================================

export async function syncProfile(
  userId: string,
  preferences: UserPreferences,
  totalComparisons: number
): Promise<boolean> {
  const isOnline = await checkIsOnline();

  const payload = {
    favorite_genres: Object.entries(preferences.genreScores)
      .filter(([_, score]) => score > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => genre),
    birth_decade: preferences.birthDecade,
    movie_prime_start: preferences.moviePrimeStart,
    movie_prime_end: preferences.moviePrimeEnd,
    onboarding_complete: true,
    total_comparisons: totalComparisons,
  };

  if (!isOnline) {
    await queue.addToQueue('sync_profile', { userId, ...payload });
    console.log('[Sync] Profile queued for later sync');
    return false;
  }

  const success = await db.upsertUserProfile(userId, payload);

  if (!success) {
    await queue.addToQueue('sync_profile', { userId, ...payload });
  }

  return success;
}

// ============================================
// MOVIE SYNC
// ============================================

export async function syncUserMovie(
  userId: string,
  movie: Movie
): Promise<boolean> {
  const isOnline = await checkIsOnline();

  const movieData = db.appMovieToDBUserMovie(movie);

  if (!isOnline) {
    await queue.addToQueue('sync_movie', {
      userId,
      movie_id: movie.id,
      ...movieData,
    });
    console.log(`[Sync] Movie ${movie.id} queued for later sync`);
    return false;
  }

  // Ensure movie exists in movies table before creating user_movie reference
  await ensureMovieExists(movie);

  const success = await db.upsertUserMovie(userId, movie.id, movieData);

  if (!success) {
    await queue.addToQueue('sync_movie', {
      userId,
      movie_id: movie.id,
      ...movieData,
    });
  }

  return success;
}

// Helper to ensure a movie exists in the movies table before referencing it
async function ensureMovieExists(movie: Movie): Promise<void> {
  try {
    // Build tmdb_data with director info if available
    const tmdbData = movie.directorName ? {
      credits: {
        crew: [{ job: 'Director', name: movie.directorName }]
      }
    } : null;

    // Check if movie exists
    const existing = await db.getMovieById(movie.id);
    if (existing) {
      // Movie exists - update tmdb_data if we have director info and it's missing
      if (tmdbData && !existing.tmdb_data) {
        await db.updateMovieTmdbData(movie.id, tmdbData);
      }
      return;
    }

    // Insert the movie with all required fields
    await db.insertMovie({
      id: movie.id,
      tmdb_id: movie.tmdbId || null,
      title: movie.title,
      year: movie.year,
      genres: movie.genres,
      poster_url: movie.posterUrl || null,
      poster_path: movie.posterPath || null,
      poster_color: movie.posterColor || '#1a1a2e',
      emoji: movie.emoji || '🎬',
      overview: movie.overview || null,
      vote_count: movie.voteCount || 0,
      vote_average: movie.voteAverage || 0,
      tier: movie.tier || 1,
      collection_id: movie.collectionId || null,
      collection_name: movie.collectionName || null,
      director_name: movie.directorName || null,
      director_id: movie.directorId ? parseInt(movie.directorId.replace('tmdb-person-', ''), 10) : null,
      certification: movie.certification || null,
      original_language: movie.originalLanguage || null,
      tmdb_data: tmdbData,
    });
  } catch (error) {
    // Ignore errors - the movie might already exist or FK will catch it
    console.log(`[Sync] Could not ensure movie ${movie.id} exists:`, error);
  }
}

export async function syncAllUserMovies(
  userId: string,
  movies: Movie[]
): Promise<boolean> {
  const isOnline = await checkIsOnline();

  if (!isOnline) {
    // Queue individual movies for batch sync later
    for (const movie of movies) {
      const movieData = db.appMovieToDBUserMovie(movie);
      await queue.addToQueue('sync_movie', {
        userId,
        movie_id: movie.id,
        ...movieData,
      });
    }
    console.log(`[Sync] ${movies.length} movies queued for later sync`);
    return false;
  }

  setSyncStatus('syncing');

  try {
    const batchData = movies.map(movie => ({
      movieId: movie.id,
      data: db.appMovieToDBUserMovie(movie),
    }));

    const success = await db.batchUpsertUserMovies(userId, batchData);

    setSyncStatus(success ? 'idle' : 'error');
    return success;
  } catch (error) {
    console.error('[Sync] Failed to sync all movies:', error);
    setSyncStatus('error');
    return false;
  }
}

// ============================================
// COMPARISON SYNC
// ============================================

export async function syncComparison(
  userId: string,
  movieAId: string,
  movieBId: string,
  choice: 'A' | 'B' | 'skip',
  movieABetaBefore: number,
  movieABetaAfter: number,
  movieBBetaBefore: number,
  movieBBetaAfter: number,
  comparisonNumber: number
): Promise<boolean> {
  const isOnline = await checkIsOnline();

  const payload = {
    movie_a_id: movieAId,
    movie_b_id: movieBId,
    choice,
    movie_a_beta_before: movieABetaBefore,
    movie_a_beta_after: movieABetaAfter,
    movie_b_beta_before: movieBBetaBefore,
    movie_b_beta_after: movieBBetaAfter,
    comparison_number: comparisonNumber,
  };

  if (!isOnline) {
    await queue.addToQueue('sync_comparison', { userId, ...payload });
    console.log(`[Sync] Comparison queued for later sync`);
    return false;
  }

  const success = await db.insertComparison(userId, payload);

  if (!success) {
    await queue.addToQueue('sync_comparison', { userId, ...payload });
  }

  return success;
}

// ============================================
// LOAD FROM SERVER
// ============================================

export interface ServerData {
  profile: db.DBUserProfile | null;
  userMovies: db.DBUserMovie[];
  globalMovies: db.DBMovie[];
  comparisons: db.DBComparison[];
}

export async function loadFromServer(userId: string, existingGlobalMovies?: db.DBMovie[]): Promise<ServerData | null> {
  const isOnline = await checkIsOnline();

  if (!isOnline) {
    console.log('[Sync] Cannot load from server - offline');
    setSyncStatus('offline');
    return null;
  }

  setSyncStatus('syncing');

  try {
    // Skip fetching global movies if already provided by caller
    const [profile, userMovies, globalMovies, comparisons] = await Promise.all([
      db.getUserProfile(userId),
      db.getUserMovies(userId),
      existingGlobalMovies ? Promise.resolve(existingGlobalMovies) : db.getGlobalMovies(),
      db.getUserComparisons(userId),
    ]);

    setSyncStatus('idle');

    return {
      profile,
      userMovies,
      globalMovies,
      comparisons,
    };
  } catch (error) {
    console.error('[Sync] Failed to load from server:', error);
    setSyncStatus('error');
    return null;
  }
}

// ============================================
// PROCESS OFFLINE QUEUE
// ============================================

export async function processOfflineQueue(userId: string): Promise<number> {
  const isOnline = await checkIsOnline();

  if (!isOnline) {
    console.log('[Sync] Cannot process queue - offline');
    return 0;
  }

  const operations = await queue.getQueuedOperations();

  if (operations.length === 0) {
    return 0;
  }

  console.log(`[Sync] Processing ${operations.length} queued operations`);
  setSyncStatus('syncing');

  let processedCount = 0;

  for (const op of operations) {
    try {
      let success = false;

      // Strip userId from payload - it's passed separately and the column is user_id
      const { userId: storedUserId, ...payloadWithoutUserId } = op.payload;

      // Skip operations that don't belong to current user (safety check)
      if (storedUserId && storedUserId !== userId) {
        console.warn(`[Sync] Skipping operation ${op.id} - user mismatch`);
        await queue.removeFromQueue(op.id);
        continue;
      }

      switch (op.type) {
        case 'sync_profile':
          success = await db.upsertUserProfile(userId, payloadWithoutUserId);
          break;

        case 'sync_movie':
          success = await db.upsertUserMovie(
            userId,
            payloadWithoutUserId.movie_id,
            payloadWithoutUserId
          );
          break;

        case 'sync_comparison':
          success = await db.insertComparison(userId, payloadWithoutUserId);
          break;
      }

      if (success) {
        await queue.removeFromQueue(op.id);
        processedCount++;
      } else {
        await queue.updateOperationRetry(op.id, 'Operation failed');
      }
    } catch (error) {
      console.error(`[Sync] Failed to process operation ${op.id}:`, error);
      await queue.updateOperationRetry(
        op.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // Prune operations that have failed too many times
  await queue.pruneFailedOperations(5);

  setSyncStatus('idle');
  console.log(`[Sync] Processed ${processedCount}/${operations.length} operations`);

  return processedCount;
}

// ============================================
// FULL SYNC (Initial or Recovery)
// ============================================

export async function performFullSync(
  userId: string,
  localMovies: Movie[],
  localPreferences: UserPreferences,
  localTotalComparisons: number
): Promise<{
  success: boolean;
  serverData: ServerData | null;
  needsMerge: boolean;
}> {
  const isOnline = await checkIsOnline();

  if (!isOnline) {
    return { success: false, serverData: null, needsMerge: false };
  }

  setSyncStatus('syncing');

  try {
    // 1. Load server data
    const serverData = await loadFromServer(userId);

    if (!serverData) {
      setSyncStatus('error');
      return { success: false, serverData: null, needsMerge: false };
    }

    // 2. Check if server has data (existing user) or is empty (new user)
    const serverHasData = serverData.userMovies.length > 0 ||
                          serverData.comparisons.length > 0;

    if (!serverHasData && localMovies.length > 0) {
      // New account - upload local data
      console.log('[Sync] New account detected - uploading local data');

      await syncProfile(userId, localPreferences, localTotalComparisons);
      await syncAllUserMovies(userId, localMovies.filter(m => m.status !== 'uncompared'));

      setSyncStatus('idle');
      return { success: true, serverData, needsMerge: false };
    }

    if (serverHasData) {
      // Existing account - may need to merge
      console.log('[Sync] Existing account detected - checking for merge');
      setSyncStatus('idle');
      return { success: true, serverData, needsMerge: true };
    }

    setSyncStatus('idle');
    return { success: true, serverData, needsMerge: false };
  } catch (error) {
    console.error('[Sync] Full sync failed:', error);
    setSyncStatus('error');
    return { success: false, serverData: null, needsMerge: false };
  }
}

// ============================================
// MERGE STRATEGIES
// ============================================

/**
 * Simple merge: Server wins (last-write-wins based on server being source of truth)
 * This is used when user has data on server and also has local data
 *
 * IMPORTANT: Preserves directorName/directorId from local cache since
 * these are fetched from TMDb and not stored in the database.
 */
export function mergeMovieData(
  localMovies: Map<string, Movie>,
  serverUserMovies: db.DBUserMovie[],
  globalMovies: db.DBMovie[]
): Map<string, Movie> {
  const merged = new Map<string, Movie>();
  const globalMovieMap = new Map(globalMovies.map(m => [m.id, m]));
  const serverMovieMap = new Map(serverUserMovies.map(m => [m.movie_id, m]));

  // Start with global movies
  for (const [id, globalMovie] of globalMovieMap) {
    const serverMovie = serverMovieMap.get(id);
    const localMovie = localMovies.get(id);

    // Server data takes precedence if it exists
    if (serverMovie) {
      const mergedMovie = db.dbMovieToAppMovie(globalMovie, serverMovie);
      // Preserve director info from local cache (not stored in DB)
      if (localMovie) {
        mergedMovie.directorName = localMovie.directorName;
        mergedMovie.directorId = localMovie.directorId;
        mergedMovie.tmdbId = localMovie.tmdbId;
        mergedMovie.overview = localMovie.overview;
        mergedMovie.posterPath = localMovie.posterPath;
      }
      merged.set(id, mergedMovie);
    } else if (localMovie && localMovie.status !== 'uncompared') {
      // Keep local data if no server data and user has interacted with it
      merged.set(id, localMovie);
    } else if (localMovie) {
      // Use local movie data (preserves director info from TMDb cache)
      const defaultMovie = db.dbMovieToAppMovie(globalMovie);
      defaultMovie.directorName = localMovie.directorName;
      defaultMovie.directorId = localMovie.directorId;
      defaultMovie.tmdbId = localMovie.tmdbId;
      defaultMovie.overview = localMovie.overview;
      defaultMovie.posterPath = localMovie.posterPath;
      merged.set(id, defaultMovie);
    } else {
      // Use global movie with default values
      merged.set(id, db.dbMovieToAppMovie(globalMovie));
    }
  }

  // Also include any local movies not in global (edge case)
  for (const [id, localMovie] of localMovies) {
    if (!merged.has(id)) {
      merged.set(id, localMovie);
    }
  }

  return merged;
}

// ============================================
// CLEAR USER DATA (for reset)
// ============================================

/**
 * Clear all user data from the server
 * Used when user resets their data
 */
export async function clearServerData(userId: string): Promise<boolean> {
  const isOnline = await checkIsOnline();

  if (!isOnline) {
    console.log('[Sync] Cannot clear server data - offline');
    return false;
  }

  try {
    console.log('[Sync] Clearing all server data for user...');

    // Delete in order to respect foreign key constraints
    // 1. Delete comparisons
    const { error: compError } = await supabase
      .from('comparisons')
      .delete()
      .eq('user_id', userId);

    if (compError) {
      console.error('[Sync] Failed to delete comparisons:', compError);
    }

    // 2. Delete user_movies
    const { error: moviesError } = await supabase
      .from('user_movies')
      .delete()
      .eq('user_id', userId);

    if (moviesError) {
      console.error('[Sync] Failed to delete user_movies:', moviesError);
    }

    // 3. Delete watchlist
    const { error: watchlistError } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', userId);

    if (watchlistError) {
      console.error('[Sync] Failed to delete watchlist:', watchlistError);
    }

    // 4. Reset profile (don't delete, just reset counters)
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        total_comparisons: 0,
        favorite_genres: [],
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[Sync] Failed to reset profile:', profileError);
    }

    console.log('[Sync] Server data cleared successfully');
    return true;
  } catch (error) {
    console.error('[Sync] Failed to clear server data:', error);
    return false;
  }
}
