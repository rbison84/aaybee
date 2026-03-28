import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CatMascot } from '../components/onboarding/CatMascot';
import { GiftIcon } from '../components/GiftIcon';
import { useRecommendationTracking } from '../contexts/RecommendationTrackingContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/useAppStore';
import { useMovieDetail } from '../contexts/MovieDetailContext';
import { useQuickRank } from '../contexts/QuickRankContext';
import {
  recommendationService,
  MovieRecommendation,
  RecommendationsResult,
  getEffectiveTier,
} from '../services/recommendationService';
import { upsertRecommendationFeedback } from '../services/database';
import { watchlistService, WatchlistMovie } from '../services/watchlistService';

import { CinematicBackground, CinematicButton } from '../components/cinematic';
import { UnderlineTabs } from '../components/UnderlineTabs';
import { EmptyState } from '../components/EmptyState';
import { colors, spacing, borderRadius, typography, shadows } from '../theme/cinematic';
import { openLetterboxd } from '../utils/letterboxd';
import { Genre } from '../types';

import { useAlert } from '../contexts/AlertContext';

// ============================================
// CONSTANTS
// ============================================

const MIN_COMPARISONS_FOR_RECS = 40;

type TabType = 'recommendations' | 'watchlist';

// ============================================
// BUILDING PROFILE CARD
// ============================================

interface BuildingProfileCardProps {
  currentComparisons: number;
  requiredComparisons: number;
  onContinue: () => void;
}

function BuildingProfileCard({
  currentComparisons,
  requiredComparisons,
  onContinue,
}: BuildingProfileCardProps) {
  const remaining = requiredComparisons - currentComparisons;
  const progress = Math.min(1, currentComparisons / requiredComparisons);

  return (
    <Animated.View style={styles.buildingCard} entering={FadeIn.duration(400)}>
      <CatMascot pose="sat" size={100} />

      <Text style={styles.buildingTitle}>recommendations</Text>
      <Text style={styles.buildingSubtitle}>
        compare {remaining} more movie{remaining !== 1 ? 's' : ''} to unlock personalized recommendations
      </Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {currentComparisons}/{requiredComparisons}
        </Text>
      </View>

      <CinematicButton
        label="continue comparing"
        variant="primary"
        onPress={onContinue}
      />
    </Animated.View>
  );
}

// ============================================
// MYSTERY CARD (Unrevealed Recommendation)
// ============================================

interface MysteryCardProps {
  index: number;
  onReveal: () => void;
  isRevealing: boolean;
}

