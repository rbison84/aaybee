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
import { useLockedFeature } from '../../contexts/LockedFeatureContext';
import { useHaptics } from '../../hooks/useHaptics';
import { globalRankingsService, GlobalRanking } from '../../services/globalRankingsService';
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
// TYPES
// ============================================

interface EnrichedRanking extends GlobalRanking {
  userRank?: number;
}

// ============================================
// RANKING ITEM
// ============================================

interface RankingItemProps {
  item: EnrichedRanking;
  onPress: () => void;
}

function RankingItem({ item, onPress }: RankingItemProps) {
  const isTopThree = item.global_rank <= 3;
  const hasUserRank = item.userRank !== undefined && item.userRank > 0;
  const rankDiff = hasUserRank ? item.userRank! - item.global_rank : 0;

  const getComparisonText = () => {
    if (!hasUserRank) return null;
    if (Math.abs(rankDiff) <= 3) {
      return 'you agree with most users';
    } else if (rankDiff > 0) {
      return `you ranked this ${rankDiff} spots lower`;
    } else {
      return `you ranked this ${Math.abs(rankDiff)} spots higher`;
    }
  };

  const comparisonText = getComparisonText();
  const comparisonColor = hasUserRank ? getComparisonColor(rankDiff) : colors.textMuted;

  return (
    <Pressable style={[styles.rankItem, isTopThree && styles.rankItemTop]} onPress={onPress}>
      {isTopThree ? (
        <View style={[
          styles.rankBadge,
          item.global_rank === 1 && styles.rankBadgeGold,
          item.global_rank === 2 && styles.rankBadgeSilver,
          item.global_rank === 3 && styles.rankBadgeBronze,
        ]}>
          <Text style={styles.rankNumberTop}>#{item.global_rank}</Text>
        </View>
      ) : (
        <View style={styles.rankBadgeMuted}>
          <Text style={styles.rankNumberMuted}>#{item.global_rank}</Text>
        </View>
      )}

      <View style={styles.posterThumb}>
        {item.movie?.poster_url ? (
          <Image source={{ uri: item.movie.poster_url }} style={styles.posterImage} />
        ) : (
          <View style={styles.posterFallback}>
            <Text style={styles.posterFallbackText}>{item.movie?.title?.slice(0, 2) || '??'}</Text>
          </View>
        )}
      </View>

      <View style={styles.movieInfo}>
        <Text style={styles.movieTitle} numberOfLines={1}>{item.movie?.title || 'unknown'}</Text>
        <Text style={styles.movieMeta}>{item.movie?.year || '—'}</Text>

        {hasUserRank ? (
          <View style={styles.yourRankRow}>
            <Text style={styles.yourRankText}>your #{item.userRank}</Text>
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

export function GlobalTab() {
  const { user, isGuest } = useAuth();
  const { getRankedMovies, movies, postOnboardingComparisons } = useAppStore();
  const { openMovieDetail } = useMovieDetail();
  const { showLockedFeature } = useLockedFeature();
  const haptics = useHaptics();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rankings, setRankings] = useState<GlobalRanking[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('top25');

  const userRankedMovies = useMemo(() => {
    const ranked = getRankedMovies();
    const rankMap = new Map<string, number>();
    ranked.forEach((m, i) => rankMap.set(m.id, i + 1));
    return rankMap;
  }, [getRankedMovies]);

  const handleMoviePress = useCallback((item: EnrichedRanking) => {
    // Try to find the full movie from the store
    const storeMovie = movies.get(item.movie_id);
    if (storeMovie) {
      openMovieDetail(storeMovie);
    } else if (item.movie) {
      // Create a minimal movie object from ranking data
      openMovieDetail({
        id: item.movie_id,
        title: item.movie.title || 'Unknown',
        year: item.movie.year || 2000,
        genres: [],
        posterUrl: item.movie.poster_url || '',
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

  const loadData = useCallback(async () => {
    try {
      const globalRankings = await globalRankingsService.getGlobalRankings(50);
      setRankings(globalRankings);
    } catch (error) {
      console.error('[GlobalTab] Failed to load data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
  }, [loadData]);

  const enrichedRankings = useMemo((): EnrichedRanking[] => {
    const enriched = rankings.map(r => ({
      ...r,
      userRank: userRankedMovies.get(r.movie_id),
    }));
    if (activeFilter === 'top25') return enriched.slice(0, 25);
    return enriched;
  }, [rankings, userRankedMovies, activeFilter]);

  const renderItem = useCallback(({ item }: { item: EnrichedRanking }) => (
    <RankingItem item={item} onPress={() => handleMoviePress(item)} />
  ), [handleMoviePress]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (rankings.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="no rankings yet"
        subtitle="global rankings will appear as more users compare movies"
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
              if (filter.locked && filter.unlockAt) {
                haptics.light();
                showLockedFeature({
                  feature: filter.label,
                  requirement: `compare ${filter.unlockAt - postOnboardingComparisons} more movie${filter.unlockAt - postOnboardingComparisons !== 1 ? 's' : ''} to unlock`,
                  progress: {
                    current: postOnboardingComparisons,
                    required: filter.unlockAt,
                  },
                });
              } else {
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
        data={enrichedRankings}
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
            <Text style={styles.emptyText}>no global rankings available</Text>
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
