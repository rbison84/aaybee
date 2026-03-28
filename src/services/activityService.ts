import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export type ActivityType =
  | 'ranked_movie'      // User's movie entered/changed position in top 10
  | 'added_watchlist'   // User added movie to watchlist
  | 'joined'            // User created account
  | 'milestone'         // User hit comparison milestone
  | 'vs_challenge';     // User sent or completed a vs challenge

export interface Activity {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  movie_id: string | null;
  rank_position: number | null;
  metadata: {
    movie_title?: string;
    movie_year?: number;
    poster_url?: string;
    milestone_count?: number;
    previous_rank?: number;
    challenged_name?: string;
    challenge_code?: string;
    score?: number;
  } | null;
  created_at: string;
  // Joined from profiles
  user?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface FriendComparison {
  friend_id: string;
  friend_name: string;
  agreement_count: number;
  disagreement_count: number;
  last_calculated: string;
}

// ============================================
// ACTIVITY SERVICE
// ============================================

export const activityService = {
  /**
   * Get activity feed for a user's friends
   */
  getFriendsActivity: async (userId: string, limit = 50): Promise<Activity[]> => {
    if (!userId) return [];
    try {
      // Get friend IDs first
      const { data: friendships, error: friendError } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (friendError) {
        console.error('[Activity] Failed to fetch friendships:', friendError);
        return [];
      }

      if (!friendships || friendships.length === 0) return [];

      // Extract friend IDs
      const friendIds = friendships.map(f =>
        f.user_id === userId ? f.friend_id : f.user_id
      );

      // Get activities from friends (without join to avoid FK issues)
      const { data: activities, error } = await supabase
        .from('user_activity')
        .select('*')
        .in('user_id', friendIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[Activity] Failed to fetch activities:', error);
        return [];
      }

      if (!activities || activities.length === 0) return [];

      // Get unique user IDs from activities
      const activityUserIds = [...new Set(activities.map(a => a.user_id))];

      // Fetch profiles separately
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', activityUserIds);

      // Create a map for quick lookup
      const profileMap = new Map(
        (profiles || []).map(p => [p.id, { display_name: p.display_name, avatar_url: null }])
      );

      // Combine activities with profile data
      return activities.map(a => ({
        ...a,
        user: profileMap.get(a.user_id) || null,
      }));
    } catch (error) {
      console.error('[Activity] Error fetching friends activity:', error);
      return [];
    }
  },

  /**
   * Log a new activity
   */
  logActivity: async (
    userId: string,
    activityType: ActivityType,
    movieId?: string,
    rankPosition?: number,
    metadata?: Activity['metadata']
  ): Promise<boolean> => {
    if (!userId) {
      console.warn('[Activity] logActivity called without userId');
      return false;
    }
    try {
      const { error } = await supabase
        .from('user_activity')
        .insert({
          user_id: userId,
          activity_type: activityType,
          movie_id: movieId || null,
          rank_position: rankPosition || null,
          metadata: metadata || null,
        });

      if (error) {
        console.error('[Activity] Failed to log activity:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Activity] Error logging activity:', error);
      return false;
    }
  },

  /**
   * Log when a movie enters or changes position in top 10
   */
  logRankChange: async (
    userId: string,
    movieId: string,
    movieTitle: string,
    movieYear: number,
    newRank: number,
    previousRank?: number
  ): Promise<boolean> => {
    // Only log if it's a top 10 movie
    if (newRank > 10) return false;

    // Don't log if rank hasn't changed
    if (previousRank === newRank) return false;

    return activityService.logActivity(
      userId,
      'ranked_movie',
      movieId,
      newRank,
      {
        movie_title: movieTitle,
        movie_year: movieYear,
        previous_rank: previousRank,
      }
    );
  },

  /**
   * Log when user adds movie to watchlist
   */
  logWatchlistAdd: async (
    userId: string,
    movieId: string,
    movieTitle: string,
    movieYear: number
  ): Promise<boolean> => {
    return activityService.logActivity(
      userId,
      'added_watchlist',
      movieId,
      undefined,
      {
        movie_title: movieTitle,
        movie_year: movieYear,
      }
    );
  },

  /**
   * Log when user creates account
   */
  logJoined: async (userId: string): Promise<boolean> => {
    return activityService.logActivity(userId, 'joined');
  },

  /**
   * Log milestone achievements
   */
  logMilestone: async (userId: string, comparisonCount: number): Promise<boolean> => {
    const milestones = [50, 100, 250, 500, 1000];
    if (!milestones.includes(comparisonCount)) return false;

    return activityService.logActivity(
      userId,
      'milestone',
      undefined,
      undefined,
      { milestone_count: comparisonCount }
    );
  },

  /**
   * Log when user sends or completes a vs challenge
   */
  logVsChallenge: async (
    userId: string,
    challengedName: string,
    challengeCode: string,
    score?: number
  ): Promise<boolean> => {
    return activityService.logActivity(
      userId,
      'vs_challenge',
      undefined,
      undefined,
      { challenged_name: challengedName, challenge_code: challengeCode, score }
    );
  },

  /**
   * Format activity for display
   */
  formatActivity: (activity: Activity): { text: string; emoji: string } => {
    const userName = activity.user?.display_name || 'Someone';

    switch (activity.activity_type) {
      case 'ranked_movie':
        return {
          text: `${userName} ranked ${activity.metadata?.movie_title} #${activity.rank_position}`,
          emoji: '🏆',
        };

      case 'added_watchlist':
        return {
          text: `${userName} added ${activity.metadata?.movie_title} to their watchlist`,
          emoji: '📌',
        };

      case 'joined':
        return {
          text: `${userName} just joined Aaybee!`,
          emoji: '🎉',
        };

      case 'milestone':
        return {
          text: `${userName} hit ${activity.metadata?.milestone_count} comparisons!`,
          emoji: '🔥',
        };

      case 'vs_challenge':
        if (activity.metadata?.score !== undefined) {
          return {
            text: `${userName} scored ${activity.metadata.score}/10 vs ${activity.metadata.challenged_name}`,
            emoji: '⚔️',
          };
        }
        return {
          text: `${userName} challenged ${activity.metadata?.challenged_name} to vs`,
          emoji: '⚔️',
        };

      default:
        return {
          text: `${userName} did something`,
          emoji: '✨',
        };
    }
  },

  /**
   * Format timestamp for display
   */
  formatTimestamp: (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
};

export default activityService;
