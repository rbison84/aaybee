import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Genre, Movie, MovieStatus } from '../types';
import { processComparison, getStatusEmoji, getConfidenceMultiplier } from '../utils/statusManager';
import { getAdaptiveK, INITIAL_BETA } from '../utils/ranking';
import { logger } from '../utils/logger';

const log = logger.create('Store');
import { getMovies, clearMovieCache } from '../services/movieCache';
import {
  UserSession,
  MovieState,
  ComparisonRecord,
  PersistedState,
  createInitialUserSession,
  createInitialMoviesState,
  loadAllState,
  saveUserSession,
  saveMoviesState,
  saveComparisonHistory,
  saveAllState,
  clearAllData,
  mergeMovieStateWithData,
  extractMovieState,
} from './persistence';
import * as syncService from '../services/syncService';
import * as db from '../services/database';
import { globalRankingsService } from '../services/globalRankingsService';
import { activityService } from '../services/activityService';
import { computeGenreAffinity } from '../utils/genreAffinity';
import { useAuth } from '../contexts/AuthContext';

// ============================================
// Types
// ============================================

interface AppState {
  isLoading: boolean;
  userSession: UserSession;
  movies: Map<string, Movie>;
  comparisonHistory: ComparisonRecord[];
  isSyncing: boolean;
  discoveryMovieIds: string[];
}

interface AppActions {
  // Initialization
  initializeApp: () => Promise<void>;

  // User preferences
  updateGenreScore: (genre: Genre, delta: number) => void;
  setGenrePreferences: (genres: Genre[]) => void;
  setBirthDecade: (decade: number) => void;
  setVibePreferences: (vibes: { tone?: 'light' | 'heavy' | null; entertainment?: 'laughs' | 'thrills' | null; pacing?: 'slow' | 'fast' | null }) => void;
  completeOnboarding: () => void;
  setHasSeenSwipeUpTutorial: () => void;
  setHasSeenGoBackTooltip: () => void;

  // Comparisons
  recordComparison: (winnerId: string, loserId: string, skipped?: boolean) => void;
  undoLastComparison: () => ComparisonRecord | null;

  // Data access
  getMovie: (movieId: string) => Movie | undefined;
  getMoviesByStatus: (status: MovieStatus) => Movie[];
  getRankedMovies: () => Movie[];
  getAllComparedMovies: () => Movie[];
  getTopGenres: (count?: number) => Genre[];
  getStats: () => {
    total: number;
    known: number;
    uncertain: number;
    unknown: number;
    uncompared: number;
  };

  // Computed values
  totalComparisons: number;
  hasCompletedOnboarding: boolean;
  postOnboardingComparisons: number;

  // Sync
  syncToServer: () => Promise<boolean>;
  loadFromServer: () => Promise<boolean>;

  // Discovery queue
  addDiscoveryMovie: (movieId: string) => void;
  popDiscoveryMovie: () => string | undefined;

  // Mark movie as known (for watched movies from watchlist/discovery)
  // If movie doesn't exist in store, provide movieDetails to add it
  markMovieAsKnown: (movieId: string, movieDetails?: {
    title: string;
    year: number;
    posterUrl?: string;
    genres?: Genre[];
    posterColor?: string;
    overview?: string;
    voteAverage?: number;
    voteCount?: number;
    directorName?: string;
    directorId?: string;
    collectionId?: number;
    collectionName?: string;
    certification?: string;
    tmdbId?: number;
    posterPath?: string;
    originalLanguage?: string;
  }) => void;
  markMovieAsUnknown: (movieId: string) => void;

  // Pool maintenance - promotes one movie from the next tier if pool is low
  checkAndMaintainPool: () => void;

  // Recommendation tracking
  getRevealedMovieIds: () => string[];
  markMovieAsRevealed: (movieId: string) => void;

  // Comparison exclusions (watchlist, recommendations, new releases)
  comparisonExcludeIds: Set<string>;
  setComparisonExcludeIds: (ids: Set<string>) => void;

  // Debug/Admin
  resetAllData: () => Promise<void>;
  exportData: () => Promise<string>;
}


// ============================================
// Context
// ============================================

const AppContext = createContext<(AppState & AppActions) | null>(null);

// ============================================
// Helper Functions
// ============================================

function initializeMoviesMap(movieStates: MovieState[], movieData: Movie[]): Map<string, Movie> {
  const map = new Map<string, Movie>();

  // Create a lookup for movie states by ID
  const stateById = new Map(movieStates.map(s => [s.id, s]));

  // Merge movie data with state
  movieData.forEach(movie => {
    const state = stateById.get(movie.id);
    if (state) {
      map.set(movie.id, mergeMovieStateWithData(state, movie));
    } else {
      // New movie not in saved state
      map.set(movie.id, { ...movie });
    }
  });

  return map;
}

