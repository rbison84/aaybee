// Movie Cache Service
// Fetches movies from Supabase (source of truth) with TMDb API fallback
// Caches locally in AsyncStorage for offline support

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCuratedMovies, CURATED_MOVIE_IDS, getMoviesByIds, tmdbToAppMovie } from './tmdb';
import { getGlobalMovies, DBMovie, dbMovieToAppMovie } from './database';
import { DAILY_CATEGORIES } from '../data/dailyCategories';
import { Movie, Genre } from '../types';

const CACHE_KEY = '@aaybee/movie_cache';
const CACHE_EXPIRY_KEY = '@aaybee/movie_cache_expiry';
const CACHE_VERSION_KEY = '@aaybee/movie_cache_version';
const CACHE_DURATION_DAYS = 7; // Shorter duration since Supabase is source of truth

// Cache version for invalidation
const CACHE_VERSION = '2.7'; // Bumped: supplement missing daily category movies from TMDb

interface CachedMovieData {
  id: string;
  tmdbId?: number;
  title: string;
  year: number;
  genres: Genre[];
  posterUrl: string;
  posterPath?: string | null;
  posterColor: string;
  overview: string;
  voteAverage: number;
  voteCount?: number;
  collectionId?: number;
  collectionName?: string;
  tier: 1 | 2 | 3 | 4 | 5;
  directorName?: string;
  directorId?: string;
  certification?: string;
  originalLanguage?: string;
}

// Tier thresholds (for TMDb fallback computation)
const TIER_SIZES = {
  tier1: 100,  // Top 100 movies (best of each franchise)
  tier2: 175,  // Next 75 movies
  tier3: 275,  // Next 100 movies
  tier4: Infinity, // Rest
};

// Check if cache is expired or version mismatch
async function isCacheExpired(): Promise<boolean> {
  try {
    const [expiryStr, version] = await Promise.all([
      AsyncStorage.getItem(CACHE_EXPIRY_KEY),
      AsyncStorage.getItem(CACHE_VERSION_KEY),
    ]);

    // Check version mismatch
    if (version !== CACHE_VERSION) {
      console.log('[MovieCache] Cache version mismatch, will refresh');
      return true;
    }

    if (!expiryStr) return true;

    const expiry = parseInt(expiryStr, 10);
    return Date.now() > expiry;
  } catch {
    return true;
  }
}

// Save movies to local cache
async function saveToCache(movies: CachedMovieData[]): Promise<void> {
  try {
    const expiry = Date.now() + CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    await Promise.all([
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(movies)),
      AsyncStorage.setItem(CACHE_EXPIRY_KEY, expiry.toString()),
      AsyncStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION),
    ]);
    console.log(`[MovieCache] Saved ${movies.length} movies to local cache`);
  } catch (error) {
    console.error('[MovieCache] Failed to save cache:', error);
  }
}

// Load movies from local cache
async function loadFromCache(): Promise<CachedMovieData[] | null> {
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY);
    if (!data) return null;

    const movies = JSON.parse(data) as CachedMovieData[];
    console.log(`[MovieCache] Loaded ${movies.length} movies from local cache`);
    return movies;
  } catch (error) {
    console.error('[MovieCache] Failed to load cache:', error);
    return null;
  }
}

// Convert DBMovie to CachedMovieData
function dbMovieToCached(dbMovie: DBMovie): CachedMovieData {
  return {
    id: dbMovie.id,
    tmdbId: dbMovie.tmdb_id || undefined,
    title: dbMovie.title,
    year: dbMovie.year,
    genres: dbMovie.genres as Genre[],
    posterUrl: dbMovie.poster_url || '',
    posterPath: dbMovie.poster_path,
    posterColor: dbMovie.poster_color,
    overview: dbMovie.overview || '',
    voteAverage: dbMovie.vote_average || 0,
    voteCount: dbMovie.vote_count || 0,
    collectionId: dbMovie.collection_id || undefined,
    collectionName: dbMovie.collection_name || undefined,
    tier: dbMovie.tier || 1,
    directorName: dbMovie.director_name || undefined,
    directorId: dbMovie.director_id?.toString(),
    certification: dbMovie.certification || undefined,
    originalLanguage: dbMovie.original_language || dbMovie.tmdb_data?.original_language || undefined,
  };
}

