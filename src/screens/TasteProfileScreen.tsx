import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAppStore } from '../store/useAppStore';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { globalRankingsService, GlobalRanking } from '../services/globalRankingsService';
import { recommendationService, UserSimilarity } from '../services/recommendationService';
import { calculateTopGenres } from '../services/directorService';
import { computeGenreAffinity } from '../utils/genreAffinity';
import { Movie, Genre } from '../types';

// ============================================
// TYPES
// ============================================

interface TasteProfileScreenProps {
  onClose: () => void;
}

interface RarePick {
  movie: Movie;
  userRank: number;
  uniqueUsers: number;
  percentile: number;
}

// ============================================
// ICONS
// ============================================

function CloseIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={colors.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

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


function DiamondIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L2 9l10 13L22 9 12 2z"
        stroke="#9333EA"
        strokeWidth={2}
        fill="none"
      />
    </Svg>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TasteProfileScreen({ onClose }: TasteProfileScreenProps) {
  const { getRankedMovies, totalComparisons, userSession, postOnboardingComparisons } = useAppStore();
  const { user } = useAuth();
  const haptics = useHaptics();
  const [isLoading, setIsLoading] = useState(true);
  const [globalRankings, setGlobalRankings] = useState<GlobalRanking[]>([]);
  const [tasteTwin, setTasteTwin] = useState<UserSimilarity | null>(null);

  const rankedMovies = getRankedMovies();
  const top4 = rankedMovies.slice(0, 4);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [rankings, similarUsers] = await Promise.all([
          globalRankingsService.getGlobalRankings(200),
          user?.id && totalComparisons >= 20
            ? recommendationService.findSimilarUsers(user.id, 1)
            : Promise.resolve([]),
        ]);

        setGlobalRankings(rankings);
        if (similarUsers.length > 0) {
          setTasteTwin(similarUsers[0]);
        }
      } catch (error) {
        console.error('[TasteProfile] Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user?.id, totalComparisons]);

  // Calculate Taste DNA dimensions
  const tasteDNA = useMemo(() => {
    const top20 = rankedMovies.slice(0, 20);

    // 1. Era Gravity — weighted avg year
    let yearSum = 0, weightSum = 0;
    top20.forEach((m, i) => {
      const w = 20 - i;
      if (m.year) { yearSum += m.year * w; weightSum += w; }
    });
    const avgYear = weightSum > 0 ? Math.round(yearSum / weightSum) : null;
    const eraLabel = avgYear === null ? 'Unknown'
      : avgYear < 1980 ? 'Classic Era'
      : avgYear < 2000 ? 'New Hollywood'
      : avgYear < 2015 ? 'Modern'
      : 'Contemporary';

    // 2. Crowd Alignment — overlap with global top 50
    const globalTop50Ids = new Set(
      globalRankings.slice(0, 50).map(gr => gr.movie_id)
    );
    const top20Ids = top20.map(m => m.id);
    const overlapCount = top20Ids.filter(id => globalTop50Ids.has(id)).length;
    const crowdPct = Math.round((overlapCount / Math.max(top20.length, 1)) * 100);
    const crowdLabel = crowdPct < 20 ? 'Indie Spirit'
      : crowdPct > 50 ? 'Crowd Pleaser'
      : 'Balanced';

    // 3. Genre Focus — using calculateTopGenres
    const genreRankings = calculateTopGenres(rankedMovies, 10);
    const totalPoints = genreRankings.reduce((s, g) => s + g.points, 0);
    const topGenreShare = totalPoints > 0
      ? Math.round((genreRankings[0]?.points || 0) / totalPoints * 100)
      : 0;
    const top2Share = totalPoints > 0
      ? Math.round(((genreRankings[0]?.points || 0) + (genreRankings[1]?.points || 0)) / totalPoints * 100)
      : 0;
    const focusLabel = topGenreShare > 40 ? 'Specialist'
      : top2Share > 60 ? 'Dual Focus'
      : 'Omnivore';
    const topGenreNames = genreRankings.slice(0, 3).map(g => g.genre);

    return { avgYear, eraLabel, crowdPct, crowdLabel, topGenreShare, focusLabel, topGenreNames };
  }, [rankedMovies, globalRankings]);

  // Find rarest favorite
  const rarePick = useMemo((): RarePick | null => {
    if (globalRankings.length === 0 || rankedMovies.length === 0) return null;

    const globalRankingsMap = new Map(globalRankings.map(gr => [gr.movie_id, gr]));
    let rarestMovie: Movie | null = null;
    let minUsers = Infinity;
    let rarestRank = 0;

    rankedMovies.slice(0, 20).forEach((movie, index) => {
      const globalData = globalRankingsMap.get(movie.id);
      if (globalData && globalData.unique_users_count < minUsers && globalData.unique_users_count > 0) {
        minUsers = globalData.unique_users_count;
        rarestMovie = movie;
        rarestRank = index + 1;
      }
    });

    if (!rarestMovie || minUsers === Infinity) return null;

    // Calculate percentile (what % of users have this in their top 20)
    const totalUsers = Math.max(...globalRankings.map(gr => gr.unique_users_count), 1);
    const percentile = Math.round((minUsers / totalUsers) * 100);

    return {
      movie: rarestMovie,
      userRank: rarestRank,
      uniqueUsers: minUsers,
      percentile: Math.max(1, percentile),
    };
  }, [globalRankings, rankedMovies]);

  // Genre strengths: per-genre average user beta vs global beta
  const genreStrengths = useMemo(() => {
    if (rankedMovies.length < 10 || globalRankings.length === 0) return null;

    const globalMap = new Map(globalRankings.map(gr => [gr.movie_id, gr]));
    const affinity = computeGenreAffinity(
      userSession.preferences.vibes,
      rankedMovies,
      postOnboardingComparisons
    );

    const genreData: Record<string, { userAvg: number; globalAvg: number; count: number }> = {};

    for (const movie of rankedMovies) {
      const globalData = globalMap.get(movie.id);
      if (!globalData) continue;

      for (const genre of movie.genres) {
        if (!genreData[genre]) genreData[genre] = { userAvg: 0, globalAvg: 0, count: 0 };
        genreData[genre].userAvg += movie.beta;
        genreData[genre].globalAvg += globalData.global_beta;
        genreData[genre].count++;
      }
    }

    const strengths = Object.entries(genreData)
      .filter(([_, d]) => d.count >= 3)
      .map(([genre, d]) => ({
        genre,
        userAvg: d.userAvg / d.count,
        globalAvg: d.globalAvg / d.count,
        delta: (d.userAvg / d.count) - (d.globalAvg / d.count),
        count: d.count,
        affinity: affinity?.[genre as Genre] || 0,
      }))
      .sort((a, b) => b.delta - a.delta);

    return strengths.length >= 3 ? strengths : null;
  }, [rankedMovies, globalRankings, userSession.preferences.vibes, postOnboardingComparisons]);

  // Handle share
  const handleShare = async () => {
    haptics.medium();

    const genreLabels: Record<string, string> = {
      action: 'Action', comedy: 'Comedy', drama: 'Drama', scifi: 'Sci-Fi',
      romance: 'Romance', thriller: 'Thriller', animation: 'Animation',
      horror: 'Horror', adventure: 'Adventure', fantasy: 'Fantasy',
    };
    const genreNames = tasteDNA.topGenreNames.map(g => genreLabels[g] || g).join(', ');

    const topStrength = genreStrengths?.[0];
    const strengthLine = topStrength
      ? `\nTop Strength: ${topStrength.genre} (${topStrength.delta > 0 ? 'above' : 'below'} avg)\n`
      : '';

    const shareText = `My Taste DNA:
Era: ${tasteDNA.eraLabel}${tasteDNA.avgYear ? ` (avg. ${tasteDNA.avgYear})` : ''}
Crowd: ${tasteDNA.crowdLabel} (${tasteDNA.crowdPct}%)
Focus: ${genreNames}${strengthLine}
My Top 4:
${top4.map((m, i) => `${i + 1}. ${m.title}`).join('\n')}

Find your taste profile at aaybee.netlify.app`;

    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ text: shareText });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareText);
        }
      } else {
        await Share.share({ message: shareText });
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>taste profile</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <CloseIcon />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>analyzing your taste...</Text>
        </View>
      </View>
    );
  }

  if (rankedMovies.length < 10) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>taste profile</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <CloseIcon />
          </Pressable>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>not enough data yet</Text>
          <Text style={styles.emptyText}>
            rank at least 10 movies to unlock your taste profile
          </Text>
          <Text style={styles.emptyProgress}>
            {rankedMovies.length}/10 movies ranked
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>taste profile</Text>
        <View style={styles.headerButtons}>
          <Pressable style={styles.shareButton} onPress={handleShare}>
            <ShareIcon color={colors.textSecondary} />
          </Pressable>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <CloseIcon />
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* TASTE DNA CARD */}
        <Animated.View entering={FadeInDown.delay(50)} style={styles.tasteDNACard}>
          <Text style={styles.sectionTitle}>taste dna</Text>
          <View style={styles.tasteDNARow}>
            <Text style={styles.tasteDNALabel}>era gravity</Text>
            <Text style={styles.tasteDNAValue}>
              {tasteDNA.avgYear ? `avg. ${tasteDNA.avgYear}` : '—'}
            </Text>
            <Text style={styles.tasteDNAClassification}>{tasteDNA.eraLabel}</Text>
          </View>
          <View style={styles.tasteDNADivider} />
          <View style={styles.tasteDNARow}>
            <Text style={styles.tasteDNALabel}>crowd alignment</Text>
            <Text style={styles.tasteDNAValue}>{tasteDNA.crowdPct}%</Text>
            <Text style={styles.tasteDNAClassification}>{tasteDNA.crowdLabel}</Text>
          </View>
          <View style={styles.tasteDNADivider} />
          <View style={styles.tasteDNARow}>
            <Text style={styles.tasteDNALabel}>genre focus</Text>
            <Text style={styles.tasteDNAValue}>{tasteDNA.topGenreShare}%</Text>
            <Text style={styles.tasteDNAClassification}>{tasteDNA.focusLabel}</Text>
          </View>
          <View style={styles.tasteDNAGenres}>
            {tasteDNA.topGenreNames.map((genre, i) => (
              <View key={genre} style={styles.tasteDNAGenreTag}>
                <Text style={styles.tasteDNAGenreText}>{genre}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* TOP 4 */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
          <Text style={styles.sectionTitle}>your top 4</Text>
          <View style={styles.top4Grid}>
            {top4.map((movie, index) => (
              <View key={movie.id} style={styles.top4Item}>
                <View style={styles.top4PosterContainer}>
                  {movie.posterUrl ? (
                    <Image source={{ uri: movie.posterUrl }} style={styles.top4Poster} />
                  ) : (
                    <View style={[styles.top4Poster, styles.posterFallback]}>
                      <Text style={styles.posterFallbackText}>{movie.title.slice(0, 2)}</Text>
                    </View>
                  )}
                  <View style={[
                    styles.top4RankBadge,
                    index === 0 && styles.rankBadgeGold,
                    index === 1 && styles.rankBadgeSilver,
                    index === 2 && styles.rankBadgeBronze,
                  ]}>
                    <Text style={styles.top4RankText}>#{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.top4Title} numberOfLines={2}>{movie.title}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* RAREST FAVORITE */}
        {rarePick && (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <DiamondIcon />
              <Text style={styles.sectionTitle}>your hidden gem</Text>
            </View>
            <View style={styles.rareCard}>
              <View style={styles.controversialPoster}>
                {rarePick.movie.posterUrl ? (
                  <Image
                    source={{ uri: rarePick.movie.posterUrl }}
                    style={styles.controversialPosterImage}
                  />
                ) : (
                  <View style={[styles.controversialPosterImage, styles.posterFallback]}>
                    <Text style={styles.posterFallbackText}>
                      {rarePick.movie.title.slice(0, 2)}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.controversialInfo}>
                <Text style={styles.controversialTitle}>{rarePick.movie.title}</Text>
                <Text style={styles.rareMessage}>
                  Only {rarePick.percentile}% of users have this ranked
                </Text>
                <Text style={styles.controversialTagline}>
                  your #${rarePick.userRank} pick
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* GENRE STRENGTHS */}
        {genreStrengths && (
          <Animated.View entering={FadeInDown.delay(250)} style={styles.section}>
            <Text style={styles.sectionTitle}>genre strengths</Text>
            <View style={styles.genreStrengthsList}>
              {genreStrengths.slice(0, 5).map((gs) => {
                const isPositive = gs.delta > 0;
                const absDelta = Math.abs(gs.delta);
                const label = absDelta > 0.5 ? (isPositive ? 'well above' : 'well below')
                  : absDelta > 0.2 ? (isPositive ? 'above' : 'below')
                  : 'near';
                return (
                  <View key={gs.genre} style={styles.genreStrengthRow}>
                    <Text style={styles.genreStrengthName}>{gs.genre}</Text>
                    <View style={styles.genreStrengthBar}>
                      <View style={[
                        styles.genreStrengthFill,
                        { width: `${Math.min(100, Math.max(10, 50 + gs.delta * 30))}%` },
                        isPositive ? styles.genreStrengthPositive : styles.genreStrengthNegative,
                      ]} />
                    </View>
                    <Text style={[
                      styles.genreStrengthLabel,
                      isPositive ? styles.genreStrengthLabelPositive : styles.genreStrengthLabelNegative,
                    ]}>
                      {label} avg
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* TASTE TWIN */}
        {tasteTwin && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
            <Text style={styles.sectionTitle}>your taste twin</Text>
            <View style={styles.tasteTwinCard}>
              <View style={styles.tasteTwinAvatar}>
                <Text style={styles.tasteTwinAvatarText}>
                  {(tasteTwin.displayName || 'U').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.tasteTwinInfo}>
                <Text style={styles.tasteTwinName}>
                  {tasteTwin.displayName || 'Anonymous'}
                </Text>
                <Text style={styles.tasteTwinMatch}>
                  {Math.round(tasteTwin.rSquared * 100)}% taste match
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyProgress: {
    ...typography.bodyMedium,
    color: colors.accent,
  },

  // Taste DNA Card
  tasteDNACard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  tasteDNARow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  tasteDNALabel: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  tasteDNAValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  tasteDNAClassification: {
    ...typography.tiny,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  tasteDNADivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  tasteDNAGenres: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tasteDNAGenreTag: {
    backgroundColor: colors.accentSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
  },
  tasteDNAGenreText: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '600',
  },

  // Sections
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  // Top 4
  top4Grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  top4Item: {
    width: '47%',
    alignItems: 'center',
  },
  top4PosterContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  top4Poster: {
    width: 100,
    height: 150,
    borderRadius: borderRadius.lg,
  },
  top4RankBadge: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
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
  top4RankText: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.background,
  },
  top4Title: {
    ...typography.tiny,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '500',
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

  // Rare Card
  rareCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.purpleSubtle,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  controversialPoster: {
    width: 60,
    height: 90,
  },
  controversialPosterImage: {
    width: 60,
    height: 90,
    borderRadius: borderRadius.md,
  },
  controversialInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  controversialTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  controversialTagline: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '600',
  },
  rareMessage: {
    ...typography.caption,
    color: colors.purple,
    marginBottom: spacing.xs,
  },

  // Taste Twin
  tasteTwinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tasteTwinAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tasteTwinAvatarText: {
    ...typography.h3,
    color: colors.background,
    fontWeight: '700',
  },
  tasteTwinInfo: {
    flex: 1,
  },
  tasteTwinName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  tasteTwinMatch: {
    ...typography.tiny,
    color: colors.accent,
    marginTop: 2,
  },

  // Genre Strengths
  genreStrengthsList: {
    gap: spacing.sm,
  },
  genreStrengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  genreStrengthName: {
    ...typography.tiny,
    color: colors.textPrimary,
    fontWeight: '500',
    width: 72,
  },
  genreStrengthBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  genreStrengthFill: {
    height: '100%',
    borderRadius: 4,
  },
  genreStrengthPositive: {
    backgroundColor: '#4CAF50',
  },
  genreStrengthNegative: {
    backgroundColor: colors.textMuted,
  },
  genreStrengthLabel: {
    ...typography.tiny,
    fontWeight: '500',
    width: 72,
    textAlign: 'right',
  },
  genreStrengthLabelPositive: {
    color: '#4CAF50',
  },
  genreStrengthLabelNegative: {
    color: colors.textMuted,
  },

  bottomPadding: {
    height: spacing.xxxl,
  },
});