// ============================================
// Provider Component
// ============================================

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isGuest, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userSession, setUserSession] = useState<UserSession>(createInitialUserSession);
  const [movies, setMovies] = useState<Map<string, Movie>>(() => new Map());
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonRecord[]>([]);
  const [discoveryMovieIds, setDiscoveryMovieIds] = useState<string[]>([]);
  const [comparisonExcludeIds, setComparisonExcludeIds] = useState<Set<string>>(() => new Set());

  // Track previous user ID to detect auth changes
  const prevUserIdRef = useRef<string | null>(null);
  const lastGlobalStatsRecalc = useRef<number>(0);
  const globalStatsDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounced global stats recalculation - max once per 5 minutes
  const scheduleGlobalStatsRecalc = useCallback(() => {
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;

    // If we recalculated recently, skip
    if (now - lastGlobalStatsRecalc.current < FIVE_MINUTES) {
      return;
    }

    // Clear any pending timer
    if (globalStatsDebounceTimer.current) {
      clearTimeout(globalStatsDebounceTimer.current);
    }

    // Schedule recalculation after 30 seconds of inactivity
    globalStatsDebounceTimer.current = setTimeout(() => {
      log.info(' Triggering debounced global stats recalculation...');
      lastGlobalStatsRecalc.current = Date.now();
      globalRankingsService.recalculateAllGlobalStats().catch(console.error);
    }, 30000);
  }, []);
  const hasInitializedRef = useRef(false);
  const hasLoadedServerDataRef = useRef(false);

  // ============================================
  // Initialization
  // ============================================

  const initializeApp = useCallback(async () => {
    setIsLoading(true);
    const t0 = Date.now();

    try {
      // Load movie data and saved state in parallel
      log.info(' Loading movies and saved state...');
      const [movieData, savedState] = await Promise.all([
        getMovies(),
        loadAllState(),
      ]);
      const t1 = Date.now();
      console.log(`[Store] Loaded ${movieData.length} movies + state in ${t1 - t0}ms`);

      if (savedState) {
        // Restore saved state, merging with current movie data
        setUserSession(savedState.userSession);
        setMovies(initializeMoviesMap(savedState.moviesState, movieData));
        setComparisonHistory(savedState.comparisonHistory);
        log.info(` Restored saved state (total ${Date.now() - t0}ms)`);
      } else {
        // Initialize fresh state
        const newSession = createInitialUserSession();
        const initialMovieStates = createInitialMoviesState(movieData);

        setUserSession(newSession);
        setMovies(initializeMoviesMap(initialMovieStates, movieData));
        setComparisonHistory([]);

        // Save initial state
        await saveAllState({
          version: 1,
          userSession: newSession,
          moviesState: initialMovieStates,
          comparisonHistory: [],
        });
        log.info(` Created fresh state (total ${Date.now() - t0}ms)`);
      }

      hasInitializedRef.current = true;
    } catch (error) {
      log.error(' Initialization failed:', error);
      throw error;
    }

    setIsLoading(false);
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // ============================================
  // Auth Change Handler - Load/Migrate Data
  // ============================================

  useEffect(() => {
    // Wait for both auth and app to be loaded
    if (authLoading || isLoading || !hasInitializedRef.current) {
      return;
    }

    const currentUserId = user?.id || null;
    const isFirstAuthCheck = prevUserIdRef.current === null && !hasLoadedServerDataRef.current;

    // Handle different scenarios
    if (currentUserId && isFirstAuthCheck) {
      // App opened with logged-in user: Check if we should load from server
      // Only load if local data appears to be empty/minimal (new device scenario)
      const hasMinimalLocalData = userSession.totalComparisons < 5;

      if (hasMinimalLocalData) {
        log.info(' Returning user detected with minimal local data, loading from server...');
        hasLoadedServerDataRef.current = true;
        handleLoadFromServer(currentUserId);
      } else {
        log.info(' Returning user with existing local data, keeping local state');
        hasLoadedServerDataRef.current = true;
      }

      prevUserIdRef.current = currentUserId;
    } else if (currentUserId !== prevUserIdRef.current) {
      const wasGuest = prevUserIdRef.current === null;
      const isNowLoggedIn = currentUserId !== null;

      console.log(`[Store] Auth changed: ${wasGuest ? 'guest' : prevUserIdRef.current} → ${currentUserId || 'guest'}`);

      if (wasGuest && isNowLoggedIn && !isFirstAuthCheck) {
        // Guest → Logged in: Migrate local data to server
        handleGuestToUserMigration(currentUserId);
      } else if (!wasGuest && isNowLoggedIn && prevUserIdRef.current !== currentUserId) {
        // Different user logged in: Load their data
        handleLoadFromServer(currentUserId);
      } else if (!wasGuest && !isNowLoggedIn) {
        // User signed out: Reset to fresh guest state
        log.info(' User signed out, resetting to fresh state...');
        handleSignOut();
      }

      prevUserIdRef.current = currentUserId;
    }
  }, [user?.id, authLoading, isLoading, userSession.totalComparisons]);

  const handleGuestToUserMigration = async (userId: string) => {
    log.info(' Migrating guest data to user account...');
    setIsSyncing(true);

    try {
      // Get movies that have been interacted with
      const interactedMovies = Array.from(movies.values()).filter(
        m => m.status !== 'uncompared' || m.totalComparisons > 0
      );

      if (interactedMovies.length === 0) {
        log.info(' No data to migrate');
        setIsSyncing(false);
        return;
      }

      // Sync profile
      await syncService.syncProfile(
        userId,
        userSession.preferences,
        userSession.totalComparisons
      );

      // Sync all interacted movies
      await syncService.syncAllUserMovies(userId, interactedMovies);

      console.log(`[Store] Migrated ${interactedMovies.length} movies to server`);
    } catch (error) {
      log.error(' Migration failed:', error);
    }

    setIsSyncing(false);
  };

  const handleLoadFromServer = async (userId: string) => {
    log.info(' Loading data from server...');
    setIsSyncing(true);

    try {
      const serverData = await syncService.loadFromServer(userId);

      if (serverData && serverData.userMovies.length > 0) {
        // Merge server data with local movie catalog
        const mergedMovies = syncService.mergeMovieData(
          movies,
          serverData.userMovies,
          serverData.globalMovies
        );

        setMovies(mergedMovies);

        // Update session from server
        if (serverData.profile) {
          setUserSession(prev => ({
            ...prev,
            totalComparisons: serverData.profile!.total_comparisons,
            onboardingComplete: serverData.profile!.onboarding_complete,
            preferences: {
              ...prev.preferences,
              birthDecade: serverData.profile!.birth_decade || prev.preferences.birthDecade,
              moviePrimeStart: serverData.profile!.movie_prime_start || prev.preferences.moviePrimeStart,
              moviePrimeEnd: serverData.profile!.movie_prime_end || prev.preferences.moviePrimeEnd,
            },
          }));
        }

        // Save merged state locally
        const moviesState = Array.from(mergedMovies.values()).map(extractMovieState);
        await saveMoviesState(moviesState);

        console.log(`[Store] Loaded ${serverData.userMovies.length} movies from server`);
      }
    } catch (error) {
      log.error(' Failed to load from server:', error);
    }

    setIsSyncing(false);
  };

  const handleSignOut = async () => {
    log.info(' Clearing local state after sign out...');

    // Get fresh movie data (without user-specific state)
    const movieData = await getMovies();

    // Reset to initial state
    const newSession = createInitialUserSession();
    const initialMovieStates = createInitialMoviesState(movieData);

    setUserSession(newSession);
    setMovies(initializeMoviesMap(initialMovieStates, movieData));
    setComparisonHistory([]);

    // Clear persisted state
    await clearAllData();

    // Save fresh state
    await saveAllState({
      version: 1,
      userSession: newSession,
      moviesState: initialMovieStates,
      comparisonHistory: [],
    });

    // Reset refs for next login
    hasLoadedServerDataRef.current = false;

    log.info(' Reset complete');
  };

  // ============================================
  // User Preferences
  // ============================================

  const updateGenreScore = useCallback((genre: Genre, delta: number) => {
    setUserSession(prev => {
      const updated = {
        ...prev,
        preferences: {
          ...prev.preferences,
          genreScores: {
            ...prev.preferences.genreScores,
            [genre]: prev.preferences.genreScores[genre] + delta,
          },
        },
        lastActiveAt: Date.now(),
      };

      // Save async (don't await)
      saveUserSession(updated);

      return updated;
    });
  }, []);

  const setGenrePreferences = useCallback((genres: Genre[]) => {
    setUserSession(prev => {
      const newGenreScores = { ...prev.preferences.genreScores };
      genres.forEach(genre => {
        newGenreScores[genre] = (newGenreScores[genre] || 0) + 2; // Boost selected genres
      });
      const updated = {
        ...prev,
        preferences: {
          ...prev.preferences,
          favoriteGenres: genres,
          genreScores: newGenreScores,
        },
        lastActiveAt: Date.now(),
      };

      saveUserSession(updated);
      return updated;
    });
  }, []);

  const setBirthDecade = useCallback((decade: number) => {
    setUserSession(prev => {
      const updated = {
        ...prev,
        preferences: {
          ...prev.preferences,
          birthDecade: decade,
          moviePrimeStart: decade + 12,
          moviePrimeEnd: decade + 25,
        },
        lastActiveAt: Date.now(),
      };

      saveUserSession(updated);
      return updated;
    });
  }, []);

  const setVibePreferences = useCallback((vibes: { tone?: 'light' | 'heavy' | null; entertainment?: 'laughs' | 'thrills' | null; pacing?: 'slow' | 'fast' | null }) => {
    setUserSession(prev => {
      const currentVibes = prev.preferences.vibes || { tone: null, entertainment: null, pacing: null };
      const updated: UserSession = {
        ...prev,
        preferences: {
          ...prev.preferences,
          vibes: {
            tone: vibes.tone !== undefined ? vibes.tone : currentVibes.tone,
            entertainment: vibes.entertainment !== undefined ? vibes.entertainment : currentVibes.entertainment,
            pacing: vibes.pacing !== undefined ? vibes.pacing : currentVibes.pacing,
          },
        },
        lastActiveAt: Date.now(),
      };

      saveUserSession(updated);
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setUserSession(prev => {
      const updated = {
        ...prev,
        onboardingComplete: true,
        onboardingComparisonCount: prev.totalComparisons,
        lastActiveAt: Date.now(),
      };

      saveUserSession(updated);

      // Sync to server if logged in
      if (user?.id) {
        syncService.syncProfile(user.id, updated.preferences, updated.totalComparisons);
      }

      return updated;
    });
  }, [user?.id]);

  const setHasSeenSwipeUpTutorial = useCallback(() => {
    setUserSession(prev => {
      const updated = { ...prev, hasSeenSwipeUpTutorial: true };
      saveUserSession(updated);
      return updated;
    });
  }, []);

  const setHasSeenGoBackTooltip = useCallback(() => {
    setUserSession(prev => {
      const updated = { ...prev, hasSeenGoBackTooltip: true };
      saveUserSession(updated);
      return updated;
    });
  }, []);

  // ============================================
  // Comparisons
  // ============================================

  const recordComparison = useCallback((winnerId: string, loserId: string, skipped = false) => {
    // Get current movies
    const movieA = movies.get(winnerId);
    const movieB = movies.get(loserId);

    if (!movieA || !movieB) {
      log.warn(' Movie not found:', winnerId, loserId);
      return;
    }

    const comparisonNumber = userSession.totalComparisons + 1;

    // Store beta values before update
    const betaABefore = movieA.beta;
    const betaBBefore = movieB.beta;

    // Process status changes and get confidence level
    const { movieA: statusUpdatedA, movieB: statusUpdatedB, confidence } = processComparison(
      movieA,
      movieB,
      skipped ? null : winnerId
    );

    // Calculate new beta values
    let finalA = {
      ...statusUpdatedA,
      timesShown: statusUpdatedA.timesShown + 1,
      lastShownAt: comparisonNumber,
      totalComparisons: skipped ? statusUpdatedA.totalComparisons : statusUpdatedA.totalComparisons + 1,
      totalWins: !skipped ? statusUpdatedA.totalWins + 1 : statusUpdatedA.totalWins,
    };

    let finalB = {
      ...statusUpdatedB,
      timesShown: statusUpdatedB.timesShown + 1,
      lastShownAt: comparisonNumber,
      totalComparisons: skipped ? statusUpdatedB.totalComparisons : statusUpdatedB.totalComparisons + 1,
      totalLosses: !skipped ? statusUpdatedB.totalLosses + 1 : statusUpdatedB.totalLosses,
    };

    // Update beta based on confidence level and adaptive K
    const confidenceMultiplier = getConfidenceMultiplier(confidence);
    if (!skipped && confidenceMultiplier > 0) {
      // Each movie gets its own adaptive K based on its comparison count
      const kA = getAdaptiveK(movieA.totalComparisons) * confidenceMultiplier;
      const kB = getAdaptiveK(movieB.totalComparisons) * confidenceMultiplier;

      const expectedA = 1 / (1 + Math.exp(betaBBefore - betaABefore));
      finalA.beta = Math.max(-4, Math.min(4, betaABefore + kA * (1 - expectedA)));
      finalB.beta = Math.max(-4, Math.min(4, betaBBefore + kB * (0 - (1 - expectedA))));
    }

    // Create comparison record
    const record: ComparisonRecord = {
      comparisonId: uuidv4(),
      timestamp: Date.now(),
      movieAId: winnerId,
      movieBId: loserId,
      choice: skipped ? 'skip' : 'A',
      movieABetaBefore: betaABefore,
      movieABetaAfter: finalA.beta,
      movieBBetaBefore: betaBBefore,
      movieBBetaAfter: finalB.beta,
    };

    // Compute all new state BEFORE updating (avoids stale closure issues)
    const newMoviesState = Array.from(movies.values()).map(m => {
      if (m.id === winnerId) return extractMovieState(finalA);
      if (m.id === loserId) return extractMovieState(finalB);
      return extractMovieState(m);
    });

    const newUserSession = {
      ...userSession,
      totalComparisons: comparisonNumber,
      consecutiveSkips: skipped ? userSession.consecutiveSkips + 1 : 0,
      lastActiveAt: Date.now(),
    };

    const newComparisonHistory = [...comparisonHistory, record];

    // Update React state
    setMovies(prev => {
      const newMovies = new Map(prev);
      newMovies.set(winnerId, finalA);
      newMovies.set(loserId, finalB);
      return newMovies;
    });

    setComparisonHistory(newComparisonHistory);
    setUserSession(newUserSession);

    // Persist using the computed values (not stale closures)
    Promise.all([
      saveUserSession(newUserSession),
      saveMoviesState(newMoviesState),
      saveComparisonHistory(newComparisonHistory),
    ]).then(() => {
      const kADisplay = getAdaptiveK(movieA.totalComparisons).toFixed(2);
      const kBDisplay = getAdaptiveK(movieB.totalComparisons).toFixed(2);
      console.log(
        `[Comparison #${comparisonNumber}]`,
        skipped ? 'SKIPPED' : `${finalA.title} beat ${finalB.title}`,
        `| ${getStatusEmoji(finalA.status)} ${getStatusEmoji(finalB.status)}`,
        `| β: ${finalA.beta.toFixed(2)} vs ${finalB.beta.toFixed(2)}`,
        `| K: ${kADisplay}/${kBDisplay} × ${confidenceMultiplier.toFixed(1)}`
      );
    });

    // Sync to Supabase if logged in
    if (user?.id) {
      // Sync comparison
      syncService.syncComparison(
        user.id,
        winnerId,
        loserId,
        skipped ? 'skip' : 'A',
        betaABefore,
        finalA.beta,
        betaBBefore,
        finalB.beta,
        comparisonNumber
      );

      // Sync updated movies
      syncService.syncUserMovie(user.id, finalA);
      syncService.syncUserMovie(user.id, finalB);

      // Sync profile (total comparisons updated)
      syncService.syncProfile(
        user.id,
        userSession.preferences,
        comparisonNumber
      );

      // Update global rankings for the two movies involved
      // Fire and forget - don't block UI
      globalRankingsService.onComparisonRecorded(winnerId, loserId).catch(console.error);

      // Schedule debounced global stats recalculation
      scheduleGlobalStatsRecalc();

      // Log activity for rank changes (top 10 only)
      if (!skipped) {
        // Get current rankings to find new positions
        const allMovies = Array.from(movies.values());
        // Update the movies in memory for accurate ranking
        const updatedMovies = allMovies.map(m => {
          if (m.id === winnerId) return finalA;
          if (m.id === loserId) return finalB;
          return m;
        });
        const ranked = updatedMovies
          .filter(m => m.status === 'known' && m.totalComparisons >= 2)
          .sort((a, b) => b.beta - a.beta);

        const winnerRank = ranked.findIndex(m => m.id === winnerId) + 1;
        if (winnerRank > 0 && winnerRank <= 10) {
          activityService.logRankChange(
            user.id,
            winnerId,
            finalA.title,
            finalA.year,
            winnerRank
          ).catch(console.error);
        }
      }

      // Log milestone activity
      activityService.logMilestone(user.id, comparisonNumber).catch(console.error);
    }
  }, [movies, userSession, comparisonHistory, user?.id]);

  // ============================================
  // Undo Last Comparison
  // ============================================

  const undoLastComparison = useCallback((): ComparisonRecord | null => {
    if (comparisonHistory.length === 0) return null;

    const lastRecord = comparisonHistory[comparisonHistory.length - 1];
    const movieA = movies.get(lastRecord.movieAId);
    const movieB = movies.get(lastRecord.movieBId);

    if (!movieA || !movieB) {
      log.warn(' Cannot undo - movie not found');
      return null;
    }

    const wasSkipped = lastRecord.choice === 'skip';

    // Revert movie A
    const revertedA: Movie = {
      ...movieA,
      beta: lastRecord.movieABetaBefore,
      timesShown: Math.max(0, movieA.timesShown - 1),
      totalComparisons: wasSkipped ? movieA.totalComparisons : Math.max(0, movieA.totalComparisons - 1),
      totalWins: (!wasSkipped && lastRecord.choice === 'A') ? Math.max(0, movieA.totalWins - 1) : movieA.totalWins,
      totalLosses: (!wasSkipped && lastRecord.choice === 'B') ? Math.max(0, movieA.totalLosses - 1) : movieA.totalLosses,
    };

    // Revert movie B
    const revertedB: Movie = {
      ...movieB,
      beta: lastRecord.movieBBetaBefore,
      timesShown: Math.max(0, movieB.timesShown - 1),
      totalComparisons: wasSkipped ? movieB.totalComparisons : Math.max(0, movieB.totalComparisons - 1),
      totalWins: (!wasSkipped && lastRecord.choice === 'B') ? Math.max(0, movieB.totalWins - 1) : movieB.totalWins,
      totalLosses: (!wasSkipped && lastRecord.choice === 'A') ? Math.max(0, movieB.totalLosses - 1) : movieB.totalLosses,
    };

    // Update movies
    setMovies(prev => {
      const newMovies = new Map(prev);
      newMovies.set(lastRecord.movieAId, revertedA);
      newMovies.set(lastRecord.movieBId, revertedB);
      return newMovies;
    });

    // Remove last record from history
    const newHistory = comparisonHistory.slice(0, -1);
    setComparisonHistory(newHistory);

    // Decrement session total
    setUserSession(prev => {
      const updated = {
        ...prev,
        totalComparisons: Math.max(0, prev.totalComparisons - 1),
        lastActiveAt: Date.now(),
      };
      return updated;
    });

    // Persist all three stores
    const newMoviesState = Array.from(movies.values()).map(extractMovieState);
    const stateA = newMoviesState.find(m => m.id === lastRecord.movieAId);
    const stateB = newMoviesState.find(m => m.id === lastRecord.movieBId);
    if (stateA) {
      stateA.beta = revertedA.beta;
      stateA.totalWins = revertedA.totalWins;
      stateA.totalLosses = revertedA.totalLosses;
      stateA.totalComparisons = revertedA.totalComparisons;
      stateA.timesShown = revertedA.timesShown;
    }
    if (stateB) {
      stateB.beta = revertedB.beta;
      stateB.totalWins = revertedB.totalWins;
      stateB.totalLosses = revertedB.totalLosses;
      stateB.totalComparisons = revertedB.totalComparisons;
      stateB.timesShown = revertedB.timesShown;
    }

    Promise.all([
      saveUserSession({
        ...userSession,
        totalComparisons: Math.max(0, userSession.totalComparisons - 1),
        lastActiveAt: Date.now(),
      }),
      saveMoviesState(newMoviesState),
      saveComparisonHistory(newHistory),
    ]).then(() => {
      console.log(
        `[Undo] Reverted comparison:`,
        `${revertedA.title} β: ${movieA.beta.toFixed(2)} → ${revertedA.beta.toFixed(2)}`,
        `| ${revertedB.title} β: ${movieB.beta.toFixed(2)} → ${revertedB.beta.toFixed(2)}`
      );
    });

    return lastRecord;
  }, [movies, userSession, comparisonHistory]);

  // ============================================
  // Data Access
  // ============================================

  const getMovie = useCallback((movieId: string): Movie | undefined => {
    return movies.get(movieId);
  }, [movies]);

  const getMoviesByStatus = useCallback((status: MovieStatus): Movie[] => {
    return Array.from(movies.values()).filter(m => m.status === status);
  }, [movies]);

  // Memoized ranked movies - only recalculates when movies change
  // Movies with 2+ comparisons — stable enough for display ranking
  const rankedMoviesCache = useMemo((): Movie[] => {
    return Array.from(movies.values())
      .filter(m => m.status === 'known' && m.totalComparisons >= 2)
      .sort((a, b) => b.beta - a.beta);
  }, [movies]);

  // All movies with any comparisons — for algorithm use (pair selection, opponent selection, tournament)
  const allComparedMoviesCache = useMemo((): Movie[] => {
    return Array.from(movies.values())
      .filter(m => m.status === 'known' && m.totalComparisons > 0)
      .sort((a, b) => b.beta - a.beta);
  }, [movies]);

  const getRankedMovies = useCallback((): Movie[] => {
    return rankedMoviesCache;
  }, [rankedMoviesCache]);

  const getAllComparedMovies = useCallback((): Movie[] => {
    return allComparedMoviesCache;
  }, [allComparedMoviesCache]);

  // Memoized top genres - only recalculates when genreScores change
  const topGenresCache = useMemo((): Genre[] => {
    const scores = userSession.preferences.genreScores;
    const entries = Object.entries(scores) as [Genre, number][];
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre);
  }, [userSession.preferences.genreScores]);

  const getTopGenres = useCallback((count = 3): Genre[] => {
    return topGenresCache.slice(0, count);
  }, [topGenresCache]);

  // Memoized stats - only recalculates when movies change
  const statsCache = useMemo(() => {
    const all = Array.from(movies.values());
    return {
      total: all.length,
      known: all.filter(m => m.status === 'known').length,
      uncertain: all.filter(m => m.status === 'uncertain').length,
      unknown: all.filter(m => m.status === 'unknown').length,
      uncompared: all.filter(m => m.status === 'uncompared').length,
    };
  }, [movies]);

  const getStats = useCallback(() => {
    return statsCache;
  }, [statsCache]);

  // ============================================
  // Sync Actions
  // ============================================

  const syncToServer = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      log.info(' Cannot sync - not logged in');
      return false;
    }

    setIsSyncing(true);

    try {
      const interactedMovies = Array.from(movies.values()).filter(
        m => m.status !== 'uncompared' || m.totalComparisons > 0
      );

      await syncService.syncProfile(
        user.id,
        userSession.preferences,
        userSession.totalComparisons
      );

      await syncService.syncAllUserMovies(user.id, interactedMovies);

      log.info(' Sync to server complete');
      setIsSyncing(false);
      return true;
    } catch (error) {
      log.error(' Sync failed:', error);
      setIsSyncing(false);
      return false;
    }
  }, [user?.id, movies, userSession]);

  const loadFromServer = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      log.info(' Cannot load - not logged in');
      return false;
    }

    await handleLoadFromServer(user.id);
    return true;
  }, [user?.id, movies]);

  // ============================================
  // Discovery Queue
  // ============================================

  const addDiscoveryMovie = useCallback((movieId: string) => {
    setDiscoveryMovieIds(prev => {
      // Don't add duplicates
      if (prev.includes(movieId)) return prev;
      return [...prev, movieId];
    });
  }, []);

  const popDiscoveryMovie = useCallback((): string | undefined => {
    let movieId: string | undefined;
    setDiscoveryMovieIds(prev => {
      if (prev.length === 0) return prev;
      movieId = prev[0];
      return prev.slice(1);
    });
    return movieId;
  }, []);

  // Mark a movie as known (used when marking as "watched" from watchlist/discovery)
  // This ensures the movie gets prioritized in comparisons
  // If movie doesn't exist, provide movieDetails to add it to the store
  const markMovieAsKnown = useCallback((movieId: string, movieDetails?: {
    title: string;
    year: number;
    posterUrl?: string;
    genres?: Genre[];
    posterColor?: string;
    overview?: string;
    voteAverage?: number;
    voteCount?: number;
    directorName?: string;
    directorId?: string;
    collectionId?: number;
    collectionName?: string;
    certification?: string;
    tmdbId?: number;
    posterPath?: string;
    originalLanguage?: string;
  }) => {
    let movie = movies.get(movieId);

    // If movie doesn't exist in store, create it from provided details
    if (!movie) {
      if (!movieDetails) {
        log.warn(' Movie not found for markAsKnown and no details provided:', movieId);
        return;
      }

      // Create new movie entry with all available data
      movie = {
        id: movieId,
        tmdbId: movieDetails.tmdbId,
        title: movieDetails.title,
        year: movieDetails.year,
        genres: movieDetails.genres || [],
        posterUrl: movieDetails.posterUrl || '',
        posterPath: movieDetails.posterPath || undefined,
        posterColor: movieDetails.posterColor || '#1A1A2E',
        overview: movieDetails.overview || '',
        voteAverage: movieDetails.voteAverage,
        voteCount: movieDetails.voteCount,
        directorName: movieDetails.directorName,
        directorId: movieDetails.directorId,
        collectionId: movieDetails.collectionId,
        collectionName: movieDetails.collectionName,
        certification: movieDetails.certification,
        originalLanguage: movieDetails.originalLanguage,
        beta: INITIAL_BETA,
        totalWins: 0,
        totalLosses: 0,
        totalComparisons: 0,
        timesShown: 0,
        lastShownAt: 0,
        status: 'known' as MovieStatus,
        tier: 1, // Searched movies go in tier 1 locally for immediate comparisons
      };

      console.log(`[Store] Adding new movie from search/discovery: ${movieDetails.title}`);
    }

    // Update the movie status to 'known' and reset lastShownAt to prioritize it
    const updatedMovie = {
      ...movie,
      status: 'known' as MovieStatus,
      lastShownAt: 0, // Reset to ensure it appears in comparisons soon
    };

    setMovies(prev => {
      const newMovies = new Map(prev);
      newMovies.set(movieId, updatedMovie);
      return newMovies;
    });

    // Save state - need to include the new movie if it was just created
    const allMovies = new Map(movies);
    allMovies.set(movieId, updatedMovie);
    const newMoviesState = Array.from(allMovies.values()).map(extractMovieState);
    saveMoviesState(newMoviesState);

    // Sync to server if logged in
    if (user?.id) {
      syncService.syncUserMovie(user.id, updatedMovie);
    }

    console.log(`[Store] Marked ${updatedMovie.title} as known`);
  }, [movies, user?.id]);

  // Mark a movie as unknown (used when dismissing from discover)
  // This ensures the movie is excluded from comparisons
  const markMovieAsUnknown = useCallback((movieId: string) => {
    const movie = movies.get(movieId);
    if (!movie) {
      log.warn(' Movie not found for markAsUnknown:', movieId);
      return;
    }

    // Update the movie status to 'unknown'
    const updatedMovie = {
      ...movie,
      status: 'unknown' as MovieStatus,
    };

    setMovies(prev => {
      const newMovies = new Map(prev);
      newMovies.set(movieId, updatedMovie);
      return newMovies;
    });

    // Save state
    const newMoviesState = Array.from(movies.values()).map(extractMovieState);
    const movieState = newMoviesState.find(m => m.id === movieId);
    if (movieState) {
      movieState.status = 'unknown';
    }
    saveMoviesState(newMoviesState);

    // Sync to server if logged in
    if (user?.id) {
      syncService.syncUserMovie(user.id, updatedMovie);
    }

    console.log(`[Store] Marked ${movie.title} as unknown`);
  }, [movies, user?.id]);

  // ============================================
  // Pool Maintenance
  // ============================================

  const MINIMUM_ACTIVE_POOL = 30; // Minimum uncompared movies to maintain

  const STRONG_AFFINITY_THRESHOLD = 0.3;

  const checkAndMaintainPool = useCallback((): void => {
    // Get comparison-based tier
    let comparisonTier: 1 | 2 | 3 | 4 = 1;
    if (userSession.totalComparisons >= 750) comparisonTier = 4;
    else if (userSession.totalComparisons >= 400) comparisonTier = 3;
    else if (userSession.totalComparisons >= 200) comparisonTier = 2;

    const currentPoolTier = userSession.poolUnlockedTier || 1;
    const effectiveTier = Math.max(comparisonTier, currentPoolTier) as 1 | 2 | 3 | 4;

    // Count uncompared movies in current effective tier
    const activePoolCount = Array.from(movies.values()).filter(m =>
      m.status === 'uncompared' &&
      (m.tier || 1) <= effectiveTier
    ).length;

    // If pool is at or above threshold, nothing to do
    if (activePoolCount >= MINIMUM_ACTIVE_POOL) {
      return;
    }

    console.log(`[Pool] Uncompared pool low: ${activePoolCount}/${MINIMUM_ACTIVE_POOL} (tier ${effectiveTier}). Promoting...`);

    // Compute genre affinity for genre-aware promotion
    const rankedMovies = Array.from(movies.values())
      .filter(m => m.status === 'known' && m.totalComparisons > 0)
      .sort((a, b) => b.beta - a.beta);
    const postOnboardingComparisons = userSession.totalComparisons - (userSession.onboardingComparisonCount || 0);
    const affinity = computeGenreAffinity(
      userSession.preferences.vibes,
      rankedMovies,
      postOnboardingComparisons
    );

    // --- Slot allocation ---
    const needed = MINIMUM_ACTIVE_POOL - activePoolCount;
    const affinityRatio = postOnboardingComparisons < 50 ? 0.4 : 0.7;
    const affinitySlots = Math.round(needed * affinityRatio);
    const systematicSlots = needed - affinitySlots;

    // --- Find currentSystematicTier and fastTrackCeiling ---
    let currentSystematicTier = 5; // sentinel: no tier found
    for (let t = effectiveTier + 1; t <= 4; t++) {
      const hasUncompared = Array.from(movies.values()).some(m =>
        m.status === 'uncompared' && (m.tier || 1) === t
      );
      if (hasUncompared) {
        currentSystematicTier = t;
        break;
      }
    }
    const fastTrackCeiling = Math.min(currentSystematicTier + 1, 4);

    const promoted: Map<string, Movie> = new Map();

    // --- Track 1: Affinity fast-track ---
    if (affinity && affinitySlots > 0) {
      const affinityCandidates: { movie: Movie; score: number }[] = [];

      for (let tier = effectiveTier + 1; tier <= fastTrackCeiling; tier++) {
        const tierDistance = tier - effectiveTier;
        const tierDiscount = 1.0 - 0.15 * (tierDistance - 1); // 1.0, 0.85, 0.7

        const tierMovies = Array.from(movies.values()).filter(m =>
          m.status === 'uncompared' && (m.tier || 1) === tier
        );

        for (const movie of tierMovies) {
          if (movie.genres.length === 0) continue;
          const maxGenreAffinity = Math.max(...movie.genres.map(g => affinity[g] || 0));
          if (maxGenreAffinity >= STRONG_AFFINITY_THRESHOLD) {
            affinityCandidates.push({ movie, score: maxGenreAffinity * tierDiscount });
          }
        }
      }

      // Sort by score descending, take top affinitySlots
      affinityCandidates.sort((a, b) => b.score - a.score);
      for (const { movie } of affinityCandidates) {
        if (promoted.size >= affinitySlots) break;
        promoted.set(movie.id, movie);
      }
    }

    // --- Track 2: Systematic backfill (tier-by-tier, skip affinity-claimed) ---
    let systematicFilled = 0;
    for (let tier = effectiveTier + 1; tier <= 4 && systematicFilled < systematicSlots; tier++) {
      const tierCandidates = Array.from(movies.values()).filter(m =>
        m.status === 'uncompared' &&
        (m.tier || 1) === tier &&
        !promoted.has(m.id)
      );

      if (tierCandidates.length === 0) continue;

      // Sort by genre affinity within tier (existing behavior)
      if (affinity) {
        tierCandidates.sort((a, b) => {
          const aScore = a.genres.length > 0 ? Math.max(...a.genres.map(g => affinity[g] || 0)) : 0;
          const bScore = b.genres.length > 0 ? Math.max(...b.genres.map(g => affinity[g] || 0)) : 0;
          return bScore - aScore;
        });
      }

      for (const candidate of tierCandidates) {
        if (systematicFilled >= systematicSlots) break;
        promoted.set(candidate.id, candidate);
        systematicFilled++;
      }
    }

    // --- Overflow: if either track couldn't fill, take whatever's left tier-by-tier ---
    if (promoted.size < needed) {
      for (let tier = effectiveTier + 1; tier <= 4 && promoted.size < needed; tier++) {
        const overflowCandidates = Array.from(movies.values()).filter(m =>
          m.status === 'uncompared' &&
          (m.tier || 1) === tier &&
          !promoted.has(m.id)
        );

        if (overflowCandidates.length === 0) continue;

        if (affinity) {
          overflowCandidates.sort((a, b) => {
            const aScore = a.genres.length > 0 ? Math.max(...a.genres.map(g => affinity[g] || 0)) : 0;
            const bScore = b.genres.length > 0 ? Math.max(...b.genres.map(g => affinity[g] || 0)) : 0;
            return bScore - aScore;
          });
        }

        for (const candidate of overflowCandidates) {
          if (promoted.size >= needed) break;
          promoted.set(candidate.id, candidate);
        }
      }
    }

    if (promoted.size > 0) {
      const promotedTitles = Array.from(promoted.values()).map(m => `${m.title} (T${m.tier}→T${effectiveTier})`);
      console.log(`[Pool] Promoted ${promoted.size} movies: ${promotedTitles.join(', ')}`);

      setMovies(prev => {
        const next = new Map(prev);
        for (const [id, movie] of promoted) {
          next.set(id, { ...movie, sourceTier: movie.sourceTier || movie.tier, tier: effectiveTier });
        }

        // Persist tier changes so they survive app restart
        const allStates = Array.from(next.values()).map(extractMovieState);
        saveMoviesState(allStates);

        return next;
      });
    } else {
      console.log(`[Pool] No candidates found for promotion above tier ${effectiveTier}`);
    }
  }, [movies, userSession]);

  // ============================================
  // Recommendation Tracking
  // ============================================

  const getRevealedMovieIds = useCallback((): string[] => {
    return userSession.recommendations?.revealedMovieIds || [];
  }, [userSession.recommendations?.revealedMovieIds]);

  const markMovieAsRevealed = useCallback((movieId: string) => {
    const currentRevealed = userSession.recommendations?.revealedMovieIds || [];

    // Don't add duplicates
    if (currentRevealed.includes(movieId)) {
      return;
    }

    const updatedSession: UserSession = {
      ...userSession,
      recommendations: {
        ...userSession.recommendations,
        unrevealedCount: userSession.recommendations?.unrevealedCount ?? 0,
        earnedToday: userSession.recommendations?.earnedToday ?? 0,
        comparisonsToday: userSession.recommendations?.comparisonsToday ?? 0,
        lastResetDate: userSession.recommendations?.lastResetDate ?? new Date().toISOString().split('T')[0],
        revealedMovieIds: [...currentRevealed, movieId],
      },
    };

    setUserSession(updatedSession);
    saveUserSession(updatedSession);

    console.log(`[Store] Marked movie ${movieId} as revealed`);
  }, [userSession]);

  // ============================================
  // Debug/Admin
  // ============================================

  const resetAllData = useCallback(async () => {
    // Clear server data if logged in
    if (user?.id) {
      await syncService.clearServerData(user.id);
    }

    // Clear local data
    await clearAllData();
    await clearMovieCache(); // Force fresh TMDb fetch with director info

    // Reset the server data loaded flag so we don't reload from server
    hasLoadedServerDataRef.current = true;

    await initializeApp();
  }, [initializeApp, user?.id]);

  const exportData = useCallback(async (): Promise<string> => {
    const state: PersistedState = {
      version: 1,
      userSession,
      moviesState: Array.from(movies.values()).map(extractMovieState),
      comparisonHistory,
    };
    return JSON.stringify(state, null, 2);
  }, [userSession, movies, comparisonHistory]);

  // ============================================
  // Context Value
  // ============================================

  const value: AppState & AppActions = {
    isLoading,
    isSyncing,
    userSession,
    movies,
    comparisonHistory,
    discoveryMovieIds,

    initializeApp,
    updateGenreScore,
    setGenrePreferences,
    setBirthDecade,
    setVibePreferences,
    completeOnboarding,
    setHasSeenSwipeUpTutorial,
    setHasSeenGoBackTooltip,
    recordComparison,
    undoLastComparison,

    getMovie,
    getMoviesByStatus,
    getRankedMovies,
    getAllComparedMovies,
    getTopGenres,
    getStats,

    totalComparisons: userSession.totalComparisons,
    hasCompletedOnboarding: userSession.onboardingComplete,
    postOnboardingComparisons: userSession.totalComparisons - (userSession.onboardingComparisonCount ?? 0),

    syncToServer,
    loadFromServer,

    addDiscoveryMovie,
    popDiscoveryMovie,

    markMovieAsKnown,
    markMovieAsUnknown,
    checkAndMaintainPool,

    getRevealedMovieIds,
    markMovieAsRevealed,

    comparisonExcludeIds,
    setComparisonExcludeIds,

    resetAllData,
    exportData,
  };

  return React.createElement(AppContext.Provider, { value }, children);
}

// ============================================
// Hook
// ============================================

export function useAppStore(): AppState & AppActions {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppStore must be used within AppProvider');
  }
  return context;
}
