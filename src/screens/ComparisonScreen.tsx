import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';
import { useHaptics } from '../hooks/useHaptics';
import { useAuth } from '../contexts/AuthContext';
import { useAppDimensions } from '../contexts/DimensionsContext';
import { selectPair, createSession, updateSession, UserSession, PairSelectionResult } from '../utils/pairSelector';
import { useDevSettings } from '../contexts/DevSettingsContext';
import { prefetchImages } from '../utils/imageCache';
import { Movie } from '../types';
import { VIBE_GENRE_MAP } from '../utils/genreAffinity';
import { computeTasteAxes, getArchetype } from '../utils/tasteAxes';
import { colors, spacing, borderRadius, typography, shadows, animation } from '../theme/cinematic';
import { CinematicBackground, CinematicCard } from '../components/cinematic';
import { MicroReward, RewardType, checkUnlockMilestone, checkTopMovieChange } from '../components/comparison/MicroReward';
import { RecommendationRevealOverlay } from '../components/comparison/RecommendationRevealOverlay';
import { useRecommendationTracking } from '../contexts/RecommendationTrackingContext';
import { watchlistService } from '../services/watchlistService';
import { useAlert } from '../contexts/AlertContext';


interface ComparisonScreenProps {
  onOpenRanking: () => void;
  onOpenDiscover?: () => void;
  onOpenDecide?: () => void;
  onOpenAuth?: () => void;
  onOpenProfile?: () => void;
  onOpenTop10Search?: () => void;
  onOpenTop25?: () => void;
  onOpenGlobal?: () => void;
}

type SelectionState = 'idle' | 'selected' | 'transitioning';

// Module-level cache to retain state across tab switches
let cachedPairIds: { movieAId: string; movieBId: string } | null = null;
let cachedPairHistory: Array<{ movieAId: string; movieBId: string }> = [];
let cachedFutureQueue: Array<{ movieAId: string; movieBId: string }> = [];
let cachedSwipeHistory: Array<{ movieId: string; position: 'A' | 'B'; replacedWithId: string }> = [];

