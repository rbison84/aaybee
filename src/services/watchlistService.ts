import { supabase } from './supabase';
import { activityService } from './activityService';

// ============================================
// TYPES
// ============================================

export interface WatchlistItem {
  id: string;
  user_id: string;
  movie_id: string;
  added_at: string;
  source: 'recommendation' | 'manual' | 'friend';
  source_user_id?: string;
  source_user_name?: string;
  notes?: string;
}

export interface WatchlistMovie {
  id: string;
  movie_id: string;
  title: string;
  year: number;
  poster_url: string | null;
  added_at: string;
  source: 'recommendation' | 'manual' | 'friend';
  source_user_name?: string;
  is_rewatch: boolean;
}

// ============================================
// WATCHLIST SERVICE
// ============================================

export interface MovieDetails {
  title: string;
  year: number;
  posterUrl: string;
  genres?: string[];
}

export const watchlistService = {
  /**
   * Add a movie to the user's watchlist
   * If movieDetails is provided, upserts the movie to the movies table first
   */
  addToWatchlist: async (
    userId: string,
    movieId: string,
    source: 'recommendation' | 'manual' | 'friend' = 'manual',
    sourceUserId?: string,
    sourceUserName?: string,
    movieDetails?: MovieDetails,
    isRewatch?: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // If movie details provided, upsert to movies table first
      if (movieDetails) {
        const { error: upsertError } = await supabase
          .from('movies')
          .upsert({
            id: movieId,
            title: movieDetails.title,
            year: movieDetails.year,
            poster_url: movieDetails.posterUrl,
            genres: movieDetails.genres || [],
          }, { onConflict: 'id' });

        if (upsertError) {
          console.warn('[Watchlist] Movie upsert warning:', upsertError);
          // Continue anyway - watchlist entry still useful
        }
      }

      // Check if already in watchlist
      const { data: existing } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .maybeSingle();

      if (existing) {
        // If caller wants rewatch and existing row isn't, upgrade it
        if (isRewatch) {
          await supabase
            .from('watchlist')
            .update({ is_rewatch: true })
            .eq('id', existing.id)
            .then(({ error }) => {
              if (error) console.warn('[Watchlist] is_rewatch update skipped (column may not exist yet)');
            });
        }
        return { success: true }; // Already in watchlist
      }

      const insertPayload: Record<string, any> = {
        user_id: userId,
        movie_id: movieId,
        source,
        source_user_id: sourceUserId,
        source_user_name: sourceUserName,
      };
      // Only include is_rewatch when true to stay compatible before migration
      if (isRewatch) {
        insertPayload.is_rewatch = true;
      }

      const { error } = await supabase.from('watchlist').insert(insertPayload);

      if (error) {
        console.error('[Watchlist] Add error:', error);
        return { success: false, error: error.message };
      }

      // Log activity
      const title = movieDetails?.title;
      const year = movieDetails?.year;

      if (title && year) {
        activityService.logWatchlistAdd(userId, movieId, title, year).catch(console.error);
      } else {
        // Fallback: get movie details from database
        const { data: movie } = await supabase
          .from('movies')
          .select('title, year')
          .eq('id', movieId)
          .single();

        if (movie) {
          activityService.logWatchlistAdd(userId, movieId, movie.title, movie.year).catch(console.error);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[Watchlist] Add error:', error);
      return { success: false, error: 'Failed to add to watchlist' };
    }
  },

  /**
   * Remove a movie from the user's watchlist
   */
  removeFromWatchlist: async (
    userId: string,
    movieId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('movie_id', movieId);

      if (error) {
        console.error('[Watchlist] Remove error:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('[Watchlist] Remove error:', error);
      return { success: false, error: 'Failed to remove from watchlist' };
    }
  },

  /**
   * Get user's watchlist
   */
  getWatchlist: async (userId: string): Promise<WatchlistMovie[]> => {
    try {
      const { data: watchlistItems, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });

      if (error || !watchlistItems) {
        console.error('[Watchlist] Get error:', error);
        return [];
      }

      if (watchlistItems.length === 0) return [];

      // Get movie details
      const movieIds = watchlistItems.map(item => item.movie_id);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title, year, poster_url')
        .in('id', movieIds);

      const movieMap = new Map(movies?.map(m => [m.id, m]) || []);

      return watchlistItems.map(item => {
        const movie = movieMap.get(item.movie_id);
        return {
          id: item.id,
          movie_id: item.movie_id,
          title: movie?.title || 'Unknown Movie',
          year: movie?.year || 0,
          poster_url: movie?.poster_url || null,
          added_at: item.added_at,
          source: item.source,
          source_user_name: item.source_user_name,
          is_rewatch: item.is_rewatch || false,
        };
      });
    } catch (error) {
      console.error('[Watchlist] Get error:', error);
      return [];
    }
  },

  /**
   * Check if a movie is in the user's watchlist
   */
  isInWatchlist: async (userId: string, movieId: string): Promise<boolean> => {
    try {
      const { data } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', userId)
        .eq('movie_id', movieId)
        .maybeSingle();

      return !!data;
    } catch {
      return false;
    }
  },

  /**
   * Get watchlist count
   */
  getWatchlistCount: async (userId: string): Promise<number> => {
    try {
      const { count } = await supabase
        .from('watchlist')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      return count || 0;
    } catch {
      return 0;
    }
  },
};

export default watchlistService;
