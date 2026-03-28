import { supabase } from './supabase';
import type { Movie, Genre } from '../types';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface DBUserProfile {
  id: string;
  display_name: string | null;
  favorite_genres: string[];
  birth_decade: number | null;
  movie_prime_start: number | null;
  movie_prime_end: number | null;
  onboarding_complete: boolean;
  total_comparisons: number;
  created_at: string;
  updated_at: string;
}

export interface DBUserMovie {
  id: string;
  user_id: string;
  movie_id: string;
  beta: number;
  total_wins: number;
  total_losses: number;
  total_comparisons: number;
  times_shown: number;
  last_shown_at: number | null;
  status: 'uncompared' | 'known' | 'uncertain' | 'unknown';
  created_at: string;
  updated_at: string;
}

export interface DBComparison {
  id: string;
  user_id: string;
  movie_a_id: string;
  movie_b_id: string;
  choice: 'A' | 'B' | 'skip';
  movie_a_beta_before: number;
  movie_a_beta_after: number;
  movie_b_beta_before: number;
  movie_b_beta_after: number;
  comparison_number: number;
  created_at: string;
}

export interface DBMovie {
  id: string;
  tmdb_id: number | null;
  title: string;
  year: number;
  genres: string[];
  poster_url: string | null;
  poster_path: string | null;
  poster_color: string;
  emoji: string;
  overview: string | null;
  vote_count: number;
  vote_average: number;
  tier: 1 | 2 | 3 | 4 | 5;
  collection_id: number | null;
  collection_name: string | null;
  director_name: string | null;
  director_id: number | null;
  certification: string | null;
  original_language: string | null;
  tmdb_data: any;
  created_at: string;
  updated_at: string;
}

export interface DBGlobalMovieStats {
  movie_id: string;
  global_beta: number;
  total_global_wins: number;
  total_global_losses: number;
  total_global_comparisons: number;
  unique_users_count: number;
  average_user_beta: number;
  median_user_beta: number;
  percentile_25: number;
  percentile_75: number;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// USER PROFILE OPERATIONS
// ============================================

export async function getUserProfile(userId: string): Promise<DBUserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[DB] Failed to get user profile:', error);
    return null;
  }

  return data;
}

export async function upsertUserProfile(
  userId: string,
  profile: Partial<Omit<DBUserProfile, 'id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      ...profile,
    }, { onConflict: 'id' });

  if (error) {
    console.error('[DB] Failed to upsert user profile:', error);
    return false;
  }

  return true;
}

// ============================================
// USER MOVIES OPERATIONS
// ============================================

export async function getUserMovies(userId: string): Promise<DBUserMovie[]> {
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[DB] Failed to get user movies:', error);
    return [];
  }

  return data || [];
}

export async function upsertUserMovie(
  userId: string,
  movieId: string,
  movieData: Partial<Omit<DBUserMovie, 'id' | 'user_id' | 'movie_id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('user_movies')
    .upsert({
      user_id: userId,
      movie_id: movieId,
      ...movieData,
    }, {
      onConflict: 'user_id,movie_id',
    });

  if (error) {
    // Silently ignore foreign key errors - movie may not exist in catalog
    if (error.code === '23503') {
      console.log(`[DB] Skipping user movie sync - movie ${movieId} not in catalog`);
      return true; // Return true to remove from retry queue
    }
    console.error('[DB] Failed to upsert user movie:', error);
    return false;
  }

  return true;
}

export async function batchUpsertUserMovies(
  userId: string,
  movies: Array<{
    movieId: string;
    data: Partial<Omit<DBUserMovie, 'id' | 'user_id' | 'movie_id' | 'created_at' | 'updated_at'>>;
  }>
): Promise<boolean> {
  const records = movies.map(m => ({
    user_id: userId,
    movie_id: m.movieId,
    ...m.data,
  }));

  const { error } = await supabase
    .from('user_movies')
    .upsert(records, {
      onConflict: 'user_id,movie_id',
    });

  if (error) {
    console.error('[DB] Failed to batch upsert user movies:', error);
    return false;
  }

  return true;
}

