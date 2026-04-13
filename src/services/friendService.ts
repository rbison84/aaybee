import { supabase } from './supabase';
import { calculateSmartCorrelation } from '../utils/correlationUtils';
import { getMovies } from './movieCache';
import { notificationService } from './notificationService';

// ============================================
// TYPES
// ============================================

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
}

export interface FriendProfile {
  id: string;
  display_name: string;
  total_comparisons: number;
  favorite_genres: string[];
}

export interface FriendWithProfile extends Friendship {
  friend: FriendProfile;
  taste_match?: number; // R² percentage
  top_movies?: string[];
}

export interface FriendRequest {
  id: string;
  from_user: FriendProfile;
  created_at: string;
}

export interface UserSearchResult {
  id: string;
  display_name: string;
  total_comparisons: number;
  is_friend: boolean;
  request_pending: boolean;
}

export interface FriendRanking {
  movie_id: string;
  title: string;
  year: number;
  beta: number;
  rank: number;
  poster_url?: string;
  genres?: string[];
  director?: string;
  your_rank?: number;
  your_beta?: number;
  agreement?: 'match' | 'different' | 'unseen';
}

export interface FriendComparison {
  friend: FriendProfile;
  taste_match: number;
  total_common_movies: number;
  agreements: number;
  disagreements: number;
  biggest_agreement?: { title: string; friend_rank: number; your_rank: number };
  biggest_disagreement?: { title: string; friend_rank: number; your_rank: number };
}

// ============================================
// FRIEND SERVICE
// ============================================

