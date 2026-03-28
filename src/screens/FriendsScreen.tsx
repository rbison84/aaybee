import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Share,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/useAppStore';
import { useMovieDetail } from '../contexts/MovieDetailContext';
import { useAlert } from '../contexts/AlertContext';
import { friendService, FriendWithProfile, FriendRequest, UserSearchResult, FriendRanking } from '../services/friendService';
import { activityService, Activity } from '../services/activityService';
import { vsService, VsChallenge } from '../services/vsService';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { CinematicBackground, CinematicButton } from '../components/cinematic';
import { UnderlineTabs } from '../components/UnderlineTabs';
import { Genre } from '../types';

type TabType = 'find' | 'vs' | 'invite';

interface FriendsScreenProps {
  onNavigateToRankings?: () => void;
  onClose?: () => void;
  onOpenVsChallenge?: (code: string) => void;
}

const genreLabels: Record<Genre, string> = {
  action: 'action',
  comedy: 'comedy',
  drama: 'drama',
  scifi: 'sci-fi',
  romance: 'romance',
  thriller: 'thriller',
  animation: 'animation',
  horror: 'horror',
  adventure: 'adventure',
  fantasy: 'fantasy',
};

// ============================================
// FRIEND PROFILE MODAL
// ============================================

interface FriendProfileModalProps {
  visible: boolean;
  onClose: () => void;
  friend: FriendWithProfile | null;
  currentUserId: string;
  onChallenge?: (friendId: string, friendName: string) => void;
}