// ============================================
// COMPARISONS OPERATIONS
// ============================================

export async function getUserComparisons(userId: string): Promise<DBComparison[]> {
  const { data, error } = await supabase
    .from('comparisons')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Failed to get user comparisons:', error);
    return [];
  }

  return data || [];
}

export async function insertComparison(
  userId: string,
  comparison: Omit<DBComparison, 'id' | 'user_id' | 'created_at'>
): Promise<boolean> {
  const { error } = await supabase
    .from('comparisons')
    .insert({
      user_id: userId,
      ...comparison,
    });

  if (error) {
    // Silently ignore foreign key errors - movies may not exist in catalog
    if (error.code === '23503') {
      console.log(`[DB] Skipping comparison sync - movie not in catalog`);
      return true; // Return true to remove from retry queue
    }
    console.error('[DB] Failed to insert comparison:', error);
    return false;
  }

  return true;
}

export async function getComparisonCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('comparisons')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[DB] Failed to get comparison count:', error);
    return 0;
  }

  return count || 0;
}

// ============================================
// GLOBAL MOVIES OPERATIONS
// ============================================

// Select only the columns needed for movie display and caching.
// Excludes `tmdb_data` which contains large JSON blobs (credits, crew, etc.)
// and would add several MB to the response for ~1,278 movies.
const GLOBAL_MOVIES_COLUMNS = [
  'id', 'tmdb_id', 'title', 'year', 'genres',
  'poster_url', 'poster_path', 'poster_color', 'emoji',
  'overview', 'vote_count', 'vote_average', 'tier',
  'collection_id', 'collection_name',
  'director_name', 'director_id',
  'certification', 'original_language',
  'created_at', 'updated_at',
].join(',');

export async function getGlobalMovies(): Promise<DBMovie[]> {
  const { data, error } = await supabase
    .from('movies')
    .select(GLOBAL_MOVIES_COLUMNS)
    .lte('tier', 4) // Exclude tier 5 (search-only)
    .limit(2000); // Supabase defaults to 1000 rows; we have ~1278 curated movies

  if (error) {
    console.error('[DB] Failed to get global movies:', error);
    return [];
  }

  // Fill in tmdb_data as null since we excluded it from the query
  return (data || []).map((m: any) => ({ ...m, tmdb_data: null })) as DBMovie[];
}

export async function searchMoviesByTitle(query: string, limit = 20): Promise<DBMovie[]> {
  const { data, error } = await supabase.rpc('search_movies_fuzzy', {
    search_query: query,
    result_limit: limit,
  });
  if (error) {
    console.error('[DB] Search failed:', error);
    return [];
  }
  return (data || []) as DBMovie[];
}

export async function getMovieById(movieId: string): Promise<DBMovie | null> {
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .eq('id', movieId)
    .single();

  if (error) {
    console.error('[DB] Failed to get movie:', error);
    return null;
  }

  return data;
}

export async function insertMovie(movie: Omit<DBMovie, 'created_at' | 'updated_at'>): Promise<boolean> {
  const { error } = await supabase
    .from('movies')
    .insert(movie);

  if (error) {
    // Ignore duplicate key errors (movie already exists)
    if (error.code === '23505') {
      return true;
    }
    console.error('[DB] Failed to insert movie:', error);
    return false;
  }

  return true;
}

export async function updateMovieTmdbData(movieId: string, tmdbData: any): Promise<boolean> {
  const { error } = await supabase
    .from('movies')
    .update({ tmdb_data: tmdbData })
    .eq('id', movieId)
    .is('tmdb_data', null); // Only update if currently null

  if (error) {
    console.error('[DB] Failed to update movie tmdb_data:', error);
    return false;
  }

  return true;
}

// ============================================
// GLOBAL MOVIE STATS OPERATIONS
// ============================================