export const friendService = {
  /**
   * Send a friend request to another user
   */
  sendFriendRequest: async (friendId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      if (user.id === friendId) {
        return { success: false, error: "You can't add yourself as a friend" };
      }

      // Check if friendship already exists
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .single();

      if (existing) {
        if (existing.status === 'accepted') {
          return { success: false, error: 'Already friends' };
        }
        if (existing.status === 'pending') {
          return { success: false, error: 'Friend request already pending' };
        }
        if (existing.status === 'blocked') {
          return { success: false, error: 'Unable to send request' };
        }
      }

      // Create friend request
      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: user.id,
          friend_id: friendId,
          status: 'pending',
        });

      if (error) {
        console.error('[FriendService] Send request error:', error);
        return { success: false, error: 'Failed to send request' };
      }

      // Notify the target user
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Someone';
      notificationService.notifyFriendRequest(friendId, displayName).catch(() => {});

      return { success: true };
    } catch (error) {
      console.error('[FriendService] Send request error:', error);
      return { success: false, error: 'An error occurred' };
    }
  },

  /**
   * Accept a friend request
   */
  acceptFriendRequest: async (friendshipId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

      if (error) {
        console.error('[FriendService] Accept request error:', error);
        return { success: false, error: 'Failed to accept request' };
      }

      return { success: true };
    } catch (error) {
      console.error('[FriendService] Accept request error:', error);
      return { success: false, error: 'An error occurred' };
    }
  },

  /**
   * Reject/decline a friend request
   */
  rejectFriendRequest: async (friendshipId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);

      if (error) {
        console.error('[FriendService] Reject request error:', error);
        return { success: false, error: 'Failed to reject request' };
      }

      return { success: true };
    } catch (error) {
      console.error('[FriendService] Reject request error:', error);
      return { success: false, error: 'An error occurred' };
    }
  },

  /**
   * Remove an existing friend
   */
  removeFriend: async (friendId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const { error } = await supabase
        .from('friendships')
        .delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

      if (error) {
        console.error('[FriendService] Remove friend error:', error);
        return { success: false, error: 'Failed to remove friend' };
      }

      return { success: true };
    } catch (error) {
      console.error('[FriendService] Remove friend error:', error);
      return { success: false, error: 'An error occurred' };
    }
  },

  /**
   * Get all accepted friends for a user
   */
  getFriends: async (userId: string): Promise<FriendWithProfile[]> => {
    if (!userId) {
      console.warn('[FriendService] getFriends called without userId');
      return [];
    }
    try {
      // Get friendships where user is either user_id or friend_id
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('*')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (error || !friendships) {
        console.error('[FriendService] Get friends error:', error);
        return [];
      }

      // Get the friend IDs (the other person in each friendship) - deduplicate
      const friendIdSet = new Set<string>();
      friendships.forEach(f => {
        const friendId = f.user_id === userId ? f.friend_id : f.user_id;
        friendIdSet.add(friendId);
      });
      const friendIds = Array.from(friendIdSet);

      if (friendIds.length === 0) return [];

      // Fetch friend profiles
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, total_comparisons, favorite_genres')
        .in('id', friendIds);

      if (!profiles) return [];

      // Combine friendships with profiles (deduplicated)
      const friendsWithProfiles: FriendWithProfile[] = friendIds.map(friendId => {
        const friendship = friendships.find(f =>
          f.user_id === friendId || f.friend_id === friendId
        );
        const profile = profiles.find(p => p.id === friendId);

        return {
          ...(friendship || {}),
          id: friendship?.id || friendId,
          user_id: userId,
          friend_id: friendId,
          status: 'accepted' as const,
          created_at: friendship?.created_at || new Date().toISOString(),
          updated_at: friendship?.updated_at || new Date().toISOString(),
          taste_match: (friendship as any)?.similarity_score || 0,
          friend: {
            id: friendId,
            display_name: profile?.display_name || 'Unknown User',
            total_comparisons: profile?.total_comparisons || 0,
            favorite_genres: profile?.favorite_genres || [],
          },
        };
      });

      // Sort by taste_match descending (best match first)
      friendsWithProfiles.sort((a, b) => (b.taste_match || 0) - (a.taste_match || 0));

      return friendsWithProfiles;
    } catch (error) {
      console.error('[FriendService] Get friends error:', error);
      return [];
    }
  },

  /**
   * Get pending friend requests (incoming)
   */
  getPendingRequests: async (userId: string): Promise<FriendRequest[]> => {
    if (!userId) {
      console.warn('[FriendService] getPendingRequests called without userId');
      return [];
    }
    try {
      const { data: requests, error } = await supabase
        .from('friendships')
        .select('id, user_id, created_at')
        .eq('friend_id', userId)
        .eq('status', 'pending');

      if (error || !requests) {
        console.error('[FriendService] Get pending requests error:', error);
        return [];
      }

      if (requests.length === 0) return [];

      // Get profiles of users who sent requests
      const userIds = requests.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, total_comparisons, favorite_genres')
        .in('id', userIds);

      return requests.map(r => {
        const profile = profiles?.find(p => p.id === r.user_id);
        return {
          id: r.id,
          from_user: {
            id: r.user_id,
            display_name: profile?.display_name || 'Unknown User',
            total_comparisons: profile?.total_comparisons || 0,
            favorite_genres: profile?.favorite_genres || [],
          },
          created_at: r.created_at,
        };
      });
    } catch (error) {
      console.error('[FriendService] Get pending requests error:', error);
      return [];
    }
  },

  /**
   * Get count of pending friend requests
   */
  getPendingRequestCount: async (userId: string): Promise<number> => {
    if (!userId) return 0;
    try {
      const { count, error } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('friend_id', userId)
        .eq('status', 'pending');

      if (error) {
        console.error('[FriendService] Get pending count error:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('[FriendService] Get pending count error:', error);
      return 0;
    }
  },

  /**
   * Search for users by display name
   */
  searchUsers: async (query: string, currentUserId: string): Promise<UserSearchResult[]> => {
    try {
      if (!query || query.length < 2) return [];

      // Search for users by display name
      const { data: users, error } = await supabase
        .from('user_profiles')
        .select('id, display_name, total_comparisons')
        .ilike('display_name', `%${query}%`)
        .neq('id', currentUserId)
        .limit(20);

      if (error || !users) {
        console.error('[FriendService] Search users error:', error);
        return [];
      }

      // Get existing friendships to mark friend status
      const userIds = users.map(u => u.id);
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .in('user_id', [...userIds, currentUserId])
        .in('friend_id', [...userIds, currentUserId]);

      return users.map(user => {
        const friendship = friendships?.find(f =>
          (f.user_id === currentUserId && f.friend_id === user.id) ||
          (f.friend_id === currentUserId && f.user_id === user.id)
        );

        return {
          id: user.id,
          display_name: user.display_name || 'Unknown User',
          total_comparisons: user.total_comparisons || 0,
          is_friend: friendship?.status === 'accepted',
          request_pending: friendship?.status === 'pending',
        };
      });
    } catch (error) {
      console.error('[FriendService] Search users error:', error);
      return [];
    }
  },

  /**
   * Get a friend's movie rankings
   */
  getFriendRankings: async (
    friendId: string,
    currentUserId?: string
  ): Promise<FriendRanking[]> => {
    if (!friendId) return [];
    try {
      // Get friend's movies
      const { data: friendMovies, error } = await supabase
        .from('user_movies')
        .select('movie_id, beta, total_comparisons')
        .eq('user_id', friendId)
        .eq('status', 'known')
        .order('beta', { ascending: false });

      if (error || !friendMovies) {
        console.error('[FriendService] Get friend rankings error:', error);
        return [];
      }

      // Get movie details
      const movieIds = friendMovies.map(m => m.movie_id);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title, year, poster_url, genres, tmdb_data')
        .in('id', movieIds);

      // Get local movie cache for director info fallback
      let localMovieCache = new Map<string, { directorName?: string }>();
      try {
        const cachedMovies = await getMovies();
        cachedMovies.forEach(m => {
          localMovieCache.set(m.id, { directorName: m.directorName });
        });
      } catch (e) {
        // Ignore cache errors
      }

      // Get current user's rankings for comparison
      let userMoviesMap = new Map<string, { beta: number; rank: number }>();
      if (currentUserId) {
        const { data: userMovies } = await supabase
          .from('user_movies')
          .select('movie_id, beta')
          .eq('user_id', currentUserId)
          .eq('status', 'known')
          .order('beta', { ascending: false });

        if (userMovies) {
          userMovies.forEach((m, i) => {
            userMoviesMap.set(m.movie_id, { beta: m.beta, rank: i + 1 });
          });
        }
      }

      // Build rankings with comparison data
      return friendMovies.map((fm, index) => {
        const movie = movies?.find(m => m.id === fm.movie_id);
        const userMovie = userMoviesMap.get(fm.movie_id);

        let agreement: 'match' | 'different' | 'unseen' = 'unseen';
        if (userMovie) {
          const rankDiff = Math.abs((index + 1) - userMovie.rank);
          agreement = rankDiff <= 5 ? 'match' : 'different';
        }

        // Extract director from tmdb_data, fallback to local cache
        const credits = movie?.tmdb_data?.credits;
        let director = credits?.crew?.find((c: any) => c.job === 'Director')?.name;
        if (!director) {
          director = localMovieCache.get(fm.movie_id)?.directorName;
        }

        return {
          movie_id: fm.movie_id,
          title: movie?.title || 'Unknown Movie',
          year: movie?.year || 0,
          poster_url: movie?.poster_url,
          genres: movie?.genres,
          director,
          beta: fm.beta,
          rank: index + 1,
          your_rank: userMovie?.rank,
          your_beta: userMovie?.beta,
          agreement,
        };
      });
    } catch (error) {
      console.error('[FriendService] Get friend rankings error:', error);
      return [];
    }
  },

  /**
   * Calculate taste match percentage with a friend
   * Uses SMART correlation: only top 15 movies with weighted ranks
   */
  calculateTasteMatch: async (userId: string, friendId: string): Promise<number> => {
    if (!userId || !friendId) return 0;
    try {
      // Use smart correlation (top 15, weighted, min 8 overlap)
      const result = await calculateSmartCorrelation(userId, friendId);

      if (!result) {
        return 0; // Insufficient overlap
      }

      // Convert R² to percentage (0-100)
      return Math.round(result.rSquared * 100);
    } catch (error) {
      console.error('[FriendService] Calculate taste match error:', error);
      return 0;
    }
  },

  /**
   * Get detailed comparison with a friend
   */
  getFriendComparison: async (
    userId: string,
    friendId: string
  ): Promise<FriendComparison | null> => {
    if (!userId || !friendId) return null;
    try {
      // Get friend profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, display_name, total_comparisons, favorite_genres')
        .eq('id', friendId)
        .single();

      if (!profile) return null;

      // Get rankings for both users
      const [userRankings, friendRankings] = await Promise.all([
        friendService.getFriendRankings(userId),
        friendService.getFriendRankings(friendId, userId),
      ]);

      // Calculate stats
      const userMap = new Map(userRankings.map(r => [r.movie_id, r.rank]));
      let agreements = 0;
      let disagreements = 0;
      let biggestAgreeDiff = Infinity;
      let biggestDisagreeDiff = 0;
      let biggestAgree: { title: string; friend_rank: number; your_rank: number } | undefined;
      let biggestDisagree: { title: string; friend_rank: number; your_rank: number } | undefined;

      for (const fr of friendRankings) {
        const yourRank = userMap.get(fr.movie_id);
        if (yourRank !== undefined) {
          const diff = Math.abs(fr.rank - yourRank);

          if (diff <= 5) {
            agreements++;
            if (diff < biggestAgreeDiff) {
              biggestAgreeDiff = diff;
              biggestAgree = { title: fr.title, friend_rank: fr.rank, your_rank: yourRank };
            }
          } else {
            disagreements++;
            if (diff > biggestDisagreeDiff) {
              biggestDisagreeDiff = diff;
              biggestDisagree = { title: fr.title, friend_rank: fr.rank, your_rank: yourRank };
            }
          }
        }
      }

      const tasteMatch = await friendService.calculateTasteMatch(userId, friendId);

      return {
        friend: {
          id: profile.id,
          display_name: profile.display_name || 'Unknown User',
          total_comparisons: profile.total_comparisons || 0,
          favorite_genres: profile.favorite_genres || [],
        },
        taste_match: tasteMatch,
        total_common_movies: agreements + disagreements,
        agreements,
        disagreements,
        biggest_agreement: biggestAgree,
        biggest_disagreement: biggestDisagree,
      };
    } catch (error) {
      console.error('[FriendService] Get friend comparison error:', error);
      return null;
    }
  },

  /**
   * Get friends who ranked a specific movie
   */
  getFriendsWhoRankedMovie: async (
    userId: string,
    movieId: string
  ): Promise<{ friend: FriendProfile; rank: number; beta: number }[]> => {
    if (!userId || !movieId) return [];
    try {
      // Get user's friends
      const friends = await friendService.getFriends(userId);
      if (friends.length === 0) return [];

      const friendIds = friends.map(f => f.friend.id);

      // Get friends' rankings for this movie
      const { data: rankings } = await supabase
        .from('user_movies')
        .select('user_id, beta')
        .eq('movie_id', movieId)
        .eq('status', 'known')
        .in('user_id', friendIds);

      if (!rankings) return [];

      // Get each friend's rank for this movie
      const results: { friend: FriendProfile; rank: number; beta: number }[] = [];

      for (const ranking of rankings) {
        const friend = friends.find(f => f.friend.id === ranking.user_id);
        if (!friend) continue;

        // Get friend's rank for this movie
        const { count } = await supabase
          .from('user_movies')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', ranking.user_id)
          .eq('status', 'known')
          .gt('beta', ranking.beta);

        results.push({
          friend: friend.friend,
          rank: (count || 0) + 1,
          beta: ranking.beta,
        });
      }

      // Sort by rank
      results.sort((a, b) => a.rank - b.rank);

      return results;
    } catch (error) {
      console.error('[FriendService] Get friends who ranked movie error:', error);
      return [];
    }
  },

  /**
   * Get aggregated friend rankings (movies ranked by friends, combined)
   */
  getAggregatedFriendRankings: async (
    userId: string,
    limit: number = 50
  ): Promise<AggregatedFriendRanking[]> => {
    if (!userId) return [];
    try {
      // Get user's friends
      const friends = await friendService.getFriends(userId);
      if (friends.length === 0) return [];

      const friendIds = friends.map(f => f.friend.id);

      // Get all friend movie rankings
      const { data: friendMovies, error } = await supabase
        .from('user_movies')
        .select('movie_id, user_id, beta')
        .eq('status', 'known')
        .in('user_id', friendIds);

      if (error || !friendMovies) {
        console.error('[FriendService] Get friend movies error:', error);
        return [];
      }

      // Aggregate scores per movie
      const movieScores = new Map<string, { totalBeta: number; count: number; rankedBy: string[] }>();

      for (const fm of friendMovies) {
        const existing = movieScores.get(fm.movie_id) || { totalBeta: 0, count: 0, rankedBy: [] };
        existing.totalBeta += fm.beta;
        existing.count += 1;
        existing.rankedBy.push(fm.user_id);
        movieScores.set(fm.movie_id, existing);
      }

      // Convert to array and sort by average beta
      const sortedMovies = Array.from(movieScores.entries())
        .map(([movieId, stats]) => ({
          movieId,
          avgBeta: stats.totalBeta / stats.count,
          friendCount: stats.count,
          rankedBy: stats.rankedBy,
        }))
        .sort((a, b) => b.avgBeta - a.avgBeta)
        .slice(0, limit);

      if (sortedMovies.length === 0) return [];

      // Get movie details
      const movieIds = sortedMovies.map(m => m.movieId);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title, year, poster_url')
        .in('id', movieIds);

      // Get user's rankings for comparison
      const { data: userMovies } = await supabase
        .from('user_movies')
        .select('movie_id, beta')
        .eq('user_id', userId)
        .eq('status', 'known')
        .order('beta', { ascending: false });

      const userRankMap = new Map<string, number>();
      userMovies?.forEach((m, i) => userRankMap.set(m.movie_id, i + 1));

      // Build result
      const results: AggregatedFriendRanking[] = sortedMovies.map((m, index) => {
        const movie = movies?.find(mov => mov.id === m.movieId);
        const friendNames = m.rankedBy
          .map(fid => friends.find(f => f.friend.id === fid)?.friend.display_name)
          .filter(Boolean) as string[];

        return {
          movie_id: m.movieId,
          title: movie?.title || 'Unknown',
          year: movie?.year || 0,
          poster_url: movie?.poster_url,
          rank: index + 1,
          avg_beta: m.avgBeta,
          friend_count: m.friendCount,
          total_friends: friends.length,
          ranked_by: friendNames.slice(0, 3), // Top 3 friend names
          your_rank: userRankMap.get(m.movieId),
        };
      });

      return results;
    } catch (error) {
      console.error('[FriendService] Get aggregated rankings error:', error);
      return [];
    }
  },
};

// Additional type for aggregated rankings
export interface AggregatedFriendRanking {
  movie_id: string;
  title: string;
  year: number;
  poster_url?: string;
  rank: number;
  avg_beta: number;
  friend_count: number;
  total_friends: number;
  ranked_by: string[]; // Friend names who ranked this
  your_rank?: number;
}

export default friendService;