function MysteryCard({ index, onReveal, isRevealing }: MysteryCardProps) {
  const scale = useSharedValue(1);
  const shimmerPosition = useSharedValue(0);

  // Subtle pulse animation
  useEffect(() => {
    const interval = setInterval(() => {
      scale.value = withSequence(
        withTiming(1.02, { duration: 600 }),
        withTiming(1, { duration: 600 })
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(350)}
    >
      <Pressable onPress={onReveal} disabled={isRevealing}>
        <Animated.View style={[styles.mysteryCard, animatedStyle]}>
          <View style={styles.mysteryPosterContainer}>
            <View style={styles.mysteryPoster}>
              <GiftIcon size={32} color={colors.accent} />
            </View>
          </View>

          <View style={styles.mysteryInfo}>
            <Text style={styles.mysteryTitle}>mystery recommendation</Text>
            <Text style={styles.mysterySubtitle}>tap to reveal your pick</Text>
          </View>

          <View style={styles.mysteryAction}>
            {isRevealing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.revealButtonText}>reveal</Text>
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ============================================
// RECOMMENDATION CARD
// ============================================

interface RecommendationCardProps {
  recommendation: MovieRecommendation;
  index: number;
  onAddToWatchList: () => void;
  onSeenIt: () => void;
  onNotInterested: () => void;
  onPosterPress: () => void;
  isAdding: boolean;
}

function RecommendationCard({
  recommendation,
  index,
  onAddToWatchList,
  onSeenIt,
  onNotInterested,
  onPosterPress,
  isAdding,
}: RecommendationCardProps) {
  const translateX = useSharedValue(0);
  const isDismissing = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // Only allow left swipe
      if (e.translationX < 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX < -100) {
        // Swipe threshold reached - dismiss
        isDismissing.value = true;
        translateX.value = withTiming(-400, { duration: 200 }, () => {
          runOnJS(onNotInterested)();
        });
      } else {
        // Snap back
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: isDismissing.value ? withTiming(0) : 1,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(350)}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.newReleaseCard, animatedStyle]}>
          <Pressable style={styles.newReleasePosterContainer} onPress={onPosterPress}>
            {recommendation.posterUrl ? (
              <Image source={{ uri: recommendation.posterUrl }} style={styles.newReleasePoster} />
            ) : (
              <View style={[styles.newReleasePoster, styles.posterPlaceholder]}>
                <Text style={styles.posterText}>{recommendation.title.slice(0, 2)}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.newReleaseInfo}>
            <Text style={styles.newReleaseTitle} numberOfLines={2}>
              {recommendation.title}
            </Text>
            <Text style={styles.newReleaseMeta}>{recommendation.year}</Text>
          </View>

          <View style={styles.newReleaseActions}>
            <CinematicButton
              label="+ watchlist"
              variant="primary"
              size="small"
              onPress={onAddToWatchList}
              disabled={isAdding}
            />
            <Pressable style={styles.seenItButton} onPress={onSeenIt}>
              <Text style={styles.seenItButtonText}>seen it</Text>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// ============================================
// WATCHLIST ITEM
// ============================================

interface WatchlistItemCardProps {
  item: WatchlistMovie;
  index: number;
  onWatched: () => void;
  onRemove: () => void;
  onPosterPress: () => void;
}

function WatchlistItemCard({
  item,
  index,
  onWatched,
  onRemove,
  onPosterPress,
}: WatchlistItemCardProps) {
  const translateX = useSharedValue(0);
  const isDismissing = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX(-10)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationX < 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX < -100) {
        isDismissing.value = true;
        translateX.value = withTiming(-400, { duration: 200 }, () => {
          runOnJS(onRemove)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: isDismissing.value ? withTiming(0) : 1,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.watchlistCard, animatedStyle]}>
          <Pressable style={styles.watchlistPoster} onPress={onPosterPress}>
            {item.poster_url ? (
              <Image source={{ uri: item.poster_url }} style={styles.watchlistPosterImage} />
            ) : (
              <View style={[styles.watchlistPosterImage, styles.posterPlaceholder]}>
                <Text style={styles.posterText}>{item.title.slice(0, 2)}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.watchlistInfo}>
            <Text style={styles.watchlistTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.watchlistMetaRow}>
              <Text style={styles.watchlistMeta}>{item.year}</Text>
              {item.is_rewatch && (
                <Text style={styles.rewatchBadge}>rewatch</Text>
              )}
            </View>
          </View>

          <View style={styles.watchlistActions}>
            <Pressable style={styles.watchedButton} onPress={onWatched}>
              <Text style={styles.watchedButtonText}>watched</Text>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// ============================================
// EMPTY STATES
// ============================================

function EmptyRecommendations({ message }: { message: string }) {
  return (
    <EmptyState
      emoji=""
      title="no recommendations yet"
      subtitle={message}
    />
  );
}

function EmptyWatchlist({ onDiscover }: { onDiscover: () => void }) {
  return (
    <View style={styles.emptyWatchlist}>
      <Text style={styles.emptyWatchlistTitle}>your watchlist is empty</Text>
      <Text style={styles.emptyWatchlistSubtitle}>
        add movies from recommendations to save them for later
      </Text>
      <CinematicButton
        label="browse recommendations"
        variant="primary"
        onPress={onDiscover}
      />
    </View>
  );
}

// ============================================
// MAIN SCREEN
// ============================================

interface DiscoverScreenProps {
  onNavigateToCompare?: () => void;
}

export function DiscoverScreen({
  onNavigateToCompare,
}: DiscoverScreenProps) {
  const { user, isGuest } = useAuth();
  const { showAlert } = useAlert();
  const { postOnboardingComparisons, movies, markMovieAsKnown, markMovieAsUnknown, getRankedMovies, getAllComparedMovies, userSession, setComparisonExcludeIds } = useAppStore();
  const { openMovieDetail, isVisible: isMovieDetailVisible } = useMovieDetail();
  const { startQuickRank } = useQuickRank();
  const {
    unrevealedCount,
    onReveal: trackReveal,
    isMovieRevealed,
    getRevealedMovieIds,
    comparisonsUntilNextRec,
    canEarnMore,
    earnedToday,
    maxPerDay,
    revealedCount,
    revealedRecommendations: storedRevealedRecs,
    dismissedMovieIds,
    dismissRecommendation,
    grantFirstRecommendation,
  } = useRecommendationTracking();

  const [activeTab, setActiveTab] = useState<TabType>('recommendations');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Recommendations state
  const [result, setResult] = useState<RecommendationsResult | null>(null);
  const [addingMovieId, setAddingMovieId] = useState<string | null>(null);
  const [revealingIndex, setRevealingIndex] = useState<number | null>(null);
  const [revealedRecs, setRevealedRecs] = useState<MovieRecommendation[]>([]);

  // Convert dismissedMovieIds array to Set for efficient lookup
  const dismissedIds = useMemo(() => new Set(dismissedMovieIds), [dismissedMovieIds]);

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistMovie[]>([]);
  const [removingMovieId, setRemovingMovieId] = useState<string | null>(null);

  // Tabs with dynamic badge
  const tabs = useMemo(() => [
    { key: 'recommendations' as const, label: 'for you' },
    { key: 'watchlist' as const, label: 'watchlist', badge: watchlist.length || undefined },
  ], [watchlist.length]);

  const hasEnoughData = postOnboardingComparisons >= MIN_COMPARISONS_FOR_RECS;

  // Load recommendations
  const loadRecommendations = useCallback(async (forceRefresh = false) => {
    if (!user?.id || !hasEnoughData) return;

    try {
      const revealedIds = getRevealedMovieIds();
      const maxTier = getEffectiveTier(userSession.totalComparisons, userSession.poolUnlockedTier);
      const data = await recommendationService.getRecommendations(user.id, 20, revealedIds, { ...userSession.preferences, maxTier }, forceRefresh);
      setResult(data);
      // Note: Don't mark as revealed here - only mark when user actually reveals via mystery card
    } catch (error) {
      console.error('[Discover] Recommendations error:', error);
    }
  }, [user?.id, hasEnoughData]);

  // Load watchlist
  const loadWatchlist = useCallback(async () => {
    if (!user?.id) return;

    try {
      const data = await watchlistService.getWatchlist(user.id);
      setWatchlist(data);
    } catch (error) {
      console.error('[Discover] Watchlist error:', error);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([
        loadRecommendations(),
        loadWatchlist(),
      ]);
      setIsLoading(false);
    };
    loadAll();
  }, [loadRecommendations, loadWatchlist]);

  // Sync revealedRecs from persisted revealedMovieIds after recommendations load
  // This ensures revealed recommendations persist across screen remounts
  const revealedRecsLength = revealedRecs.length; // Extract to avoid stale closure
  useEffect(() => {
    if (result?.recommendations && revealedRecsLength === 0) {
      const previouslyRevealed = result.recommendations.filter(rec => isMovieRevealed(rec.movieId));
      if (previouslyRevealed.length > 0) {
        setRevealedRecs(previouslyRevealed);
      }
    }
  }, [result?.recommendations, isMovieRevealed, revealedRecsLength]);

  // Update comparison exclusion set whenever data changes
  // Movies in recommendations, watchlist, or new releases shouldn't appear in comparisons
  useEffect(() => {
    const ids = new Set<string>();
    result?.recommendations.forEach(r => ids.add(r.movieId));
    watchlist.forEach(w => ids.add(w.movie_id));
    setComparisonExcludeIds(ids);
  }, [result?.recommendations, watchlist, setComparisonExcludeIds]);

  // Reload watchlist when movie detail modal closes (in case watchlist was modified)
  const prevMovieDetailVisible = useRef(isMovieDetailVisible);
  useEffect(() => {
    if (prevMovieDetailVisible.current && !isMovieDetailVisible) {
      // Modal just closed, reload watchlist
      loadWatchlist();
    }
    prevMovieDetailVisible.current = isMovieDetailVisible;
  }, [isMovieDetailVisible, loadWatchlist]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (activeTab === 'recommendations') {
      await loadRecommendations(true); // forceRefresh bypasses CF cache
    } else {
      await loadWatchlist();
    }
    setIsRefreshing(false);
  }, [activeTab, loadRecommendations, loadWatchlist]);

  const handleAddToWatchlist = async (rec: MovieRecommendation) => {
    if (!user?.id) return;

    setAddingMovieId(rec.movieId);
    try {
      // Don't pass invalid user IDs like 'stored' or 'global' to the database
      const isValidSourceUser = rec.recommendedBy.userId &&
        rec.recommendedBy.userId !== 'stored' &&
        rec.recommendedBy.userId !== 'global';

      const result = await watchlistService.addToWatchlist(
        user.id,
        rec.movieId,
        'recommendation',
        isValidSourceUser ? rec.recommendedBy.userId : undefined,
        isValidSourceUser ? rec.recommendedBy.displayName || undefined : undefined
      );

      if (result.success) {
        dismissRecommendation(rec.movieId);
        loadWatchlist();
        // Fire-and-forget: persist feedback server-side
        if (user.id) upsertRecommendationFeedback(user.id, rec.movieId, 'watchlisted');
      } else {
        showAlert('error', result.error || 'failed to add to watchlist');
      }
    } finally {
      setAddingMovieId(null);
    }
  };

  const handleNotInterested = (movieId: string) => {
    dismissRecommendation(movieId);
    // Mark as unknown so it won't appear in comparisons
    markMovieAsUnknown(movieId);
    // Fire-and-forget: persist feedback server-side
    if (user?.id) upsertRecommendationFeedback(user.id, movieId, 'dismissed');
  };

  // Handle "seen it" for a recommendation - triggers quick rank flow
  const handleSeenItRecommendation = (rec: MovieRecommendation) => {
    // Check if user has enough compared movies for quick rank
    const comparedMovies = getAllComparedMovies();
    const shouldQuickRank = comparedMovies.length >= 3;

    // Start quick rank immediately if eligible
    if (shouldQuickRank) {
      startQuickRank({
        id: rec.movieId,
        title: rec.title,
        year: rec.year,
        posterUrl: rec.posterUrl,
      });
    }

    // Mark movie as known so it appears in comparisons
    // Pass movie details so it can be added to store if not already there
    markMovieAsKnown(rec.movieId, {
      title: rec.title,
      year: rec.year,
      posterUrl: rec.posterUrl || undefined,
      genres: rec.genres as Genre[] | undefined,
    });

    // Remove from recommendations list
    dismissRecommendation(rec.movieId);
    // Fire-and-forget: persist feedback server-side
    if (user?.id) upsertRecommendationFeedback(user.id, rec.movieId, 'seen_it');

    if (!shouldQuickRank) {
      // Not enough movies for quick rank - show simple confirmation
      showAlert(
        'marked as seen',
        'this movie will now appear in your comparisons',
        [{ text: 'ok' }]
      );
    }
  };

  // Handle revealing a mystery recommendation
  const handleRevealMystery = useCallback(async (mysteryIndex: number) => {
    setRevealingIndex(mysteryIndex);

    // Simulate reveal delay for excitement
    await new Promise(resolve => setTimeout(resolve, 800));

    console.log('[Discover] Reveal mystery - result has', result?.recommendations?.length || 0, 'recommendations');

    // Find the next unrevealed recommendation (check both persisted and local state)
    const unrevealed = result?.recommendations.find(
      rec => {
        const isRevealed = isMovieRevealed(rec.movieId);
        const isInLocal = revealedRecs.some(r => r.movieId === rec.movieId);
        const isDismissed = dismissedIds.has(rec.movieId);
        console.log(`[Discover] Checking ${rec.title}: revealed=${isRevealed}, inLocal=${isInLocal}, dismissed=${isDismissed}`);
        return !isRevealed && !isInLocal && !isDismissed;
      }
    );

    if (unrevealed) {
      console.log('[Discover] Revealing:', unrevealed.title);
      // Pass full recommendation data for storage
      trackReveal(unrevealed.movieId, {
        movieId: unrevealed.movieId,
        title: unrevealed.title,
        year: unrevealed.year,
        posterUrl: unrevealed.posterUrl,
        reason: unrevealed.reason,
      });
      setRevealedRecs(prev => [...prev, unrevealed]);
    } else {
      console.log('[Discover] No unrevealed recommendations found');
      // No recommendations available - try refreshing
      showAlert(
        'loading recommendations',
        'fetching your personalized picks...',
        [{ text: 'ok', onPress: () => loadRecommendations() }]
      );
      // DON'T consume the reveal - user keeps their mystery card
    }

    setRevealingIndex(null);
  }, [result, isMovieRevealed, revealedRecs, dismissedIds, trackReveal, loadRecommendations]);

  const handleRemoveFromWatchlist = async (item: WatchlistMovie) => {
    if (!user?.id) return;

    // Swipe gesture already indicates intent - no confirmation needed
    try {
      const result = await watchlistService.removeFromWatchlist(user.id, item.movie_id);
      if (result.success) {
        setWatchlist(prev => prev.filter(w => w.movie_id !== item.movie_id));
      } else {
        showAlert('error', result.error || 'failed to remove');
      }
    } catch (error) {
      console.error('[Discover] Failed to remove from watchlist:', error);
      showAlert('error', 'failed to remove from watchlist');
    }
  };

  const handleWatched = async (item: WatchlistMovie) => {
    if (!user?.id) return;

    // Rewatch items: just remove from watchlist, skip QuickRank (movie is already ranked)
    if (item.is_rewatch) {
      setRemovingMovieId(item.movie_id);
      try {
        const result = await watchlistService.removeFromWatchlist(user.id, item.movie_id);
        if (result.success) {
          setWatchlist(prev => prev.filter(w => w.movie_id !== item.movie_id));
        } else {
          showAlert('error', result.error || 'failed to mark as watched');
        }
      } finally {
        setRemovingMovieId(null);
      }
      return;
    }

    // Check if user has enough compared movies for quick rank BEFORE any async work
    const comparedMovies = getAllComparedMovies();
    const shouldQuickRank = comparedMovies.length >= 3;

    // Start quick rank immediately if eligible (before state updates cause re-render)
    if (shouldQuickRank) {
      startQuickRank({
        id: item.movie_id,
        title: item.title,
        year: item.year,
        posterUrl: item.poster_url,
      });
    }

    // Remove from watchlist
    setRemovingMovieId(item.movie_id);
    try {
      const result = await watchlistService.removeFromWatchlist(user.id, item.movie_id);
      if (result.success) {
        setWatchlist(prev => prev.filter(w => w.movie_id !== item.movie_id));

        // Mark movie as known so it appears in comparisons
        // Pass movie details so it can be added to store if not already there
        markMovieAsKnown(item.movie_id, {
          title: item.title,
          year: item.year,
          posterUrl: item.poster_url || undefined,
        });

        if (!shouldQuickRank) {
          // Not enough movies - show simple confirmation with Letterboxd option
          showAlert(
            'marked as watched',
            'want to log your review?',
            [
              { text: 'done', style: 'cancel' },
              {
                text: 'log on letterboxd',
                onPress: () => openLetterboxd(item.title, item.year),
              },
            ]
          );
        }
      } else {
        showAlert('error', result.error || 'failed to mark as watched');
      }
    } finally {
      setRemovingMovieId(null);
    }
  };

  const handleRecommendationPosterPress = useCallback((rec: MovieRecommendation) => {
    const storeMovie = movies.get(rec.movieId);
    if (storeMovie) {
      openMovieDetail(storeMovie);
    } else {
      openMovieDetail({
        id: rec.movieId,
        title: rec.title,
        year: rec.year,
        genres: [],
        posterUrl: rec.posterUrl || '',
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

  const handleWatchlistPosterPress = useCallback((item: WatchlistMovie) => {
    const storeMovie = movies.get(item.movie_id);
    if (storeMovie) {
      openMovieDetail(storeMovie, { isOnWatchlist: true });
    } else {
      openMovieDetail({
        id: item.movie_id,
        title: item.title,
        year: item.year,
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
      }, { isOnWatchlist: true });
    }
  }, [movies, openMovieDetail]);

  // Filter out dismissed recommendations and sort by match
  const allRecommendations = (result?.recommendations.filter(
    r => !dismissedIds.has(r.movieId)
  ) || []).sort((a, b) => b.recommendedBy.similarity - a.recommendedBy.similarity);

  // Check which are revealed using persisted state OR local state (for immediate UI updates)
  const isRevealed = (movieId: string) =>
    isMovieRevealed(movieId) || revealedRecs.some(r => r.movieId === movieId);

  // Get revealed recommendations from multiple sources:
  // 1. From current API result (if revealed)
  // 2. From stored revealed recommendations (for movies revealed via overlay)
  // 3. From local revealedRecs state (for immediate UI updates)
  const revealedFromResult = allRecommendations.filter(r => isRevealed(r.movieId));

  // Convert stored recommendations to display format
  const revealedFromStorage = (storedRevealedRecs || [])
    .filter(r => !revealedFromResult.some(rr => rr.movieId === r.movieId)) // Avoid duplicates
    .filter(r => !dismissedIds.has(r.movieId))
    .map(r => ({
      movieId: r.movieId,
      title: r.title,
      year: r.year,
      posterUrl: r.posterUrl,
      genres: [] as string[],
      recommendedBy: {
        userId: 'stored',
        displayName: 'Your Pick',
        similarity: 0,
        theirBeta: 0,
        theirRank: 0,
      },
      score: 0,
      reason: r.reason || 'Previously revealed',
      sharedHighRatedMovies: [] as string[],
      recommendedByMultiple: false,
    }));

  // Combine all revealed recommendations
  const revealedRecommendations = [...revealedFromResult, ...revealedFromStorage];

  // Grant first recommendation if user has enough data but no mystery cards
  // The grantFirstRecommendation function already handles stale state detection internally
  useEffect(() => {
    console.log('[Discover] Recommendation check:', {
      hasEnoughData,
      unrevealedCount,
      earnedToday,
      revealedCount,
      postOnboardingComparisons,
    });

    // Grant if user has enough data but no mystery cards
    // grantFirstRecommendation handles stale state internally by checking revealedMovieIds
    if (hasEnoughData && unrevealedCount === 0) {
      console.log('[Discover] User has enough data but no mystery cards - checking grant');
      grantFirstRecommendation();
    }
  }, [hasEnoughData, unrevealedCount, grantFirstRecommendation, earnedToday, revealedCount, postOnboardingComparisons]);

  // Show mystery cards based on what user has earned (unrevealedCount)
  // Even if backend has no recs yet, show the cards - reveal will handle empty case
  const mysteryCardCount = unrevealedCount;

  // Guest state
  if (isGuest) {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <EmptyState
            emoji=""
            title="sign in required"
            subtitle="create an account to discover personalized recommendations"
          />
        </View>
      </CinematicBackground>
    );
  }

  return (
    <CinematicBackground>
      <View style={styles.container}>
        <UnderlineTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabPress={setActiveTab}
        />

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>loading...</Text>
          </View>
        ) : activeTab === 'recommendations' ? (
          // RECOMMENDATIONS TAB
          !hasEnoughData ? (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.accent}
                />
              }
            >
              <BuildingProfileCard
                currentComparisons={postOnboardingComparisons}
                requiredComparisons={MIN_COMPARISONS_FOR_RECS}
                onContinue={() => onNavigateToCompare?.()}
              />
            </ScrollView>
          ) : (
            // New mode: mystery cards + revealed recommendations
            <FlatList
              data={[
                // Mystery cards first (limited to actual available unrevealed recs)
                ...Array(mysteryCardCount)
                  .fill(null)
                  .map((_, i) => ({ type: 'mystery' as const, index: i })),
                // Then revealed recommendations
                ...revealedRecommendations.map(rec => ({ type: 'recommendation' as const, rec })),
              ]}
              keyExtractor={(item, index) =>
                item.type === 'mystery' ? `mystery-${item.index}` : item.rec.movieId
              }
              renderItem={({ item, index }) => {
                if (item.type === 'mystery') {
                  return (
                    <MysteryCard
                      index={index}
                      onReveal={() => handleRevealMystery(item.index)}
                      isRevealing={revealingIndex === item.index}
                    />
                  );
                }
                return (
                  <RecommendationCard
                    recommendation={item.rec}
                    index={index}
                    onAddToWatchList={() => handleAddToWatchlist(item.rec)}
                    onSeenIt={() => handleSeenItRecommendation(item.rec)}
                    onNotInterested={() => handleNotInterested(item.rec.movieId)}
                    onPosterPress={() => handleRecommendationPosterPress(item.rec)}
                    isAdding={addingMovieId === item.rec.movieId}
                  />
                );
              }}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={Platform.OS !== 'web'}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.accent}
                />
              }
              ListEmptyComponent={
                mysteryCardCount === 0 && revealedRecommendations.length === 0 ? (
                  <EmptyRecommendations
                    message={result?.message || 'keep comparing movies to discover recommendations!'}
                  />
                ) : null
              }
            />
          )
        ) : (
          // WATCHLIST TAB
          <FlatList
            data={watchlist}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <WatchlistItemCard
                item={item}
                index={index}
                onWatched={() => handleWatched(item)}
                onRemove={() => handleRemoveFromWatchlist(item)}
                onPosterPress={() => handleWatchlistPosterPress(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={
              <EmptyWatchlist onDiscover={() => setActiveTab('recommendations')} />
            }
          />
        )}
      </View>
    </CinematicBackground>
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
    gap: spacing.lg,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionHeader: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },

  // Building Card
  buildingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    margin: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  buildingTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  buildingSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    marginVertical: spacing.md,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressText: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Recommendation reason (still used)
  // recReason removed

  // Watchlist Item
  watchlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  watchlistPoster: {
    marginRight: spacing.md,
  },
  watchlistPosterImage: {
    width: 60,
    height: 90,
    borderRadius: borderRadius.md,
  },
  watchlistInfo: {
    flex: 1,
  },
  watchlistTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  watchlistMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  watchlistMeta: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  rewatchBadge: {
    ...typography.tiny,
    fontSize: 9,
    color: colors.accent,
    fontWeight: '600',
  },
  watchlistActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  watchedButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  watchedButtonText: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '600',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Empty Watchlist
  emptyWatchlist: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyWatchlistTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptyWatchlistSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Placeholders
  posterPlaceholder: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
  },

  // New Release Card
  newReleaseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  // posterWithInfo removed
  newReleasePosterContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  // moreInfoButton/moreInfoText removed
  newReleasePoster: {
    width: 60,
    height: 90,
    borderRadius: borderRadius.md,
  },

  newReleaseInfo: {
    flex: 1,
  },
  newReleaseTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  newReleaseMeta: {
    ...typography.tiny,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  // tasteMatchBadge/tasteMatchText removed
  newReleaseActions: {
    marginLeft: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  seenItButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  seenItButtonText: {
    ...typography.tiny,
    color: colors.textSecondary,
  },


  // Mystery Card
  mysteryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    marginBottom: spacing.md,
  },
  mysteryPosterContainer: {
    marginRight: spacing.md,
  },
  mysteryPoster: {
    width: 60,
    height: 90,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mysteryInfo: {
    flex: 1,
  },
  mysteryTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  mysterySubtitle: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
  mysteryAction: {
    paddingHorizontal: spacing.md,
  },
  revealButtonText: {
    ...typography.captionMedium,
    color: colors.accent,
    fontWeight: '700',
  },

  // No Recs Yet
  noRecsYet: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  noRecsTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  noRecsSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