export function ComparisonScreen({ onOpenRanking, onOpenDiscover, onOpenDecide, onOpenAuth, onOpenProfile, onOpenTop10Search, onOpenTop25, onOpenGlobal }: ComparisonScreenProps) {
  const {
    movies,
    totalComparisons,
    recordComparison,
    undoLastComparison,
    getRankedMovies,
    getAllComparedMovies,
    getStats,
    userSession,
    postOnboardingComparisons,
    markMovieAsUnknown,
    markMovieAsKnown,
    checkAndMaintainPool,
    comparisonExcludeIds,

  } = useAppStore();
  const { isGuest, user } = useAuth();
  const { showAlert } = useAlert();
  const { showSelectionLogic } = useDevSettings();
  const { onComparison: trackComparison, grantFirstRecommendation } = useRecommendationTracking();
  const haptics = useHaptics();
  const { containerWidth, height: screenHeight } = useAppDimensions();

  // Session state — initialize totalComparisons from store so freshness
  // calculation (which compares against movie.lastShownAt set by the store's
  // global counter) uses the same domain.
  const [session, setSession] = useState<UserSession>(() => ({
    ...createSession(),
    totalComparisons,
  }));

  // Sync local session counter with store on initial load (handles case where
  // store was still loading when useState initializer ran)
  const hasInitializedSession = useRef(false);
  useEffect(() => {
    if (!hasInitializedSession.current && totalComparisons > 0) {
      hasInitializedSession.current = true;
      setSession(prev => prev.totalComparisons === 0
        ? { ...prev, totalComparisons }
        : prev
      );
    }
  }, [totalComparisons]);

  // Current pair
  const [currentPair, setCurrentPair] = useState<{ movieA: Movie; movieB: Movie } | null>(null);
  // Selection result for debug overlay
  const [selectionResult, setSelectionResult] = useState<PairSelectionResult | null>(null);
  // History for multi-step go-back (max 5) and replay queue
  // Restore from module-level cache so undo survives tab switches
  const [pairHistory, setPairHistory] = useState<Array<{ movieA: Movie; movieB: Movie }>>(() => {
    return cachedPairHistory
      .map(h => {
        const a = movies.get(h.movieAId);
        const b = movies.get(h.movieBId);
        return a && b ? { movieA: a, movieB: b } : null;
      })
      .filter((h): h is { movieA: Movie; movieB: Movie } => h !== null);
  });
  const [futureQueue, setFutureQueue] = useState<Array<{ movieA: Movie; movieB: Movie }>>(() => {
    return cachedFutureQueue
      .map(h => {
        const a = movies.get(h.movieAId);
        const b = movies.get(h.movieBId);
        return a && b ? { movieA: a, movieB: b } : null;
      })
      .filter((h): h is { movieA: Movie; movieB: Movie } => h !== null);
  });

  // Track swipe history for multi-undo
  // Restore from module-level cache so undo survives tab switches
  const [swipeHistory, setSwipeHistory] = useState<Array<{
    movie: Movie;
    position: 'A' | 'B';
    replacedWith: Movie;
  }>>(() => {
    return cachedSwipeHistory
      .map(h => {
        const m = movies.get(h.movieId);
        const r = movies.get(h.replacedWithId);
        return m && r ? { movie: m, position: h.position, replacedWith: r } : null;
      })
      .filter((h): h is { movie: Movie; position: 'A' | 'B'; replacedWith: Movie } => h !== null);
  });

  // Sync histories to module-level cache so they survive tab switches
  useEffect(() => {
    cachedPairHistory = pairHistory.map(h => ({ movieAId: h.movieA.id, movieBId: h.movieB.id }));
  }, [pairHistory]);
  useEffect(() => {
    cachedFutureQueue = futureQueue.map(h => ({ movieAId: h.movieA.id, movieBId: h.movieB.id }));
  }, [futureQueue]);
  useEffect(() => {
    cachedSwipeHistory = swipeHistory.map(h => ({ movieId: h.movie.id, position: h.position, replacedWithId: h.replacedWith.id }));
  }, [swipeHistory]);

  // Selection state
  const [selectionState, setSelectionState] = useState<SelectionState>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);

  // Track movies added to watchlist during this session (for on-card cue)
  const [watchlistIds, setWatchlistIds] = useState<Set<string>>(new Set());

  // Micro-reward state
  const [activeReward, setActiveReward] = useState<{
    type: RewardType;
    data?: { movieTitle?: string; archetypeName?: string };
  } | null>(null);

  // Recommendation reveal overlay state
  const [showRevealOverlay, setShowRevealOverlay] = useState(false);

  // Track previous top movie for crown notification
  const [previousTopId, setPreviousTopId] = useState<string | null>(null);


  // Key for animation reset
  const [pairKey, setPairKey] = useState(0);


  // Track if we've tried to restore from cache
  const hasTriedCacheRestore = useRef(false);

  // Get movies array from Map
  const moviesArray = useMemo(() =>
    Array.from(movies.values()).filter(m => !comparisonExcludeIds.has(m.id)),
    [movies, comparisonExcludeIds]
  );

  // Get top movie
  const rankedMovies = getRankedMovies();
  const topMovie = rankedMovies[0];

  // Aaybee 100 badge color — shows grid icon on tier1 ranked movies
  const aaybee100Colors = useMemo(() => {
    const tier1 = Array.from(movies.values())
      .filter(m => (m.sourceTier || m.tier || 99) === 1)
      .sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0))
      .slice(0, 100);
    const tier1Ids = new Set(tier1.map(m => m.id));
    const rankedTier1 = rankedMovies.filter(m => tier1Ids.has(m.id));
    if (rankedTier1.length === 0) return new Map<string, string>();

    const userRankMap = new Map(rankedTier1.map((m, i) => [m.id, i]));
    const subsetGlobalMap = new Map<string, number>();
    let idx = 0;
    for (const m of tier1) {
      if (userRankMap.has(m.id)) subsetGlobalMap.set(m.id, idx++);
    }
    const maxDev = Math.max(rankedTier1.length - 1, 1);
    const result = new Map<string, string>();
    for (const [id, uRank] of userRankMap) {
      const gRank = subsetGlobalMap.get(id)!;
      const dev = uRank - gRank;
      const BAND = 5;
      if (Math.abs(dev) <= BAND) { result.set(id, colors.accent); continue; }
      const absDev = Math.abs(dev);
      const intensity = Math.min(1, Math.sqrt(absDev / (maxDev * 0.5)));
      const t = 0.25 + intensity * 0.75;
      const target = dev < 0 ? colors.success : colors.error;
      // Simple lerp
      const bg = parseInt(colors.background.slice(1), 16);
      const tg = parseInt(target.slice(1), 16);
      const r = Math.round(((bg >> 16) & 0xFF) + (((tg >> 16) & 0xFF) - ((bg >> 16) & 0xFF)) * t);
      const g = Math.round(((bg >> 8) & 0xFF) + (((tg >> 8) & 0xFF) - ((bg >> 8) & 0xFF)) * t);
      const b = Math.round((bg & 0xFF) + ((tg & 0xFF) - (bg & 0xFF)) * t);
      result.set(id, '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'));
    }
    return result;
  }, [movies, rankedMovies]);

  // Count swipes per position (max 2 allowed per position)
  const swipesPerPosition = useMemo(() => {
    const counts = { A: 0, B: 0 };
    swipeHistory.forEach(s => counts[s.position]++);
    return counts;
  }, [swipeHistory]);
  const MAX_SWIPES_PER_POSITION = 2;

  // Stats
  const stats = getStats();

  // Select next pair
  const selectNextPair = useCallback(() => {
    const vibes = userSession.preferences.vibes;
    const allCompared = getAllComparedMovies();
    const birthDecade = userSession.preferences.birthDecade;
    const primeStart = userSession.preferences.moviePrimeStart;
    const primeEnd = userSession.preferences.moviePrimeEnd;
    const poolUnlockedTier = userSession.poolUnlockedTier;
    const result = selectPair(moviesArray, session, vibes, birthDecade, postOnboardingComparisons, primeStart, primeEnd, poolUnlockedTier, allCompared);

    if (result) {
      setCurrentPair({ movieA: result.movieA, movieB: result.movieB });
      setSelectionResult(result);
      // Cache the pair IDs for tab persistence
      cachedPairIds = { movieAId: result.movieA.id, movieBId: result.movieB.id };
      setPairKey(prev => prev + 1);
      // Clear swipe history when moving to a new pair
      setSwipeHistory([]);
      console.log(`[Matchup] ${result.reason}`);

      // Prefetch poster images for the new pair
      prefetchImages([result.movieA.posterUrl, result.movieB.posterUrl]);
    }
  }, [moviesArray, session, userSession.preferences.vibes, getAllComparedMovies, userSession.preferences.birthDecade, userSession.preferences.moviePrimeStart, userSession.preferences.moviePrimeEnd, userSession.poolUnlockedTier, postOnboardingComparisons]);

  // Ref to always access the latest selectNextPair in timeouts
  const selectNextPairRef = useRef(selectNextPair);
  selectNextPairRef.current = selectNextPair;

  // Show a specific pair (shared by fresh selection and future queue replay)
  const showPair = useCallback((pair: { movieA: Movie; movieB: Movie }) => {
    setCurrentPair(pair);
    cachedPairIds = { movieAId: pair.movieA.id, movieBId: pair.movieB.id };
    setPairKey(prev => prev + 1);
    setSwipeHistory([]);
    prefetchImages([pair.movieA.posterUrl, pair.movieB.posterUrl]);
  }, []);

  const showPairRef = useRef(showPair);
  showPairRef.current = showPair;

  // Ref for futureQueue to avoid stale closures in timeouts
  const futureQueueRef = useRef(futureQueue);
  futureQueueRef.current = futureQueue;

  // Initialize first pair - restore from cache if available
  useEffect(() => {
    // Need enough movies and no current pair to proceed
    if (moviesArray.length < 2 || currentPair) return;

    // Only try cache restoration once per mount
    if (hasTriedCacheRestore.current) return;
    hasTriedCacheRestore.current = true;

    // Try to restore cached pair first
    if (cachedPairIds) {
      const movieA = movies.get(cachedPairIds.movieAId);
      const movieB = movies.get(cachedPairIds.movieBId);
      if (movieA && movieB) {
        console.log('[Matchup] Restored from cache');
        setCurrentPair({ movieA, movieB });
        setPairKey(prev => prev + 1);
        return;
      }
      console.log('[Matchup] Cache invalid, selecting new pair');
    }

    // No cache or invalid cache - select new pair
    selectNextPair();
  }, [moviesArray.length, movies, currentPair, selectNextPair]);


  // Handle choice
  const handleChoice = useCallback((chosenId: string) => {
    if (!currentPair || selectionState !== 'idle') return;

    const isMovieA = chosenId === currentPair.movieA.id;
    const winnerMovie = isMovieA ? currentPair.movieA : currentPair.movieB;
    const loserMovie = isMovieA ? currentPair.movieB : currentPair.movieA;

    // Haptic feedback
    haptics.success();

    // Push current pair to history (max 5)
    setPairHistory(prev => [...prev.slice(-4), { movieA: currentPair.movieA, movieB: currentPair.movieB }]);

    // Set selection state
    setSelectionState('selected');
    setWinnerId(chosenId);

    // Store previous top and ranked count before recording
    const prevTop = topMovie?.id || null;
    setPreviousTopId(prevTop);

    // Record the comparison
    const previousTotal = totalComparisons;
    recordComparison(winnerMovie.id, loserMovie.id, false);

    // Update session
    const newSession = updateSession(
      session,
      currentPair.movieA.id,
      currentPair.movieB.id,
      false
    );
    setSession(newSession);

    // Track comparison for daily recommendations (only after recommendations feature unlocks at 40)
    // Note: postOnboardingComparisons is the value BEFORE this comparison, so +1 for the new value
    const newPostOnboarding = postOnboardingComparisons + 1;
    const recTrackResult = newPostOnboarding > 40 ? trackComparison() : { unlocked: false };

    // Compute reward immediately (show after transition)
    let pendingReward: { type: RewardType; data?: { movieTitle?: string; archetypeName?: string } } | null = null;

    const unlockMilestone = checkUnlockMilestone(newPostOnboarding, postOnboardingComparisons);
    if (unlockMilestone) {
      if (unlockMilestone === 'unlock_recommendations') {
        grantFirstRecommendation();
      }
      if (unlockMilestone === 'taste_preview') {
        const ranked = getRankedMovies();
        const movieData = ranked.map(m => ({
          year: m.year,
          genres: m.genres as string[],
          userBeta: m.beta,
        }));
        const axes = computeTasteAxes(movieData);
        const archetype = getArchetype(axes);
        pendingReward = { type: unlockMilestone, data: { archetypeName: archetype.name } };
      } else {
        pendingReward = { type: unlockMilestone };
      }
    } else if (recTrackResult.unlocked && newPostOnboarding > 40) {
      // Skip MicroReward, go straight to reveal overlay
      setShowRevealOverlay(true);
    } else {
      const newRanked = getRankedMovies();
      const newTop = newRanked[0];
      if (newTop && prevTop && checkTopMovieChange(prevTop, newTop.id)) {
        pendingReward = {
          type: 'new_top_movie',
          data: { movieTitle: newTop.title },
        };
      }
    }

    // Detect if either movie just crossed the 2-comparison ranking threshold
    // totalComparisons is 1 BEFORE this comparison is recorded, so after recording it will be 2
    const justRankedA = currentPair.movieA.totalComparisons === 1;
    const justRankedB = currentPair.movieB.totalComparisons === 1;
    const justRanked = justRankedA || justRankedB;

    // Check if the just-ranked movie is an Aaybee 100 candidate (tier 1)
    const isAaybee100Collection =
      (justRankedA && (currentPair.movieA.sourceTier || currentPair.movieA.tier || 99) === 1) ||
      (justRankedB && (currentPair.movieB.sourceTier || currentPair.movieB.tier || 99) === 1);

    // Maintain pool after every comparison
    checkAndMaintainPool();

    // Single transition after winner/loser animation completes
    // Aaybee 100 collections get extra time so the badge is visible
    setTimeout(() => {
      // Show reward BEFORE loading next pair so overlay covers the transition
      if (pendingReward) {
        setActiveReward(pendingReward);
      }

      // Replay from future queue if available, else generate fresh pair
      if (futureQueueRef.current.length > 0) {
        const [next, ...rest] = futureQueueRef.current;
        setFutureQueue(rest);
        showPairRef.current(next);
      } else {
        selectNextPairRef.current();
      }
      setSelectionState('idle');
      setWinnerId(null);
    }, isAaybee100Collection ? 1800 : justRanked ? 1000 : 350);
  }, [currentPair, selectionState, session, haptics, recordComparison, topMovie, totalComparisons, getRankedMovies, postOnboardingComparisons, trackComparison, checkAndMaintainPool]);

  // Handle go back (undo last comparison, up to 5 steps)
  const handleGoBack = useCallback(() => {
    if (pairHistory.length === 0 || selectionState !== 'idle') return;

    haptics.light();
    const undone = undoLastComparison();
    if (!undone) return;

    // Pop last pair from history
    const prev = pairHistory[pairHistory.length - 1];
    setPairHistory(h => h.slice(0, -1));

    // Push current pair to front of future queue (for replay when going forward)
    if (currentPair) {
      setFutureQueue(q => [currentPair, ...q]);
    }

    // Show the previous pair
    setCurrentPair(prev);
    cachedPairIds = { movieAId: prev.movieA.id, movieBId: prev.movieB.id };
    setPairKey(p => p + 1);

    // Revert local session counter
    setSession(s => ({
      ...s,
      totalComparisons: Math.max(0, s.totalComparisons - 1),
    }));
  }, [pairHistory, currentPair, selectionState, haptics, undoLastComparison]);

  // Desktop keyboard shortcuts
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const { innerWidth } = window;
    if (innerWidth < 1024) return;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft' && currentPair) {
        e.preventDefault();
        handleChoice(currentPair.movieA.id);
      } else if (e.key === 'ArrowRight' && currentPair) {
        e.preventDefault();
        handleChoice(currentPair.movieB.id);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (selectionState === 'idle' && currentPair) {
          selectNextPairRef.current();
        }
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        handleGoBack();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPair, selectionState, handleChoice, handleGoBack]);

  // Handle swipe away (mark as unknown and replace)
  const handleSwipeAway = useCallback((position: 'A' | 'B') => {
    if (!currentPair || selectionState !== 'idle') return;

    haptics.light();
    const movieToReplace = position === 'A' ? currentPair.movieA : currentPair.movieB;
    const otherMovie = position === 'A' ? currentPair.movieB : currentPair.movieA;

    // Mark the swiped movie as unknown
    markMovieAsUnknown(movieToReplace.id);

    // Clear replay queue — pair composition changed
    setFutureQueue([]);

    // Count swipes already made (not including this one)
    const swipesMade = swipeHistory.length;

    // Build exclusion set
    const excludeIds = new Set<string>(comparisonExcludeIds);
    excludeIds.add(movieToReplace.id);
    excludeIds.add(otherMovie.id);
    swipeHistory.forEach(s => excludeIds.add(s.movie.id));
    session.recentlyShownIds.forEach(id => excludeIds.add(id));

    // Determine the era of the swiped movie
    const birthDecade = userSession.preferences.birthDecade;
    const primeStart = userSession.preferences.moviePrimeStart;
    const primeEnd = userSession.preferences.moviePrimeEnd;
    const movieYear = movieToReplace.year;

    type EraType = 'childhood' | 'prime' | 'adjacent' | 'alltimer';
    let originalEra: EraType = 'alltimer';

    if (birthDecade && primeStart && primeEnd) {
      const childhoodEnd = birthDecade + 14;
      const adjacentBeforeStart = primeStart - 10;
      const adjacentAfterEnd = primeEnd + 10;

      if (movieYear >= birthDecade && movieYear <= childhoodEnd) {
        originalEra = 'childhood';
      } else if (movieYear >= primeStart && movieYear <= primeEnd) {
        originalEra = 'prime';
      } else if ((movieYear >= adjacentBeforeStart && movieYear < primeStart) ||
                 (movieYear > primeEnd && movieYear <= adjacentAfterEnd)) {
        originalEra = 'adjacent';
      }
    }

    // Helper to filter by era
    const filterByEra = (movie: Movie, era: EraType): boolean => {
      if (!birthDecade || !primeStart || !primeEnd) return true;
      const year = movie.year;
      const childhoodEnd = birthDecade + 14;
      const adjacentBeforeStart = primeStart - 10;
      const adjacentAfterEnd = primeEnd + 10;

      switch (era) {
        case 'childhood':
          return year >= birthDecade && year <= childhoodEnd;
        case 'prime':
          return year >= primeStart && year <= primeEnd;
        case 'adjacent':
          return (year >= adjacentBeforeStart && year < primeStart) ||
                 (year > primeEnd && year <= adjacentAfterEnd);
        case 'alltimer':
          return true; // All-timer can be any year
      }
    };

    // After 2 swipes (on 3rd+ replacement), use known movies
    const statusFilter = swipesMade >= 2
      ? (m: Movie) => m.status === 'known'
      : (m: Movie) => m.status !== 'unknown';

    // Try to find replacement from same era, prioritizing by tier
    let replacement: Movie | null = null;
    const tiers = [1, 2, 3, 4];
    const eraOrder: EraType[] = [originalEra, 'prime', 'adjacent', 'alltimer', 'childhood']
      .filter((e, i, arr) => arr.indexOf(e) === i) as EraType[]; // Dedupe while preserving order

    // Search by era priority, then by tier (avoid same franchise as other movie)
    const otherCollectionId = otherMovie.collectionId;
    for (const era of eraOrder) {
      for (const tier of tiers) {
        const candidates = Array.from(movies.values()).filter(m =>
          !excludeIds.has(m.id) &&
          statusFilter(m) &&
          (m.tier || 1) === tier &&
          filterByEra(m, era) &&
          !(m.collectionId && otherCollectionId && m.collectionId === otherCollectionId)
        );
        if (candidates.length > 0) {
          replacement = candidates[Math.floor(Math.random() * candidates.length)];
          console.log(`[Swipe] Replacement from ${era} era, tier ${tier}: ${replacement.title} (${replacement.year})`);
          break;
        }
      }
      if (replacement) break;
    }

    // Final fallback: any non-unknown movie
    if (!replacement) {
      const fallbackCandidates = Array.from(movies.values()).filter(m =>
        !excludeIds.has(m.id) &&
        m.status !== 'unknown'
      );
      if (fallbackCandidates.length > 0) {
        replacement = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
        console.log(`[Swipe] Fallback replacement: ${replacement.title}`);
      }
    }

    if (!replacement) {
      // No replacement available, just get a new pair
      setSwipeHistory([]);
      selectNextPairRef.current();
      return;
    }

    // Push to history for undo
    setSwipeHistory(prev => [...prev, {
      movie: movieToReplace,
      position,
      replacedWith: replacement!,
    }]);

    // Update the pair with the replacement (no pairKey change to avoid re-animation)
    const newPair = position === 'A'
      ? { movieA: replacement, movieB: otherMovie }
      : { movieA: otherMovie, movieB: replacement };

    setCurrentPair(newPair);
    cachedPairIds = { movieAId: newPair.movieA.id, movieBId: newPair.movieB.id };

    // Maintain pool — silently promotes one movie from next tier if needed
    checkAndMaintainPool();
  }, [currentPair, selectionState, haptics, markMovieAsUnknown, movies, session.recentlyShownIds, swipeHistory, userSession.preferences, checkAndMaintainPool, comparisonExcludeIds]);

  // Handle swipe away with confirmation for compared movies
  const handleSwipeAwayWithConfirmation = useCallback((position: 'A' | 'B') => {
    if (!currentPair || selectionState !== 'idle') return;

    const movie = position === 'A' ? currentPair.movieA : currentPair.movieB;

    if (movie.totalComparisons > 0) {
      // Movie has been compared — confirm before removing
      showAlert(
        'are you sure?',
        'you have already compared this movie. if you go ahead you won\'t see this movie in comparisons any more',
        [
          { text: 'no, let\'s keep this movie', style: 'cancel' },
          {
            text: 'yes, I am sure',
            style: 'destructive',
            onPress: () => handleSwipeAway(position),
          },
        ]
      );
    } else {
      // Uncompared movie — swipe away directly
      handleSwipeAway(position);
    }
  }, [currentPair, selectionState, showAlert, handleSwipeAway]);

  // Handle swipe up (add to rewatch watchlist) — ranked movies only, card stays
  const handleSwipeUp = useCallback((position: 'A' | 'B') => {
    if (!currentPair || selectionState !== 'idle') return;

    // Guest users: show sign-in prompt
    if (isGuest) {
      showAlert(
        'sign in required',
        'create an account to save movies to your watchlist',
        [
          { text: 'not now', style: 'cancel' },
          { text: 'sign in', onPress: () => onOpenAuth?.() },
        ]
      );
      return;
    }

    const movie = position === 'A' ? currentPair.movieA : currentPair.movieB;

    if (user) {
      watchlistService.addToWatchlist(
        user.id,
        movie.id,
        'manual',
        undefined,
        undefined,
        { title: movie.title, year: movie.year, posterUrl: movie.posterUrl || '' },
        true // rewatch
      ).catch(console.error);
    }

    setWatchlistIds(prev => new Set(prev).add(movie.id));
  }, [currentPair, selectionState, isGuest, user, showAlert, onOpenAuth]);

  // Handle swipe down (add to first-watch watchlist) — unranked movies only, card gets replaced
  const handleSwipeDown = useCallback((position: 'A' | 'B') => {
    if (!currentPair || selectionState !== 'idle') return;

    // Guest users: show sign-in prompt
    if (isGuest) {
      showAlert(
        'sign in required',
        'create an account to save movies to your watchlist',
        [
          { text: 'not now', style: 'cancel' },
          { text: 'sign in', onPress: () => onOpenAuth?.() },
        ]
      );
      return;
    }

    const movie = position === 'A' ? currentPair.movieA : currentPair.movieB;

    if (user) {
      watchlistService.addToWatchlist(
        user.id,
        movie.id,
        'manual',
        undefined,
        undefined,
        { title: movie.title, year: movie.year, posterUrl: movie.posterUrl || '' },
        false // first watch
      ).catch(console.error);
    }

    // Remove from comparison pool
    handleSwipeAway(position);
  }, [currentPair, selectionState, isGuest, user, handleSwipeAway, showAlert, onOpenAuth]);

  // Undo last swipe away (pops from history stack)
  const handleUndoSwipe = useCallback(() => {
    if (swipeHistory.length === 0 || !currentPair || selectionState !== 'idle') return;

    haptics.light();

    // Pop the last swipe from history
    const lastSwipe = swipeHistory[swipeHistory.length - 1];

    // Restore the movie to uncompared status
    markMovieAsKnown(lastSwipe.movie.id);

    // Put the movie back in the pair
    const restoredPair = lastSwipe.position === 'A'
      ? { movieA: lastSwipe.movie, movieB: currentPair.movieB }
      : { movieA: currentPair.movieA, movieB: lastSwipe.movie };

    setCurrentPair(restoredPair);
    cachedPairIds = { movieAId: restoredPair.movieA.id, movieBId: restoredPair.movieB.id };
    setSwipeHistory(prev => prev.slice(0, -1));
  }, [swipeHistory, currentPair, selectionState, haptics, markMovieAsKnown]);

  // Clear reward
  const handleRewardComplete = useCallback(() => {
    setActiveReward(null);
  }, []);

  // Handle ranked moment — haptic only, badge pulse does the visual work
  const handleRanked = useCallback(() => {
    haptics.heavy();
  }, [haptics]);

  // Handle Aaybee 100 collection — distinct double-haptic (medium + success burst)
  const handleAaybee100Collected = useCallback(() => {
    haptics.medium();
    setTimeout(() => haptics.success(), 200);
  }, [haptics]);

  // Era classification helper for debug overlay
  const getMovieEra = (movie: Movie): string => {
    const birthDecade = userSession.preferences.birthDecade;
    const primeStart = userSession.preferences.moviePrimeStart;
    const primeEnd = userSession.preferences.moviePrimeEnd;
    if (!birthDecade || !primeStart || !primeEnd) return '-';

    const childhoodEnd = birthDecade + 14;
    const adjacentBeforeStart = primeStart - 10;
    const adjacentAfterEnd = primeEnd + 10;

    if (movie.year >= birthDecade && movie.year <= childhoodEnd) return 'childhood';
    if (movie.year >= primeStart && movie.year <= primeEnd) return 'prime';
    if ((movie.year >= adjacentBeforeStart && movie.year < primeStart) ||
        (movie.year > primeEnd && movie.year <= adjacentAfterEnd)) return 'adjacent';
    return 'classic';
  };

  // Format TMDB votes compactly
  const formatVotes = (count?: number): string => {
    if (!count) return '-';
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  };

  if (!currentPair) {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.loading}>
            <Text style={styles.loadingText}>loading...</Text>
          </View>
        </View>
      </CinematicBackground>
    );
  }

  return (
    <CinematicBackground>
      <View style={styles.container}>
        {/* Main comparison area - posters are the heroes */}
        <View style={styles.comparisonArea}>
          {/* Prompt */}
          <Text style={styles.prompt}>
            Which movie do you like more?
          </Text>

          <View key={`cards-${pairKey}`} style={styles.cardsContainer}>
            {/* Left card */}
            {(() => {
              const idxA = rankedMovies.findIndex(m => m.id === currentPair.movieA.id);
              const isRankedA = currentPair.movieA.totalComparisons > 0;
              const canSwipeA = swipesPerPosition.A < MAX_SWIPES_PER_POSITION;
              const rankingStatusA = idxA !== -1 ? undefined
                : currentPair.movieA.totalComparisons === 0 ? 'unranked'
                : currentPair.movieA.totalComparisons === 1 ? '1 more'
                : undefined;
              return (
                <CinematicCard
                  movie={currentPair.movieA}
                  onSelect={() => handleChoice(currentPair.movieA.id)}
                  onSwipeAway={canSwipeA ? () => handleSwipeAwayWithConfirmation('A') : undefined}
                  onSwipeUp={canSwipeA && !isRankedA ? () => handleSwipeDown('A') : undefined}
                  onSwipeDown={canSwipeA && isRankedA ? () => handleSwipeUp('A') : undefined}
                  shouldConfirmSwipeAway={isRankedA}
                  disabled={selectionState !== 'idle'}
                  isWinner={winnerId === currentPair.movieA.id}
                  isLoser={winnerId === currentPair.movieB.id}
                  label="A"
                  labelColor="#E5A84B"
                  position="left"
                  rank={idxA === -1 ? undefined : idxA + 1}
                  rankingStatus={rankingStatusA}
                  isOnWatchlist={watchlistIds.has(currentPair.movieA.id)}
                  onRanked={handleRanked}
                  onAaybee100Collected={handleAaybee100Collected}
                  aaybee100Color={aaybee100Colors.get(currentPair.movieA.id)}
                />
              );
            })()}

            {/* Right card */}
            {(() => {
              const idxB = rankedMovies.findIndex(m => m.id === currentPair.movieB.id);
              const isRankedB = currentPair.movieB.totalComparisons > 0;
              const canSwipeB = swipesPerPosition.B < MAX_SWIPES_PER_POSITION;
              const rankingStatusB = idxB !== -1 ? undefined
                : currentPair.movieB.totalComparisons === 0 ? 'unranked'
                : currentPair.movieB.totalComparisons === 1 ? '1 more'
                : undefined;
              return (
                <CinematicCard
                  movie={currentPair.movieB}
                  onSelect={() => handleChoice(currentPair.movieB.id)}
                  onSwipeAway={canSwipeB ? () => handleSwipeAwayWithConfirmation('B') : undefined}
                  onSwipeUp={canSwipeB && !isRankedB ? () => handleSwipeDown('B') : undefined}
                  onSwipeDown={canSwipeB && isRankedB ? () => handleSwipeUp('B') : undefined}
                  shouldConfirmSwipeAway={isRankedB}
                  disabled={selectionState !== 'idle'}
                  isWinner={winnerId === currentPair.movieB.id}
                  isLoser={winnerId === currentPair.movieA.id}
                  label="B"
                  labelColor="#4ABFED"
                  position="right"
                  rank={idxB === -1 ? undefined : idxB + 1}
                  rankingStatus={rankingStatusB}
                  isOnWatchlist={watchlistIds.has(currentPair.movieB.id)}
                  onRanked={handleRanked}
                  onAaybee100Collected={handleAaybee100Collected}
                  aaybee100Color={aaybee100Colors.get(currentPair.movieB.id)}
                />
              );
            })()}
          </View>

          {/* Selection debug overlay */}
          {showSelectionLogic && currentPair && (
            <View style={styles.debugOverlay}>
              <Text style={styles.debugStrategy} numberOfLines={2}>
                {selectionResult?.reason || 'cached pair'}
              </Text>
              <View style={styles.debugMoviesRow}>
                {[currentPair.movieA, currentPair.movieB].map((movie, i) => {
                  const genres = movie.genres || [];
                  const vibes = userSession.preferences.vibes;
                  const vibeHits: string[] = [];
                  if (vibes?.tone && VIBE_GENRE_MAP.tone[vibes.tone].some(g => genres.includes(g as any))) vibeHits.push(vibes.tone[0]);
                  if (vibes?.entertainment && VIBE_GENRE_MAP.entertainment[vibes.entertainment].some(g => genres.includes(g as any))) vibeHits.push(vibes.entertainment[0]);
                  if (vibes?.pacing && VIBE_GENRE_MAP.pacing[vibes.pacing].some(g => genres.includes(g as any))) vibeHits.push(vibes.pacing[0]);
                  const vibeTotal = (vibes?.tone ? 1 : 0) + (vibes?.entertainment ? 1 : 0) + (vibes?.pacing ? 1 : 0);
                  return (
                  <View key={movie.id} style={styles.debugMovieCol}>
                    <Text style={styles.debugMovieLabel}>{i === 0 ? 'A' : 'B'}</Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>era </Text>
                      <Text style={styles.debugVal}>{getMovieEra(movie)}</Text>
                    </Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>tier </Text>
                      <Text style={styles.debugVal}>T{movie.sourceTier || movie.tier || 1}</Text>
                    </Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>tmdb </Text>
                      <Text style={styles.debugVal}>
                        {movie.voteAverage?.toFixed(1) || '-'} ({formatVotes(movie.voteCount)})
                      </Text>
                    </Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>{'\u03B2'} </Text>
                      <Text style={styles.debugVal}>
                        {movie.beta >= 0 ? '+' : ''}{movie.beta.toFixed(2)}
                      </Text>
                    </Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>cmp </Text>
                      <Text style={styles.debugVal}>{movie.totalComparisons}</Text>
                    </Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>status </Text>
                      <Text style={styles.debugVal}>{movie.status}</Text>
                    </Text>
                    <Text style={styles.debugField}>
                      <Text style={styles.debugKey}>vibe </Text>
                      <Text style={styles.debugVal}>{vibeTotal > 0 ? `${vibeHits.length}/${vibeTotal}` : '-'}</Text>
                    </Text>
                  </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* go-back + undo-swipe row */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.goBackButton, (pairHistory.length === 0 || selectionState !== 'idle') && styles.buttonDisabled]}
              onPress={handleGoBack}
              disabled={pairHistory.length === 0 || selectionState !== 'idle'}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                  fill={(pairHistory.length === 0 || selectionState !== 'idle') ? colors.border : colors.textMuted}
                />
              </Svg>
            </Pressable>
            <Pressable
              style={[styles.undoSwipeButton, (swipeHistory.length === 0 || selectionState !== 'idle') && styles.buttonDisabled]}
              onPress={handleUndoSwipe}
              disabled={swipeHistory.length === 0 || selectionState !== 'idle'}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
                  fill={(swipeHistory.length === 0 || selectionState !== 'idle') ? colors.border : colors.textMuted}
                />
              </Svg>
            </Pressable>
          </View>

        </View>


        {/* Micro Reward */}
        {activeReward && (
          <MicroReward
            type={activeReward.type}
            data={activeReward.data}
            onComplete={handleRewardComplete}
            onNavigate={
              activeReward.type === 'unlock_top10_search' ? onOpenTop10Search :
              activeReward.type === 'unlock_recommendations' ? onOpenDiscover :
              activeReward.type === 'unlock_top25' ? onOpenTop25 :
              activeReward.type === 'unlock_decide' ? onOpenDecide :
              activeReward.type === 'unlock_all_rankings' ? onOpenGlobal :
              activeReward.type === 'unlock_taste_profile' ? onOpenProfile :
              undefined
            }
          />
        )}

        {/* Recommendation Reveal Overlay */}
        <RecommendationRevealOverlay
          visible={showRevealOverlay}
          onComplete={() => setShowRevealOverlay(false)}
        />

      </View>
    </CinematicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textMuted,
  },

  // Comparison area - posters are the heroes
  comparisonArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  prompt: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  cardsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  goBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  undoSwipeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // Debug overlay
  debugOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  debugStrategy: {
    fontSize: 10,
    fontWeight: '600',
    color: '#60a5fa',
    marginBottom: 6,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  debugMoviesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  debugMovieCol: {
    flex: 1,
  },
  debugMovieLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  debugField: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  debugKey: {
    color: 'rgba(255,255,255,0.4)',
  },
  debugVal: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },

});