// Convert cached data to full Movie objects
function toFullMovies(cachedMovies: CachedMovieData[]): Movie[] {
  return cachedMovies.map(cached => ({
    id: cached.id,
    tmdbId: cached.tmdbId,
    title: cached.title,
    year: cached.year,
    genres: cached.genres,
    posterUrl: cached.posterUrl,
    posterPath: cached.posterPath,
    posterColor: cached.posterColor,
    overview: cached.overview,
    directorName: cached.directorName,
    directorId: cached.directorId,
    voteAverage: cached.voteAverage,
    voteCount: cached.voteCount,
    tier: cached.tier,
    collectionId: cached.collectionId,
    collectionName: cached.collectionName,
    certification: cached.certification,
    originalLanguage: cached.originalLanguage,
    // Default ranking data
    beta: 0,
    totalWins: 0,
    totalLosses: 0,
    totalComparisons: 0,
    timesShown: 0,
    lastShownAt: 0,
    status: 'uncompared' as const,
  }));
}

// Compute tiers for movies (used only for TMDb fallback)
function computeTiers(movies: CachedMovieData[]): CachedMovieData[] {
  const collections = new Map<number, CachedMovieData[]>();
  const standalone: CachedMovieData[] = [];

  for (const movie of movies) {
    if (movie.collectionId) {
      const group = collections.get(movie.collectionId) || [];
      group.push(movie);
      collections.set(movie.collectionId, group);
    } else {
      standalone.push(movie);
    }
  }

  const primaryFromCollections: CachedMovieData[] = [];
  const secondaryFromCollections: CachedMovieData[] = [];

  for (const [, group] of collections) {
    group.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0));
    primaryFromCollections.push(group[0]);
    secondaryFromCollections.push(...group.slice(1));
  }

  const tier1Candidates = [...primaryFromCollections, ...standalone];
  tier1Candidates.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0));
  secondaryFromCollections.sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0));

  const result: CachedMovieData[] = [];

  for (let i = 0; i < tier1Candidates.length; i++) {
    const movie = tier1Candidates[i];
    if (i < TIER_SIZES.tier1) {
      result.push({ ...movie, tier: 1 });
    } else if (i < TIER_SIZES.tier2) {
      result.push({ ...movie, tier: 2 });
    } else if (i < TIER_SIZES.tier3) {
      result.push({ ...movie, tier: 3 });
    } else {
      result.push({ ...movie, tier: 4 });
    }
  }

  for (let i = 0; i < secondaryFromCollections.length; i++) {
    const movie = secondaryFromCollections[i];
    if (i < 50) {
      result.push({ ...movie, tier: 2 });
    } else if (i < 125) {
      result.push({ ...movie, tier: 3 });
    } else {
      result.push({ ...movie, tier: 4 });
    }
  }

  console.log(`[MovieCache] Computed tier distribution: T1=${result.filter(m => m.tier === 1).length}, T2=${result.filter(m => m.tier === 2).length}, T3=${result.filter(m => m.tier === 3).length}, T4=${result.filter(m => m.tier === 4).length}`);

  return result;
}

// Fetch movies from Supabase
async function fetchFromSupabase(): Promise<CachedMovieData[] | null> {
  try {
    console.log('[MovieCache] Fetching movies from Supabase...');
    const dbMovies = await getGlobalMovies();

    if (!dbMovies || dbMovies.length === 0) {
      console.log('[MovieCache] No movies in Supabase');
      return null;
    }

    // Check if movies have tier data (migration applied)
    const hasTierData = dbMovies.some(m => m.tier && m.tier >= 1 && m.tier <= 5);
    if (!hasTierData) {
      console.log('[MovieCache] Supabase movies missing tier data, will use TMDb fallback');
      return null;
    }

    const movies = dbMovies.map(dbMovieToCached);
    console.log(`[MovieCache] Fetched ${movies.length} movies from Supabase (tiers 1-4 only)`);

    // Log tier distribution
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    movies.forEach(m => tierCounts[m.tier] = (tierCounts[m.tier] || 0) + 1);
    console.log(`[MovieCache] Tier distribution: T1=${tierCounts[1]}, T2=${tierCounts[2]}, T3=${tierCounts[3]}, T4=${tierCounts[4]}`);

    return movies;
  } catch (error) {
    console.error('[MovieCache] Supabase fetch failed:', error);
    return null;
  }
}

// Fetch movies from TMDb (fallback)
async function fetchFromTMDb(): Promise<CachedMovieData[]> {
  console.log('[MovieCache] Fetching movies from TMDb API (fallback)...');
  const tmdbMovies = await fetchCuratedMovies();

  // Convert to cached format
  const movies: CachedMovieData[] = tmdbMovies.map(m => ({
    id: m.id,
    tmdbId: m.tmdbId,
    title: m.title,
    year: m.year,
    genres: m.genres,
    posterUrl: m.posterUrl,
    posterPath: m.posterPath,
    posterColor: m.posterColor,
    overview: m.overview,
    voteAverage: m.voteAverage,
    voteCount: m.voteCount,
    collectionId: m.collectionId,
    collectionName: m.collectionName,
    tier: 1, // Will be computed
    directorName: m.directorName,
    directorId: m.directorId,
    originalLanguage: m.originalLanguage,
  }));

  // Compute tiers
  return computeTiers(movies);
}

