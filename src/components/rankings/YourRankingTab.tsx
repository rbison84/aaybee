import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Share,
  RefreshControl,
  Image,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { useAppStore } from '../../store/useAppStore';
import { useHaptics } from '../../hooks/useHaptics';
import { useMovieDetail } from '../../contexts/MovieDetailContext';
import { useAlert } from '../../contexts/AlertContext';
// LockedFeatureContext removed — no gated features
import { Movie } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';
import { EmptyState } from '../EmptyState';
import { ShareableClassic } from '../ShareableImages';

// Share icon component
function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3v12M12 3l4 4M12 3L8 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ============================================
// CONSTANTS
// ============================================

const MIN_COMPARISONS_FOR_CLASSIC = 10;
const MIN_COMPARISONS_FOR_TOP25 = 30;
const MIN_COMPARISONS_FOR_ALL = 85;

// ============================================
// TYPES
// ============================================

type FilterType = 'classic' | 'top25' | 'all';

interface YourRankingTabProps {
  onContinueComparing?: () => void;
  initialFilter?: FilterType;
}

// ============================================
// COMPONENT
// ============================================

export function YourRankingTab({ onContinueComparing, initialFilter = 'classic' }: YourRankingTabProps) {
  const { movies, postOnboardingComparisons } = useAppStore();
  const isClassicLocked = postOnboardingComparisons < MIN_COMPARISONS_FOR_CLASSIC;
  const haptics = useHaptics();
  const { openMovieDetail } = useMovieDetail();
  const { showAlert } = useAlert();
  // No locked features

  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);
  const [refreshing, setRefreshing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const top10ViewRef = useRef<ViewShot>(null);

  const allMovies = useMemo(() => Array.from(movies.values()), [movies]);

  // Get ranked movies (2+ comparisons — stable enough for display)
  const rankedMovies = useMemo(() => {
    return allMovies
      .filter(m => m.status === 'known' && m.totalComparisons >= 2)
      .sort((a, b) => b.beta - a.beta);
  }, [allMovies]);

  // Classic 9 movies for grid view
  const classicMovies = useMemo(() => rankedMovies.slice(0, 9), [rankedMovies]);

  // Filter movies for list views
  const filteredMovies = useMemo(() => {
    if (activeFilter === 'classic') {
      return rankedMovies.slice(0, 9);
    }
    if (activeFilter === 'top25') {
      return rankedMovies.slice(0, 25);
    }
    return rankedMovies;
  }, [rankedMovies, activeFilter]);

  // Handlers
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    haptics.light();
    setTimeout(() => setRefreshing(false), 500);
  }, [haptics]);

  const classicShareMovies = useMemo(() => rankedMovies.slice(0, 9), [rankedMovies]);

  const handleShare = useCallback(async () => {
    haptics.medium();

    const shareMovies = filteredMovies;
    const filterLabel = activeFilter === 'classic' ? 'aaybee classic' : activeFilter === 'top25' ? 'top 25' : 'ranking';

    if (shareMovies.length < 3) {
      showAlert('not enough movies', `keep comparing to build your ${filterLabel}!`);
      return;
    }

    // ViewShot capture only on native (not available on web), only for classic
    if (Platform.OS !== 'web' && activeFilter === 'classic') {
      try {
        setIsCapturing(true);
        await new Promise(resolve => setTimeout(resolve, 100));

        if (top10ViewRef.current) {
          const uri = await top10ViewRef.current.capture?.();
          setIsCapturing(false);

          if (uri) {
            if (Platform.OS === 'ios') {
              await Share.share({
                url: uri,
                message: `my ${filterLabel} on aaybee → aaybee.netlify.app`,
              });
            } else {
              await Share.share({
                message: `my ${filterLabel} on aaybee → aaybee.netlify.app`,
              });
            }
            return;
          }
        }
        setIsCapturing(false);
      } catch (error) {
        setIsCapturing(false);
        console.error('Share failed:', error);
      }
    }

    // Text fallback (used on web, non-top10 filters, or if ViewShot fails)
    const shareText = `my ${filterLabel} on aaybee\n\n${shareMovies
      .map((m, i) => `${i + 1}. ${m.title} (${m.year})`)
      .join('\n')}\n\naaybee.netlify.app`;

    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: `my ${filterLabel}`, text: shareText });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareText);
        }
      } else {
        await Share.share({ message: shareText, title: `my ${filterLabel}` });
      }
    } catch (e) {
      console.error('Fallback share error:', e);
    }
  }, [filteredMovies, activeFilter, haptics, showAlert]);

  const handleMoviePress = useCallback((movie: Movie) => {
    haptics.selection();
    openMovieDetail(movie);
  }, [haptics, openMovieDetail]);

  // Render item
  const renderItem = useCallback(({ item, index }: { item: Movie; index: number }) => {
    const rank = index + 1;
    const isTopThree = rank <= 3;

    return (
      <Pressable
        onPress={isClassicLocked ? undefined : () => handleMoviePress(item)}
        disabled={isClassicLocked}
        style={[styles.rankItem, isTopThree && styles.rankItemTop, isClassicLocked && styles.rankItemGlazed]}
      >
        {isTopThree ? (
          <View style={[
            styles.rankBadge,
            rank === 1 && styles.rankBadgeGold,
            rank === 2 && styles.rankBadgeSilver,
            rank === 3 && styles.rankBadgeBronze,
          ]}>
            <Text style={styles.rankNumberTop}>#{rank}</Text>
          </View>
        ) : (
          <View style={styles.rankBadgeMuted}>
            <Text style={styles.rankNumberMuted}>#{rank}</Text>
          </View>
        )}

        <View style={styles.posterThumb}>
          {item.posterUrl ? (
            <Image source={{ uri: item.posterUrl }} style={styles.posterImage} />
          ) : (
            <View style={styles.posterFallback}>
              <Text style={styles.posterFallbackText}>{item.title.slice(0, 2)}</Text>
            </View>
          )}
        </View>

        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.movieMeta}>{item.year}</Text>
        </View>
      </Pressable>
    );
  }, [handleMoviePress, isClassicLocked]);

  // Empty state
  const renderEmptyState = () => (
    <EmptyState
      icon="🎬"
      title="no movies ranked yet"
      subtitle="start comparing movies to build your personal ranking!"
      actionLabel="start comparing"
      onAction={onContinueComparing}
    />
  );

  // Filters with unlock gates
  const filters: { key: FilterType; label: string; locked: boolean; unlockAt?: number }[] = [
    { key: 'classic', label: 'classic', locked: isClassicLocked, unlockAt: MIN_COMPARISONS_FOR_CLASSIC },
    { key: 'top25', label: 'top 25', locked: postOnboardingComparisons < MIN_COMPARISONS_FOR_TOP25, unlockAt: MIN_COMPARISONS_FOR_TOP25 },
    { key: 'all', label: 'all', locked: postOnboardingComparisons < MIN_COMPARISONS_FOR_ALL, unlockAt: MIN_COMPARISONS_FOR_ALL },
  ];

  // Share button pressed state
  const [sharePressed, setSharePressed] = useState(false);

  return (
    <View style={styles.container}>
      {/* Hidden capture view - 1080x1080 square (native only) */}
      {Platform.OS !== 'web' && isCapturing && (
        <View style={styles.captureWrapper}>
          <ViewShot
            ref={top10ViewRef}
            options={{ format: 'png', quality: 1, width: 1080, height: 1080 }}
          >
            <ShareableClassic movies={classicShareMovies} />
          </ViewShot>
        </View>
      )}

      {/* Filter pills + Search + Share */}
      <View style={styles.filterRow}>
        <View style={styles.filterPills}>
          {filters.map((filter) => (
            <Pressable
              key={filter.key}
              style={[styles.filterPill, activeFilter === filter.key && !filter.locked && styles.filterPillActive]}
              onPress={() => {
                setActiveFilter(filter.key);
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
        {!isClassicLocked && (
          <View style={styles.filterActions}>
            <Pressable
              style={styles.shareButton}
              onPress={handleShare}
              onPressIn={() => setSharePressed(true)}
              onPressOut={() => setSharePressed(false)}
            >
              <ShareIcon color={sharePressed ? colors.accent : colors.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Content */}
      {activeFilter === 'classic' && !isClassicLocked ? (
        <ScrollView contentContainerStyle={styles.classicContainer}>
          <View style={styles.classicGrid}>
            {Array.from({ length: 9 }, (_, i) => {
              const movie = classicMovies[i];
              return (
                <Pressable
                  key={movie?.id ?? `slot-${i}`}
                  style={styles.classicCell}
                  onPress={movie ? () => handleMoviePress(movie) : undefined}
                >
                  {movie ? (
                    <>
                      {movie.posterUrl ? (
                        <Image source={{ uri: movie.posterUrl }} style={styles.classicPoster} resizeMode="cover" />
                      ) : (
                        <View style={[styles.classicPoster, styles.classicPosterFallback]}>
                          <Text style={styles.posterFallbackText}>{movie.title.slice(0, 2).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={[
                        styles.classicBadge,
                        i === 0 && { backgroundColor: colors.gold },
                        i === 1 && { backgroundColor: colors.silver },
                        i === 2 && { backgroundColor: colors.bronze },
                      ]}>
                        <Text style={styles.classicBadgeText}>{i + 1}</Text>
                      </View>
                      <View style={styles.classicTitleBar}>
                        <Text style={styles.classicTitleText} numberOfLines={1}>{movie.title}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.classicLocked}>
                      <Text style={styles.classicLockedText}>{i + 1}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={activeFilter === 'classic' ? [] : filteredMovies}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isClassicLocked}
          refreshControl={
            !isClassicLocked ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.textMuted}
              />
            ) : undefined
          }
        />
      )}

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
  captureWrapper: {
    position: 'absolute',
    top: -9999,
    left: 0,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 40,
  },
  filterPills: {
    flexDirection: 'row',
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
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shareButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  rankItemGlazed: {
    opacity: 0.35,
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
  },

  // Classic 3x3 grid
  classicContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  classicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    maxWidth: 310,
  },
  classicCell: {
    width: 96,
    height: 144,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  classicPoster: {
    width: '100%',
    height: '100%',
  },
  classicPosterFallback: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classicBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.textMuted,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classicBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.background,
  },
  classicTitleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  classicTitleText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  classicLocked: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
  },
  classicLockedText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textMuted,
    opacity: 0.4,
  },
});