function FriendProfileModal({ visible, onClose, friend, currentUserId, onChallenge }: FriendProfileModalProps) {
  const { openMovieDetail } = useMovieDetail();
  const [rankings, setRankings] = useState<FriendRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (visible && friend) {
      setIsLoading(true);
      friendService.getFriendRankings(friend.friend_id, currentUserId)
        .then(setRankings)
        .finally(() => setIsLoading(false));
    }
  }, [visible, friend?.friend_id, currentUserId]);

  const topMovies = rankings.slice(0, 3);

  // Calculate top genres and directors from rankings
  const { topGenres, topDirectors } = useMemo(() => {
    const genreCount = new Map<string, number>();
    const directorCount = new Map<string, number>();
    rankings.slice(0, 20).forEach((movie, index) => {
      const points = Math.max(1, 21 - (index + 1));
      movie.genres?.forEach(g => genreCount.set(g, (genreCount.get(g) || 0) + points));
      if (movie.director) directorCount.set(movie.director, (directorCount.get(movie.director) || 0) + points);
    });
    return {
      topGenres: [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]),
      topDirectors: [...directorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]),
    };
  }, [rankings]);

  const handleMoviePress = useCallback((movie: FriendRanking) => {
    openMovieDetail({
      id: movie.movie_id,
      title: movie.title,
      year: movie.year,
      genres: (movie.genres || []) as Genre[],
      posterUrl: movie.poster_url || '',
      posterColor: '#1A1A1E',
      beta: 0,
      totalWins: 0,
      totalLosses: 0,
      totalComparisons: 0,
      timesShown: 0,
      lastShownAt: 0,
      status: 'uncompared',
    });
  }, [openMovieDetail]);

  if (!friend || !visible) return null;

  return (
    <View style={profileStyles.overlay}>
        {/* Header with name and close button */}
        <View style={profileStyles.header}>
          <Text style={profileStyles.profileName}>{friend.friend?.display_name || 'profile'}</Text>
          <Pressable style={profileStyles.closeButton} onPress={onClose}>
            <Text style={profileStyles.closeButtonText}>×</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={profileStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <ScrollView style={profileStyles.scrollView} showsVerticalScrollIndicator={false}>

            {/* TOP 3 FILMS */}
            <Animated.View entering={FadeInDown.delay(50)} style={profileStyles.section}>
              <Text style={profileStyles.sectionTitle}>top 3</Text>
              {topMovies.length >= 3 ? (
                <View style={profileStyles.top3Container}>
                  {topMovies.map((movie, index) => (
                    <Pressable
                      key={movie.movie_id}
                      style={profileStyles.top3Item}
                      onPress={() => handleMoviePress(movie)}
                    >
                      <View style={profileStyles.posterContainer}>
                        {movie.poster_url ? (
                          <Image source={{ uri: movie.poster_url }} style={profileStyles.posterImage} />
                        ) : (
                          <View style={[profileStyles.posterImage, profileStyles.posterFallback]}>
                            <Text style={profileStyles.posterFallbackText}>{movie.title.slice(0, 2)}</Text>
                          </View>
                        )}
                        <View style={[
                          profileStyles.rankBadge,
                          index === 0 && profileStyles.rankBadgeGold,
                          index === 1 && profileStyles.rankBadgeSilver,
                          index === 2 && profileStyles.rankBadgeBronze,
                        ]}>
                          <Text style={profileStyles.rankBadgeText}>#{index + 1}</Text>
                        </View>
                      </View>
                      <Text style={profileStyles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                      <Text style={profileStyles.movieYear}>{movie.year}</Text>
                      {movie.your_rank && (
                        <Text style={profileStyles.yourRank}>you: #{movie.your_rank}</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={profileStyles.emptyState}>
                  <Text style={profileStyles.emptyText}>not enough movies ranked yet</Text>
                </View>
              )}
            </Animated.View>

            {/* TASTE MATCH */}
            {friend.taste_match !== undefined && friend.taste_match !== null && (
              <Animated.View entering={FadeInDown.delay(100)} style={profileStyles.section}>
                <Text style={profileStyles.sectionTitle}>taste match</Text>
                <View style={profileStyles.matchContainer}>
                  <Text style={[
                    profileStyles.matchPercent,
                    friend.taste_match >= 70 && profileStyles.matchHigh
                  ]}>
                    {friend.taste_match}%
                  </Text>
                  <Text style={profileStyles.matchLabel}>
                    {friend.taste_match >= 80 ? 'cinema soulmates!' :
                     friend.taste_match >= 60 ? 'similar taste' :
                     friend.taste_match >= 40 ? 'some overlap' : 'different tastes'}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* TOP DIRECTORS */}
            {topDirectors.length > 0 && (
              <Animated.View entering={FadeInDown.delay(150)} style={profileStyles.section}>
                <Text style={profileStyles.sectionTitle}>top directors</Text>
                <View style={profileStyles.directorsContainer}>
                  {topDirectors.map((director, index) => (
                    <View key={director} style={profileStyles.directorRow}>
                      <View style={[
                        profileStyles.directorRank,
                        index === 0 && profileStyles.directorRankGold,
                        index === 1 && profileStyles.directorRankSilver,
                        index === 2 && profileStyles.directorRankBronze,
                      ]}>
                        <Text style={profileStyles.directorRankText}>#{index + 1}</Text>
                      </View>
                      <Text style={profileStyles.directorName}>{director}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* TOP GENRES */}
            {topGenres.length > 0 && (
              <Animated.View entering={FadeInDown.delay(200)} style={profileStyles.section}>
                <Text style={profileStyles.sectionTitle}>top genres</Text>
                <View style={profileStyles.tagsRow}>
                  {topGenres.map(g => (
                    <View key={g} style={profileStyles.tag}>
                      <Text style={profileStyles.tagText}>{genreLabels[g as Genre] || g}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* QUICK STATS */}
            <Animated.View entering={FadeInDown.delay(250)} style={profileStyles.section}>
              <Text style={profileStyles.sectionTitle}>stats</Text>
              <View style={profileStyles.statsGrid}>
                <View style={profileStyles.statCard}>
                  <Text style={profileStyles.statNumber}>{rankings.length}</Text>
                  <Text style={profileStyles.statLabel}>movies{'\n'}ranked</Text>
                </View>
                <View style={profileStyles.statCard}>
                  <Text style={profileStyles.statNumber}>{friend.friend?.total_comparisons || 0}</Text>
                  <Text style={profileStyles.statLabel}>comparisons</Text>
                </View>
              </View>
            </Animated.View>

            {/* CHALLENGE TO VS */}
            {onChallenge && (
              <Animated.View entering={FadeInDown.delay(300)} style={profileStyles.section}>
                <Pressable
                  style={profileStyles.challengeButton}
                  onPress={() => onChallenge(friend.friend_id, friend.friend?.display_name || 'Friend')}
                >
                  <Text style={profileStyles.challengeButtonText}>challenge to vs</Text>
                </Pressable>
              </Animated.View>
            )}

            <View style={profileStyles.bottomPadding} />
          </ScrollView>
        )}
    </View>
  );
}

const profileStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  profileName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.textMuted,
    lineHeight: 28,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  top3Container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  top3Item: {
    flex: 1,
    alignItems: 'center',
  },
  posterContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  posterImage: {
    width: 90,
    height: 135,
    borderRadius: borderRadius.lg,
  },
  posterFallback: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFallbackText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
  },
  rankBadge: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.card,
  },
  rankBadgeGold: {
    backgroundColor: colors.gold,
  },
  rankBadgeSilver: {
    backgroundColor: colors.silver,
  },
  rankBadgeBronze: {
    backgroundColor: colors.bronze,
  },
  rankBadgeText: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.background,
  },
  movieTitle: {
    ...typography.tiny,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 2,
  },
  movieYear: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },
  yourRank: {
    ...typography.tiny,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  matchContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  matchPercent: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  matchHigh: {
    color: colors.accent,
  },
  matchLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statNumber: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  bottomPadding: {
    height: spacing.xxxl,
  },
  challengeButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  challengeButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  tagText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  // Directors
  directorsContainer: {
    gap: spacing.sm,
  },
  directorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  directorRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directorRankGold: {
    backgroundColor: colors.gold,
  },
  directorRankSilver: {
    backgroundColor: colors.silver,
  },
  directorRankBronze: {
    backgroundColor: colors.bronze,
  },
  directorRankText: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.background,
  },
  directorName: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    flex: 1,
  },
});

// ============================================
// ACTIVITY ICONS (SVG)
// ============================================

function BookmarkIcon({ size = 16, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function StarIcon({ size = 20, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={color}
      />
    </Svg>
  );
}

function PersonPlusIcon({ size = 20, color = colors.textSecondary }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="9"
        cy="7"
        r="4"
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      <Path
        d="M2 21v-2a4 4 0 014-4h6a4 4 0 014 4v2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M19 8v6M16 11h6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SearchIcon({ size = 18, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="11"
        cy="11"
        r="7"
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      <Path
        d="M21 21l-4.35-4.35"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ============================================
// ACTIVITY CARD COMPONENTS
// ============================================

// Avatar component
function ActivityAvatar({ name }: { name: string }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <View style={activityStyles.avatar}>
      <Text style={activityStyles.avatarText}>{initial}</Text>
    </View>
  );
}

// Poster thumbnail
function ActivityPoster({ url, size = 'standard' }: { url?: string; size?: 'standard' | 'compact' }) {
  const isCompact = size === 'compact';
  const posterStyle = isCompact ? activityStyles.posterCompact : activityStyles.poster;

  if (!url) {
    return <View style={[posterStyle, activityStyles.posterPlaceholder]} />;
  }
  return <Image source={{ uri: url }} style={posterStyle} />;
}

// Ranking activity card
function RankingActivityCard({ activity, onMoviePress, onUserPress }: { activity: Activity; onMoviePress: () => void; onUserPress: () => void }) {
  const userName = activity.user?.display_name || 'Someone';
  const movieTitle = activity.metadata?.movie_title || 'a movie';
  const rank = activity.rank_position;
  const isTopRank = rank === 1;
  const timestamp = activityService.formatTimestamp(activity.created_at);

  return (
    <View style={activityStyles.card}>
      <Pressable onPress={onMoviePress}>
        <ActivityPoster url={activity.metadata?.poster_url} />
      </Pressable>
      <View style={activityStyles.cardContent}>
        <Pressable style={activityStyles.headerRow} onPress={onUserPress}>
          <ActivityAvatar name={userName} />
          <Text style={activityStyles.userName}>{userName}</Text>
        </Pressable>
        <Text style={activityStyles.actionText}>
          ranked <Text style={activityStyles.movieTitle} onPress={onMoviePress}>{movieTitle}</Text>{' '}
          <Text style={[activityStyles.rankText, isTopRank && activityStyles.rankTextGold]}>#{rank}</Text>
        </Text>
        <Text style={activityStyles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
}

// Watchlist activity card
function WatchlistActivityCard({ activity, onMoviePress, onUserPress }: { activity: Activity; onMoviePress: () => void; onUserPress: () => void }) {
  const userName = activity.user?.display_name || 'Someone';
  const movieTitle = activity.metadata?.movie_title || 'a movie';
  const timestamp = activityService.formatTimestamp(activity.created_at);

  return (
    <View style={activityStyles.card}>
      <Pressable style={activityStyles.posterWithIcon} onPress={onMoviePress}>
        <ActivityPoster url={activity.metadata?.poster_url} />
        <View style={activityStyles.pinIcon}>
          <BookmarkIcon size={12} color={colors.accent} />
        </View>
      </Pressable>
      <View style={activityStyles.cardContent}>
        <Pressable style={activityStyles.headerRow} onPress={onUserPress}>
          <ActivityAvatar name={userName} />
          <Text style={activityStyles.userName}>{userName}</Text>
        </Pressable>
        <Text style={activityStyles.actionText}>
          added <Text style={activityStyles.movieTitle} onPress={onMoviePress}>{movieTitle}</Text> to watchlist
        </Text>
        <Text style={activityStyles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
}

// Milestone activity card
function MilestoneActivityCard({ activity, onUserPress }: { activity: Activity; onUserPress: () => void }) {
  const userName = activity.user?.display_name || 'Someone';
  const count = activity.metadata?.milestone_count || 0;
  const timestamp = activityService.formatTimestamp(activity.created_at);

  return (
    <View style={[activityStyles.card, activityStyles.milestoneCard]}>
      <View style={activityStyles.milestoneIcon}>
        <StarIcon size={24} color={colors.accent} />
      </View>
      <View style={activityStyles.cardContent}>
        <Pressable style={activityStyles.headerRow} onPress={onUserPress}>
          <ActivityAvatar name={userName} />
          <Text style={activityStyles.userName}>{userName}</Text>
        </Pressable>
        <Text style={activityStyles.actionText}>
          hit <Text style={activityStyles.milestoneCount}>{count} comparisons</Text>
        </Text>
        <Text style={activityStyles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
}

// Joined activity card
function JoinedActivityCard({ activity, onUserPress }: { activity: Activity; onUserPress: () => void }) {
  const userName = activity.user?.display_name || 'Someone';
  const timestamp = activityService.formatTimestamp(activity.created_at);

  return (
    <View style={activityStyles.card}>
      <View style={activityStyles.joinedIcon}>
        <PersonPlusIcon size={24} color={colors.textSecondary} />
      </View>
      <View style={activityStyles.cardContent}>
        <Pressable style={activityStyles.headerRow} onPress={onUserPress}>
          <ActivityAvatar name={userName} />
          <Text style={activityStyles.userName}>{userName}</Text>
        </Pressable>
        <Text style={activityStyles.actionText}>just joined aaybee</Text>
        <Text style={activityStyles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
}

// Vs Challenge activity card
function VsChallengeActivityCard({ activity, onUserPress }: { activity: Activity; onUserPress: () => void }) {
  const userName = activity.user?.display_name || 'Someone';
  const challengedName = activity.metadata?.challenged_name || 'someone';
  const score = activity.metadata?.score;
  const timestamp = activityService.formatTimestamp(activity.created_at);

  return (
    <View style={activityStyles.card}>
      <View style={activityStyles.vsIcon}>
        <Text style={{ fontSize: 24 }}>⚔️</Text>
      </View>
      <View style={activityStyles.cardContent}>
        <Pressable style={activityStyles.headerRow} onPress={onUserPress}>
          <ActivityAvatar name={userName} />
          <Text style={activityStyles.userName}>{userName}</Text>
        </Pressable>
        <Text style={activityStyles.actionText}>
          {score !== undefined
            ? <>scored <Text style={activityStyles.milestoneCount}>{score}/10</Text> vs {challengedName}</>
            : <>challenged <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{challengedName}</Text> to vs</>
          }
        </Text>
        <Text style={activityStyles.timestamp}>{timestamp}</Text>
      </View>
    </View>
  );
}

// Activity card styles
const activityStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 100,
    alignItems: 'center',
    overflow: 'hidden',
  },
  milestoneCard: {
    // Same as regular card
  },
  poster: {
    width: 50,
    height: 75,
    borderRadius: borderRadius.sm,
    marginRight: spacing.md,
  },
  posterCompact: {
    width: 40,
    height: 60,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  posterPlaceholder: {
    backgroundColor: colors.card,
  },
  posterWithIcon: {
    position: 'relative',
  },
  pinIcon: {
    position: 'absolute',
    bottom: -4,
    right: spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.background,
  },
  userName: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  actionText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  movieTitle: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  rankText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rankTextGold: {
    color: colors.accent,
  },
  timestamp: {
    ...typography.tiny,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
  },
  milestoneIcon: {
    width: 50,
    height: 75,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  milestoneText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  milestoneCount: {
    color: colors.accent,
    fontWeight: '700',
  },
  joinedIcon: {
    width: 50,
    height: 75,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  vsIcon: {
    width: 50,
    height: 75,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
});

// ============================================
// ACTIVITY TAB
// ============================================

interface ActivityTabProps {
  activities: Activity[];
  onMoviePress: (activity: Activity) => void;
  onUserPress: (activity: Activity) => void;
  onFindFriends: () => void;
  hasFriends: boolean;
}

function ActivityTab({ activities, onMoviePress, onUserPress, onFindFriends, hasFriends }: ActivityTabProps) {
  if (activities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{hasFriends ? 'no recent activity' : 'no activity yet'}</Text>
        <Text style={styles.emptyText}>
          {hasFriends ? 'your friends haven\'t been active recently' : 'add friends to see their movie activity!'}
        </Text>
        {!hasFriends && (
          <CinematicButton label="find friends" variant="primary" onPress={onFindFriends} />
        )}
      </View>
    );
  }

  const renderActivityCard = (activity: Activity) => {
    const handleMoviePress = () => onMoviePress(activity);
    const handleUserPress = () => onUserPress(activity);

    switch (activity.activity_type) {
      case 'ranked_movie':
        return <RankingActivityCard key={activity.id} activity={activity} onMoviePress={handleMoviePress} onUserPress={handleUserPress} />;
      case 'added_watchlist':
        return <WatchlistActivityCard key={activity.id} activity={activity} onMoviePress={handleMoviePress} onUserPress={handleUserPress} />;
      case 'milestone':
        return <MilestoneActivityCard key={activity.id} activity={activity} onUserPress={handleUserPress} />;
      case 'joined':
        return <JoinedActivityCard key={activity.id} activity={activity} onUserPress={handleUserPress} />;
      case 'vs_challenge':
        return <VsChallengeActivityCard key={activity.id} activity={activity} onUserPress={handleUserPress} />;
      default:
        return <RankingActivityCard key={activity.id} activity={activity} onMoviePress={handleMoviePress} onUserPress={handleUserPress} />;
    }
  };

  return (
    <View style={styles.tabContent}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {activities.map(renderActivityCard)}
      </ScrollView>
    </View>
  );
}

// ============================================
// FRIENDS TAB
// ============================================

interface FriendsTabProps {
  friends: FriendWithProfile[];
  onFriendPress: (friend: FriendWithProfile) => void;
  onRemoveFriend: (friendId: string) => void;
  onFindFriends: () => void;
  showAlert: (title: string, message?: string, buttons?: any[]) => void;
}

function FriendsTab({ friends, onFriendPress, onRemoveFriend, onFindFriends, showAlert }: FriendsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFriends = searchQuery
    ? friends.filter(f =>
        (f.friend?.display_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : friends;

  const handleRemove = (friend: FriendWithProfile) => {
    showAlert(
      'remove friend',
      `remove ${friend.friend?.display_name || 'this friend'}?`,
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'remove', style: 'destructive', onPress: () => onRemoveFriend(friend.friend_id) },
      ]
    );
  };

  if (friends.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>no friends yet</Text>
        <Text style={styles.emptyText}>add friends to see them here</Text>
        <CinematicButton label="find friends" variant="primary" onPress={onFindFriends} />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      {friends.length >= 10 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="search friends..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}
      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item.friend_id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            style={styles.friendRow}
            onPress={() => onFriendPress(item)}
            onLongPress={() => handleRemove(item)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.friend?.display_name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{item.friend?.display_name || 'unknown'}</Text>
              {item.taste_match !== undefined && item.taste_match !== null && (
                <Text style={[styles.friendMatch, item.taste_match >= 80 && styles.friendMatchHigh]}>
                  {item.taste_match}% taste match
                </Text>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>no friends found</Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================
// INVITATIONS TAB
// ============================================

interface InvitationsTabProps {
  requests: FriendRequest[];
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  loading: string | null;
}

function InvitationsTab({ requests, onAccept, onDecline, loading }: InvitationsTabProps) {
  if (requests.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>no invitations</Text>
        <Text style={styles.emptyText}>friend requests will appear here</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {requests.map((request) => (
        <View key={request.id} style={styles.invitationCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(request.from_user?.display_name || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.invitationInfo}>
            <Text style={styles.invitationName}>
              {request.from_user?.display_name || 'unknown'}
            </Text>
          </View>
          <View style={styles.invitationActions}>
            <CinematicButton
              label="accept"
              variant="primary"
              size="small"
              onPress={() => onAccept(request.id)}
              disabled={loading === request.id}
            />
            <Pressable
              style={styles.declineButton}
              onPress={() => onDecline(request.id)}
              disabled={loading === request.id}
            >
              <Text style={styles.declineText}>decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ============================================
// ADD TAB
// ============================================

interface AddTabProps {
  userId: string;
  onFriendAdded: () => void;
  showAlert: (title: string, message?: string, buttons?: any[]) => void;
}

function AddTab({ userId, onFriendAdded, showAlert }: AddTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await friendService.searchUsers(searchQuery, userId);
      setSearchResults(results);
    } catch (error) {
      console.error('[AddTab] Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (targetUserId: string) => {
    setSendingTo(targetUserId);
    try {
      const result = await friendService.sendFriendRequest(targetUserId);
      if (result.success) {
        showAlert('request sent', 'friend request sent!');
        setSearchResults(prev =>
          prev.map(u => u.id === targetUserId ? { ...u, request_pending: true } : u)
        );
        onFriendAdded();
      } else {
        showAlert('error', result.error || 'failed to send request');
      }
    } finally {
      setSendingTo(null);
    }
  };

  const handleShare = async () => {
    try {
      const msg = 'join me on aaybee - the movie ranking app!';
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: 'invite to aaybee', text: msg });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(msg);
        }
      } else {
        await Share.share({ message: msg, title: 'invite to aaybee' });
      }
    } catch (error) {
      console.error('[AddTab] Share error:', error);
    }
  };

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Card 1: Find Friends */}
      <View style={addStyles.card}>
        <Text style={addStyles.cardTitle}>find friends</Text>
        <View style={addStyles.searchInputContainer}>
          <SearchIcon size={18} color={colors.textMuted} />
          <TextInput
            style={addStyles.searchInput}
            placeholder="search by name or email"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Pressable
          style={[addStyles.amberButton, isSearching && addStyles.amberButtonDisabled]}
          onPress={handleSearch}
          disabled={isSearching}
        >
          <Text style={addStyles.amberButtonText}>
            {isSearching ? 'searching...' : 'search'}
          </Text>
        </Pressable>
      </View>

      {/* Search Results (outside card) */}
      {hasSearched && (
        <View style={addStyles.resultsSection}>
          {searchResults.length > 0 ? (
            searchResults.map((user) => (
              <View key={user.id} style={addStyles.resultRow}>
                <View style={addStyles.resultAvatar}>
                  <Text style={addStyles.resultAvatarText}>
                    {(user.display_name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={addStyles.resultInfo}>
                  <Text style={addStyles.resultName}>{user.display_name || 'Unknown'}</Text>
                </View>
                {user.is_friend ? (
                  <View style={addStyles.statusBadge}>
                    <Text style={addStyles.statusBadgeText}>friends</Text>
                  </View>
                ) : user.request_pending ? (
                  <View style={[addStyles.statusBadge, addStyles.pendingBadge]}>
                    <Text style={addStyles.statusBadgeText}>pending</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[addStyles.outlinedButton, sendingTo === user.id && addStyles.outlinedButtonDisabled]}
                    onPress={() => handleSendRequest(user.id)}
                    disabled={sendingTo === user.id}
                  >
                    <Text style={addStyles.outlinedButtonText}>add</Text>
                  </Pressable>
                )}
              </View>
            ))
          ) : (
            <View style={addStyles.noResults}>
              <Text style={addStyles.noResultsText}>no results found</Text>
            </View>
          )}
        </View>
      )}

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

// ============================================
// VS TAB
// ============================================

interface VsTabProps {
  userId: string;
  friends: FriendWithProfile[];
  showAlert: (title: string, message: string) => void;
  onOpenChallenge?: (code: string) => void;
}

function VsTab({ userId, friends, showAlert, onOpenChallenge }: VsTabProps) {
  const [challenges, setChallenges] = useState<VsChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChallenges = useCallback(async () => {
    setLoading(true);
    const data = await vsService.getMyChallenges(userId);
    setChallenges(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadChallenges(); }, [loadChallenges]);

  const handleChallengeFriend = async (friendId: string, friendName: string) => {
    setCreating(true);
    setError(null);
    const { challenge, error: err } = await vsService.createChallenge(userId, friendId, friendName);
    setCreating(false);
    if (err || !challenge) {
      setError(err || 'failed to create challenge');
      return;
    }
    showAlert('challenge sent', `code: ${challenge.code}`);
    loadChallenges();
  };

  const handleChallengeAnyone = async () => {
    setCreating(true);
    setError(null);
    const { challenge, error: err } = await vsService.createChallenge(userId, null);
    setCreating(false);
    if (err || !challenge) {
      setError(err || 'failed to create challenge');
      return;
    }
    const msg = `i challenged you on aaybee vs! join with code: ${challenge.code}\n\naaybee.netlify.app/vs/${challenge.code}`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ text: msg });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(msg);
          showAlert('copied', `challenge code: ${challenge.code}`);
        }
      } else {
        await Share.share({ message: msg });
      }
    } catch (e) {
      showAlert('challenge created', `share this code: ${challenge.code}`);
    }
    loadChallenges();
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setError(null);

    const { data: profile } = await (await import('../services/supabase')).supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    const { challenge, error: err } = await vsService.joinChallenge(
      joinCode.trim(), userId, profile?.display_name || 'Anonymous'
    );
    setJoining(false);
    if (err || !challenge) {
      setError(err || 'failed to join');
      return;
    }
    setJoinCode('');
    if (onOpenChallenge) {
      onOpenChallenge(challenge.code);
    } else {
      showAlert('joined!', 'challenge accepted — select your movies');
    }
    loadChallenges();
  };

  const getScoreColor = (score: number): string => {
    if (score >= 8) return '#22C55E';
    if (score >= 6) return '#86EFAC';
    if (score >= 4) return colors.warning;
    return colors.error;
  };

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Challenge a friend */}
      <View style={addStyles.card}>
        <Text style={addStyles.cardTitle}>challenge</Text>
        {friends.length > 0 ? (
          friends.map(f => (
            <Pressable
              key={f.friend.id}
              style={vsTabStyles.friendRow}
              onPress={() => handleChallengeFriend(f.friend.id, f.friend.display_name)}
              disabled={creating}
            >
              <View style={vsTabStyles.friendAvatar}>
                <Text style={vsTabStyles.friendAvatarText}>
                  {f.friend.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={vsTabStyles.friendName} numberOfLines={1}>{f.friend.display_name}</Text>
              <Text style={vsTabStyles.challengeAction}>challenge</Text>
            </Pressable>
          ))
        ) : (
          <Text style={addStyles.cardSubtitle}>add friends to challenge them</Text>
        )}

        <Pressable
          style={[vsTabStyles.anyoneButton, creating && addStyles.amberButtonDisabled]}
          onPress={handleChallengeAnyone}
          disabled={creating}
        >
          <Text style={vsTabStyles.anyoneButtonText}>
            {creating ? 'creating...' : 'challenge anyone (share code)'}
          </Text>
        </Pressable>
      </View>

      {/* Join by code */}
      <View style={addStyles.card}>
        <Text style={addStyles.cardTitle}>join a challenge</Text>
        <View style={vsTabStyles.codeRow}>
          <TextInput
            style={vsTabStyles.codeInput}
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder="enter code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={6}
          />
          <Pressable
            style={[addStyles.amberButton, vsTabStyles.joinButton, (!joinCode.trim() || joining) && addStyles.amberButtonDisabled]}
            onPress={handleJoin}
            disabled={!joinCode.trim() || joining}
          >
            <Text style={addStyles.amberButtonText}>{joining ? '...' : 'join'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Past challenges */}
      {!loading && challenges.length > 0 && (
        <View style={addStyles.card}>
          <Text style={addStyles.cardTitle}>your challenges</Text>
          {challenges.map(c => {
            const isActionable =
              (c.status === 'selecting' && c.challenged_id === userId) ||
              (c.status === 'challenged_comparing' && c.challenged_id === userId) ||
              (c.status === 'challenger_comparing' && c.challenger_id === userId);
            const statusText = c.status === 'complete'
              ? `score: ${c.score}/10`
              : c.status === 'pending'
                ? 'waiting for response'
                : (c.status === 'selecting' && c.challenged_id === userId)
                  ? 'tap to select movies'
                  : (c.status === 'challenged_comparing' && c.challenged_id === userId)
                    ? 'tap to make your picks'
                    : (c.status === 'challenger_comparing' && c.challenger_id === userId)
                      ? 'tap to make your picks'
                      : c.status === 'challenger_comparing'
                        ? 'waiting for them'
                        : c.status;
            return (
              <Pressable
                key={c.id}
                style={vsTabStyles.challengeRow}
                onPress={() => onOpenChallenge?.(c.code)}
                disabled={!onOpenChallenge}
              >
                <View style={{ flex: 1 }}>
                  <Text style={vsTabStyles.challengeTitle}>
                    {c.challenger_id === userId
                      ? `vs ${c.challenged_name || 'waiting...'}`
                      : `from ${c.results?.challengerName || 'someone'}`}
                  </Text>
                  <Text style={[vsTabStyles.challengeStatus, isActionable && { color: colors.accent, fontWeight: '600' }]}>
                    {statusText}
                  </Text>
                </View>
                {c.status === 'complete' && c.score !== null && (
                  <View style={[vsTabStyles.scoreBadge, { backgroundColor: getScoreColor(c.score) }]}>
                    <Text style={vsTabStyles.scoreBadgeText}>{c.score}/10</Text>
                  </View>
                )}
                {isActionable && (
                  <View style={[vsTabStyles.scoreBadge, { backgroundColor: colors.accent }]}>
                    <Text style={vsTabStyles.scoreBadgeText}>go</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}
      {error && (
        <View style={vsTabStyles.errorBox}>
          <Text style={vsTabStyles.errorText}>{error}</Text>
        </View>
      )}

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const vsTabStyles = StyleSheet.create({
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
  friendName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  challengeAction: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  anyoneButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  anyoneButtonText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    letterSpacing: 3,
    textAlign: 'center',
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinButton: {
    minWidth: 70,
    paddingHorizontal: spacing.lg,
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  challengeTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  challengeStatus: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  scoreBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  errorBox: {
    backgroundColor: 'rgba(252, 165, 165, 0.15)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
});

// ============================================
// INVITE TAB
// ============================================

interface InviteTabProps {
  showAlert: (title: string, message: string) => void;
}

function InviteTab({ showAlert }: InviteTabProps) {
  const handleShare = async () => {
    try {
      const msg = 'join me on aaybee — rank movies head-to-head and find your taste!\n\naaybee.netlify.app';
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: 'invite to aaybee', text: msg });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(msg);
          showAlert('copied', 'invite link copied to clipboard');
        }
      } else {
        await Share.share({ message: msg, title: 'invite to aaybee' });
      }
    } catch (error) {
      // Ignore
    }
  };

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={addStyles.card}>
        <Text style={addStyles.cardTitle}>invite</Text>
        <Text style={addStyles.cardSubtitle}>know someone who loves movies? get them on aaybee</Text>
        <Pressable style={addStyles.amberButton} onPress={handleShare}>
          <Text style={addStyles.amberButtonText}>share invite link</Text>
        </Pressable>
      </View>
      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

// Add Tab styles
const addStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.lg,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  amberButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  amberButtonDisabled: {
    opacity: 0.6,
  },
  amberButtonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
  resultsSection: {
    marginBottom: spacing.lg,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  resultAvatarText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  outlinedButton: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  outlinedButtonDisabled: {
    opacity: 0.5,
  },
  outlinedButtonText: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  pendingBadge: {
    backgroundColor: colors.accentSubtle,
  },
  statusBadgeText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '500',
  },
  noResults: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  noResultsText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

// ============================================
// MAIN SCREEN
// ============================================

// Back arrow icon
function BackArrowIcon({ color = colors.textSecondary }: { color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M5 12l7 7M5 12l7-7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FriendsScreen({ onNavigateToRankings, onClose, onOpenVsChallenge }: FriendsScreenProps) {
  const { user, isGuest } = useAuth();
  const { getRankedMovies, movies } = useAppStore();
  const { openMovieDetail } = useMovieDetail();
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<TabType>('find');


  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<FriendWithProfile | null>(null);

  // Tabs
  const tabs = useMemo(() => [
    { key: 'find' as const, label: 'find', badge: pendingRequests.length || undefined },
    { key: 'vs' as const, label: 'vs' },
    { key: 'invite' as const, label: 'invite' },
  ], [pendingRequests.length]);

  const loadData = useCallback(async () => {
    if (!user?.id || isGuest) {
      setIsLoading(false);
      return;
    }
    try {
      const [requestsData, friendsData, activityData] = await Promise.all([
        friendService.getPendingRequests(user.id),
        friendService.getFriends(user.id),
        activityService.getFriendsActivity(user.id),
      ]);
      setPendingRequests(requestsData);
      setFriends(friendsData);
      setActivities(activityData);
    } catch (error) {
      console.error('[FriendsScreen] Load error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isGuest]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleAcceptRequest = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      const result = await friendService.acceptFriendRequest(requestId);
      if (result.success) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        if (user?.id) {
          const updatedFriends = await friendService.getFriends(user.id);
          setFriends(updatedFriends);
        }
      } else {
        showAlert('error', result.error || 'failed to accept request');
      }
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      const result = await friendService.rejectFriendRequest(requestId);
      if (result.success) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      } else {
        showAlert('error', result.error || 'failed to decline request');
      }
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user?.id) return;
    try {
      const result = await friendService.removeFriend(friendId);
      if (result.success) {
        setFriends(prev => prev.filter(f => f.friend_id !== friendId));
      } else {
        showAlert('error', result.error || 'failed to remove friend');
      }
    } catch {
      showAlert('error', 'failed to remove friend');
    }
  };

  const handleActivityMoviePress = (activity: Activity) => {
    // If the activity has a movie, open the movie detail modal
    if (activity.movie_id && (activity.activity_type === 'ranked_movie' || activity.activity_type === 'added_watchlist')) {
      const storeMovie = movies.get(activity.movie_id);
      if (storeMovie) {
        openMovieDetail(storeMovie);
      } else {
        // Create a minimal movie object from activity metadata
        openMovieDetail({
          id: activity.movie_id,
          title: activity.metadata?.movie_title || 'Unknown',
          year: activity.metadata?.movie_year || 2000,
          genres: [],
          posterUrl: activity.metadata?.poster_url || '',
          posterColor: '#1A1A1E',
          beta: 0,
          totalWins: 0,
          totalLosses: 0,
          totalComparisons: 0,
          timesShown: 0,
          lastShownAt: 0,
          status: 'uncompared',
        });
      }
    }
  };

  const handleActivityUserPress = (activity: Activity) => {
    // Find the friend from the activity user_id and open their profile
    if (activity.user_id) {
      const friend = friends.find(f => f.friend_id === activity.user_id);
      if (friend) {
        setSelectedFriend(friend);
      } else {
        // Create a temporary friend object from activity data
        setSelectedFriend({
          id: activity.user_id,
          user_id: user?.id || '',
          friend_id: activity.user_id,
          status: 'accepted',
          created_at: '',
          updated_at: '',
          friend: {
            id: activity.user_id,
            display_name: activity.user?.display_name || 'Unknown',
            total_comparisons: 0,
            favorite_genres: [],
          },
        });
      }
    }
  };

  const handleFriendPress = (friend: FriendWithProfile) => {
    setSelectedFriend(friend);
  };

  // Guest state
  if (isGuest) {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.guestContainer}>
            <Text style={styles.guestTitle}>sign in required</Text>
            <Text style={styles.guestText}>create an account to add friends and see their activity</Text>
          </View>
        </View>
      </CinematicBackground>
    );
  }

  if (isLoading) {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </View>
      </CinematicBackground>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'find':
        return (
          <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
            {/* Search & add */}
            {user?.id && <AddTab userId={user.id} onFriendAdded={loadData} showAlert={showAlert} />}

            {/* Pending invitations */}
            {pendingRequests.length > 0 && (
              <View style={addStyles.card}>
                <Text style={addStyles.cardTitle}>invitations</Text>
                <InvitationsTab
                  requests={pendingRequests}
                  onAccept={handleAcceptRequest}
                  onDecline={handleDeclineRequest}
                  loading={processingRequest}
                />
              </View>
            )}

            {/* Friends list */}
            {friends.length > 0 && (
              <FriendsTab
                friends={friends}
                onFriendPress={handleFriendPress}
                onRemoveFriend={handleRemoveFriend}
                onFindFriends={() => {}}
                showAlert={showAlert}
              />
            )}

            {/* Activity */}
            {friends.length > 0 && activities.length > 0 && (
              <ActivityTab
                activities={activities}
                onMoviePress={handleActivityMoviePress}
                onUserPress={handleActivityUserPress}
                onFindFriends={() => {}}
                hasFriends={friends.length > 0}
              />
            )}
          </ScrollView>
        );
      case 'vs':
        return user?.id ? <VsTab userId={user.id} friends={friends} showAlert={showAlert} onOpenChallenge={onOpenVsChallenge} /> : null;
      case 'invite':
        return <InviteTab showAlert={showAlert} />;
      default:
        return null;
    }
  };

  return (
    <CinematicBackground>
      <View style={styles.container}>
        {/* Back arrow header when rendered as overlay from Profile */}
        {onClose && (
          <View style={styles.backHeader}>
            <Pressable style={styles.backButton} onPress={onClose}>
              <BackArrowIcon />
            </Pressable>
            <Text style={styles.backHeaderTitle}>friends</Text>
            <View style={styles.backHeaderSpacer} />
          </View>
        )}
        <UnderlineTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabPress={setActiveTab}
        />
        <Animated.View style={styles.contentContainer} entering={FadeIn.duration(150)}>
          {renderTabContent()}
        </Animated.View>

        {/* Friend Profile Modal */}
        {user?.id && (
          <FriendProfileModal
            visible={selectedFriend !== null}
            onClose={() => setSelectedFriend(null)}
            friend={selectedFriend}
            currentUserId={user.id}
            onChallenge={async (friendId, friendName) => {
              setSelectedFriend(null);
              const { challenge, error } = await vsService.createChallenge(user.id, friendId, friendName);
              if (error || !challenge) {
                showAlert('error', error || 'failed to create challenge');
                return;
              }
              showAlert('challenge sent', `code: ${challenge.code}`);
              setActiveTab('vs');
            }}
          />
        )}
      </View>
    </CinematicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  // Back header (when rendered from Profile)
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backHeaderTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  backHeaderSpacer: {
    width: 40,
  },

  // Loading & Guest
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    gap: spacing.md,
  },
  guestTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  guestText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  lockedIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  lockedTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  lockedText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  lockedAddSection: {
    flex: 1,
    width: '100%',
  },

  // Empty States
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Friends
  searchContainer: {
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  friendMatch: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  friendMatchHigh: {
    color: colors.accent,
  },

  // Invitations
  invitationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  invitationInfo: {
    flex: 1,
  },
  invitationName: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  invitationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  declineButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  declineText: {
    ...typography.tiny,
    color: colors.textMuted,
  },

});

export default FriendsScreen;