// Fetch any daily category movies missing from the loaded set via TMDb API
async function supplementDailyMovies(movies: CachedMovieData[]): Promise<CachedMovieData[]> {
  const loadedIds = new Set(movies.map(m => m.id));

  // Collect all unique movie IDs referenced by daily categories
  const missingNumericIds: number[] = [];
  for (const cat of DAILY_CATEGORIES) {
    for (const id of cat.movieIds) {
      if (!loadedIds.has(id)) {
        const numericId = parseInt(id.replace('tmdb-', ''), 10);
        if (!isNaN(numericId)) missingNumericIds.push(numericId);
      }
    }
  }

  if (missingNumericIds.length === 0) return movies;

  const uniqueMissing = [...new Set(missingNumericIds)];
  console.log(`[MovieCache] ${uniqueMissing.length} daily category movies missing, fetching from TMDb...`);

  try {
    const fetched = await getMoviesByIds(uniqueMissing);
    const supplemental: CachedMovieData[] = fetched.map(tmdb => {
      const m = tmdbToAppMovie(tmdb);
      return {
        id: m.id,
        tmdbId: m.tmdbId,
        title: m.title,
        year: m.year,
        genres: m.genres,
        posterUrl: m.posterUrl,
        posterPath: m.posterPath,
        posterColor: m.posterColor,
        overview: m.overview,
        voteAverage: m.voteAverage,
        voteCount: m.voteCount,
        collectionId: m.collectionId,
        collectionName: m.collectionName,
        tier: 4 as const,
        directorName: m.directorName,
        directorId: m.directorId,
        originalLanguage: m.originalLanguage,
      };
    });
    console.log(`[MovieCache] Supplemented ${supplemental.length} daily category movies from TMDb`);
    return [...movies, ...supplemental];
  } catch (err) {
    console.warn('[MovieCache] Failed to supplement daily movies:', err);
    return movies;
  }
}

// Main function: Get movies (from Supabase, cache, or TMDb fallback)
export async function getMovies(forceRefresh = false): Promise<Movie[]> {
  const t0 = Date.now();

  // Check local cache first (unless force refresh)
  if (!forceRefresh) {
    const expired = await isCacheExpired();
    if (!expired) {
      const cached = await loadFromCache();
      if (cached && cached.length > 0) {
        console.log(`[MovieCache] Cache hit: ${cached.length} movies in ${Date.now() - t0}ms`);
        return toFullMovies(cached);
      }
    }
  }

  // Try Supabase first (source of truth)
  let movies = await fetchFromSupabase();
  console.log(`[MovieCache] Supabase fetch: ${movies?.length ?? 0} movies in ${Date.now() - t0}ms`);

  // Fallback to TMDb if Supabase is empty or failed
  if (!movies || movies.length === 0) {
    try {
      movies = await fetchFromTMDb();
      console.log(`[MovieCache] TMDb fallback: ${movies.length} movies in ${Date.now() - t0}ms`);
    } catch (tmdbError) {
      console.error('[MovieCache] TMDb fallback failed:', tmdbError);

      // Last resort: use expired cache
      const cached = await loadFromCache();
      if (cached && cached.length > 0) {
        console.log('[MovieCache] Using expired cache as last resort');
        return toFullMovies(cached);
      }

      throw new Error('Failed to load movies from any source');
    }
  }

  // Ensure all daily category movies are present (fetch from TMDb if missing from Supabase)
  movies = await supplementDailyMovies(movies);

  // Save to local cache (don't block return)
  saveToCache(movies);

  return toFullMovies(movies);
}

// Clear the local cache (for debugging)
export async function clearMovieCache(): Promise<void> {
  await AsyncStorage.multiRemove([CACHE_KEY, CACHE_EXPIRY_KEY, CACHE_VERSION_KEY]);
  console.log('[MovieCache] Local cache cleared');
}

// Get cache info
export async function getCacheInfo(): Promise<{
  hasCache: boolean;
  movieCount: number;
  expiresAt: Date | null;
  isExpired: boolean;
  cacheVersion: string | null;
}> {
  const cached = await loadFromCache();
  const expiryStr = await AsyncStorage.getItem(CACHE_EXPIRY_KEY);
  const version = await AsyncStorage.getItem(CACHE_VERSION_KEY);
  const expired = await isCacheExpired();

  return {
    hasCache: cached !== null && cached.length > 0,
    movieCount: cached?.length || 0,
    expiresAt: expiryStr ? new Date(parseInt(expiryStr, 10)) : null,
    isExpired: expired,
    cacheVersion: version,
  };
}

// Export tier sizes for other modules
export { TIER_SIZES };