export async function getGlobalMovieStats(): Promise<DBGlobalMovieStats[]> {
  const { data, error } = await supabase
    .from('global_movie_stats')
    .select('*')
    .order('global_beta', { ascending: false });

  if (error) {
    console.error('[DB] Failed to get global movie stats:', error);
    return [];
  }

  return data || [];
}

export async function getGlobalMovieStatsById(movieId: string): Promise<DBGlobalMovieStats | null> {
  const { data, error } = await supabase
    .from('global_movie_stats')
    .select('*')
    .eq('movie_id', movieId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[DB] Failed to get global movie stats:', error);
    }
    return null;
  }

  return data;
}

export async function upsertGlobalMovieStats(
  stats: Omit<DBGlobalMovieStats, 'created_at' | 'updated_at'>
): Promise<boolean> {
  const { error } = await supabase
    .from('global_movie_stats')
    .upsert(stats, { onConflict: 'movie_id' });

  if (error) {
    console.error('[DB] Failed to upsert global movie stats:', error);
    return false;
  }

  return true;
}

// ============================================
// UTILITY: Convert between DB and App types
// ============================================

export function dbMovieToAppMovie(dbMovie: DBMovie, userMovie?: DBUserMovie): Movie {
  return {
    id: dbMovie.id,
    tmdbId: dbMovie.tmdb_id || undefined,
    title: dbMovie.title,
    year: dbMovie.year,
    genres: dbMovie.genres as Genre[],
    posterUrl: dbMovie.poster_url || '',
    posterPath: dbMovie.poster_path || undefined,
    posterColor: dbMovie.poster_color,
    emoji: dbMovie.emoji,
    overview: dbMovie.overview || '',
    voteAverage: dbMovie.vote_average || 0,
    voteCount: dbMovie.vote_count || 0,
    tier: dbMovie.tier || 1,
    collectionId: dbMovie.collection_id || undefined,
    collectionName: dbMovie.collection_name || undefined,
    directorName: dbMovie.director_name || undefined,
    directorId: dbMovie.director_id?.toString() || undefined,
    certification: dbMovie.certification || undefined,
    originalLanguage: dbMovie.original_language || undefined,
    beta: userMovie?.beta ?? 0,
    totalWins: userMovie?.total_wins ?? 0,
    totalLosses: userMovie?.total_losses ?? 0,
    totalComparisons: userMovie?.total_comparisons ?? 0,
    timesShown: userMovie?.times_shown ?? 0,
    lastShownAt: userMovie?.last_shown_at ?? 0,
    status: userMovie?.status ?? 'uncompared',
  };
}

export function appMovieToDBUserMovie(movie: Movie): Partial<DBUserMovie> {
  return {
    beta: movie.beta,
    total_wins: movie.totalWins,
    total_losses: movie.totalLosses,
    total_comparisons: movie.totalComparisons,
    times_shown: movie.timesShown,
    last_shown_at: movie.lastShownAt || null,
    status: movie.status,
  };
}

// ============================================
// RECOMMENDATION FEEDBACK OPERATIONS
// ============================================

export async function upsertRecommendationFeedback(
  userId: string,
  movieId: string,
  action: 'dismissed' | 'seen_it' | 'watchlisted'
): Promise<boolean> {
  const { error } = await supabase
    .from('recommendation_feedback')
    .upsert({
      user_id: userId,
      movie_id: movieId,
      action,
    }, {
      onConflict: 'user_id,movie_id',
    });

  if (error) {
    // Silently ignore foreign key errors - movie may not exist in catalog
    if (error.code === '23503') {
      return true;
    }
    console.error('[DB] Failed to upsert recommendation feedback:', error);
    return false;
  }

  return true;
}

export async function getDismissedMovieIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('recommendation_feedback')
    .select('movie_id')
    .eq('user_id', userId);

  if (error) {
    console.error('[DB] Failed to get dismissed movie IDs:', error);
    return [];
  }

  return (data || []).map(row => row.movie_id);
}
