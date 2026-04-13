import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../store/useAppStore';
import { useMovieDetail } from '../../contexts/MovieDetailContext';
// LockedFeatureContext removed
import { useHaptics } from '../../hooks/useHaptics';
import {
  friendService,
  AggregatedFriendRanking,
} from '../../services/friendService';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';
import { EmptyState } from '../EmptyState';

type FilterType = 'top25' | 'all';

// Traffic light colors matching app palette
const getComparisonColor = (rankDiff: number): string => {
  const absDiff = Math.abs(rankDiff);
  if (absDiff <= 3) return colors.success; // green - agreement
  if (absDiff <= 8) return '#8BC34A'; // light green
  if (absDiff <= 15) return colors.accent; // amber - neutral
  if (absDiff <= 25) return colors.warning; // orange
  return '#E57373'; // soft red - disagreement
};

// ============================================
// RANKING ITEM COMPONENT
// ============================================

interface RankingItemProps {
  item: AggregatedFriendRanking;
  onPress: () => void;
}

function RankingItem({ item, onPress }: RankingItemProps) {
  const isTopThree = item.rank <= 3;
  const hasYourRank = item.your_rank !== undefined;
  const rankDiff = hasYourRank ? item.your_rank! - item.rank : 0;

  const getComparisonText = () => {
    if (!hasYourRank) return null;
    if (Math.abs(rankDiff) <= 3) {
      return 'you agree with your friends';
    } else if (rankDiff > 0) {
      return `you ranked this ${rankDiff} spots lower`;
    } else {
      return `you ranked this ${Math.abs(rankDiff)} spots higher`;
    }
  };

  const comparisonText = getComparisonText();
  const comparisonColor = hasYourRank ? getComparisonColor(rankDiff) : colors.textMuted;

  return (
    <Pressable style={[styles.rankItem, isTopThree && styles.rankItemTop]} onPress={onPress}>
      {isTopThree ? (
        <View style={[
          styles.rankBadge,
          item.rank === 1 && styles.rankBadgeGold,
          item.rank === 2 && styles.rankBadgeSilver,
          item.rank === 3 && styles.rankBadgeBronze,
        ]}>
          <Text style={styles.rankNumberTop}>#{item.rank}</Text>
        </View>
      ) : (
        <View style={styles.rankBadgeMuted}>
          <Text style={styles.rankNumberMuted}>#{item.rank}</Text>
        </View>
      )}

      <View style={styles.posterThumb}>
        {item.poster_url ? (
          <Image source={{ uri: item.poster_url }} style={styles.posterImage} />
        ) : (
          <View style={styles.posterFallback}>
            <Text style={styles.posterFallbackText}>{item.title?.slice(0, 2) || '??'}</Text>
          </View>
        )}
      </View>

      <View style={styles.movieInfo}>
        <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.movieMeta}>{item.year || '—'}</Text>

        {hasYourRank ? (
          <View style={styles.yourRankRow}>
            <Text style={styles.yourRankText}>your #{item.your_rank}</Text>
            {comparisonText && (
              <Text style={[styles.comparisonText, { color: comparisonColor }]}>
                {' · '}{comparisonText}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.notRankedText}>not in your rankings</Text>
        )}
      </View>
    </Pressable>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

const MIN_COMPARISONS_FOR_TOP25 = 30;
const MIN_COMPARISONS_FOR_ALL = 85;

export function FriendsTab() {
  const { user, isGuest } = useAuth();
  const { movies, postOnboardingComparisons } = useAppStore();
  const { openMovieDetail } = useMovieDetail();
  // showLockedFeature removed
  const haptics = useHaptics();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rankings, setRankings] = useState<AggregatedFriendRanking[]>([]);
  const [friendCount, setFriendCount] = useState(0);

  const handleMoviePress = useCallback((item: AggregatedFriendRanking) => {
    // Try to find the full movie from the store
    const storeMovie = movies.get(item.movie_id);
    if (storeMovie) {
      openMovieDetail(storeMovie);
    } else {
      // Create a minimal movie object from ranking data
      openMovieDetail({
        id: item.movie_id,
        title: item.title || 'Unknown',
        year: item.year || 2000,
        genres: [],
        posterUrl: item.poster_url || '',
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
  }, [movies, openMovieDetail]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('top25');

  const filteredRankings = useMemo(() => {
    if (activeFilter === 'top25') return rankings.slice(0, 25);
    return rankings;
  }, [rankings, activeFilter]);

  const loadData = useCallback(async () => {
    if (!user?.id || isGuest) {
      setIsLoading(false);
      return;
    }

    try {
      const [rankingsData, friendsData] = await Promise.all([
        friendService.getAggregatedFriendRankings(user.id, 50),
        friendService.getFriends(user.id),
      ]);

      setRankings(rankingsData);
      setFriendCount(friendsData.length);
    } catch (error) {
      console.error('[FriendsTab] Load error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id, isGuest]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const renderItem = useCallback(({ item }: { item: AggregatedFriendRanking }) => (
    <RankingItem item={item} onPress={() => handleMoviePress(item)} />
  ), [handleMoviePress]);

  if (isGuest) {
    return (
      <EmptyState
        icon="👥"
        title="sign in to see friends' picks"
        subtitle="create an account to add friends and see their combined movie rankings"
      />
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (friendCount === 0) {
    return (
      <EmptyState
        icon="👋"
        title="no friends yet"
        subtitle="add friends from the friends tab to see their combined movie rankings here"
      />
    );
  }

  const filters: { key: FilterType; label: string; locked: boolean; unlockAt?: number }[] = [
    { key: 'top25', label: 'top 25', locked: postOnboardingComparisons < MIN_COMPARISONS_FOR_TOP25, unlockAt: MIN_COMPARISONS_FOR_TOP25 },
    { key: 'all', label: 'all', locked: postOnboardingComparisons < MIN_COMPARISONS_FOR_ALL, unlockAt: MIN_COMPARISONS_FOR_ALL },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {filters.map((filter) => (
          <Pressable
            key={filter.key}
            style={[styles.filterPill, activeFilter === filter.key && !filter.locked && styles.filterPillActive]}
            onPress={() => {
              {
                setActiveFilter(filter.key);
              }
            }}
          >
            <Text style={[
              styles.filterPillText,
              activeFilter === filter.key && !filter.locked && styles.filterPillTextActive,
              filter.locked && styles.filterPillTextLocked,
            ]}>
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filteredRankings}
        renderItem={renderItem}
        keyExtractor={(item) => item.movie_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textMuted}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>your friends haven't ranked any movies yet</Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 40,
    gap: spacing.xxl,
  },
  filterPill: {
    paddingVertical: spacing.xs,
  },
  filterPillActive: {},
  filterPillText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  filterPillTextLocked: {
    opacity: 0.4,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankItemTop: {
    borderColor: colors.accentSubtle,
  },
  rankBadge: {
    width: 36,
    height: 28,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
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
  rankBadgeMuted: {
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rankNumberTop: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.background,
  },
  rankNumberMuted: {
    ...typography.tiny,
    fontWeight: '600',
    color: colors.textMuted,
  },
  posterThumb: {
    width: 40,
    height: 60,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFallbackText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  movieInfo: {
    flex: 1,
  },
  movieTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  movieMeta: {
    ...typography.tiny,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  yourRankRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  yourRankText: {
    ...typography.tiny,
    fontWeight: '600',
    color: colors.accent,
  },
  comparisonText: {
    ...typography.tiny,
  },
  notRankedText: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  emptyContainer: {
    padding: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
