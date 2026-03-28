import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { Movie, Genre, MovieStatus } from '../types';

// ============================================
// Storage Keys
// ============================================

const STORAGE_KEYS = {
  USER_SESSION: '@aaybee/user_session',
  MOVIES_STATE: '@aaybee/movies_state',
  COMPARISON_HISTORY: '@aaybee/comparison_history',
  DATA_VERSION: '@aaybee/data_version',
  // Recommendation tracking is managed by RecommendationTrackingContext
  // but we need to clear it on profile reset
  RECOMMENDATION_TRACKING: '@aaybee/recommendation_tracking',
};

// Current data schema version (increment when making breaking changes)
const CURRENT_DATA_VERSION = 3;

// ============================================
// Type Definitions
// ============================================

export interface UserSession {
  userId: string;
  totalComparisons: number;
  consecutiveSkips: number;
  consecutiveRegularPairs: number; // Track for discovery pair injection
  createdAt: number;
  lastActiveAt: number;
  preferences: {
    favoriteGenres: Genre[];
    genreScores: Record<Genre, number>;
    birthDecade: number | null;
    moviePrimeStart: number | null;
    moviePrimeEnd: number | null;
    vibes?: {
      tone: 'light' | 'heavy' | null;  // Light = feel-good, Heavy = dark themes
      entertainment: 'laughs' | 'thrills' | null;  // Laughs = comedy, Thrills = action/suspense
      pacing: 'slow' | 'fast' | null;  // Slow = deliberate, Fast = action-packed
    };
  };
  onboardingComplete: boolean;
  onboardingComparisonCount?: number;
  hasSeenSwipeUpTutorial?: boolean;
  hasSeenGoBackTooltip?: boolean;
  // Pool-based tier unlock (separate from comparison-based)
  // When active pool drops below threshold, this tier is increased
  poolUnlockedTier?: 1 | 2 | 3 | 4;
  // Daily recommendation tracking
  recommendations?: {
    unrevealedCount: number;        // Mystery cards available to reveal
    earnedToday: number;            // Recommendations earned today (max 5)
    comparisonsToday: number;       // Comparisons made today
    lastResetDate: string;          // YYYY-MM-DD for daily reset detection
    revealedMovieIds: string[];     // Movies already revealed (exclude from future recs)
  };
}

export interface ComparisonRecord {
  comparisonId: string;
  timestamp: number;
  movieAId: string;
  movieBId: string;
  choice: 'A' | 'B' | 'skip';
  movieABetaBefore: number;
  movieABetaAfter: number;
  movieBBetaBefore: number;
  movieBBetaAfter: number;
  pairType?: 'regular' | 'discovery'; // Track pair type for analytics
  discoveryMovieId?: string; // Which movie was the discovery (if discovery pair)
}

export interface MovieState {
  id: string;
  beta: number;
  totalWins: number;
  totalLosses: number;
  totalComparisons: number;
  timesShown: number;
  lastShownAt: number;
  status: MovieStatus;
  tier?: 1 | 2 | 3 | 4 | 5;
  sourceTier?: 1 | 2 | 3 | 4 | 5;
}

export interface PersistedState {
  version: number;
  userSession: UserSession;
  moviesState: MovieState[];
  comparisonHistory: ComparisonRecord[];
}

// ============================================
// Initialization
// ============================================

export function createInitialUserSession(): UserSession {
  return {
    userId: uuidv4(),
    totalComparisons: 0,
    consecutiveSkips: 0,
    consecutiveRegularPairs: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    preferences: {
      favoriteGenres: [],
      genreScores: {
        action: 0,
        comedy: 0,
        drama: 0,
        scifi: 0,
        romance: 0,
        thriller: 0,
        animation: 0,
        horror: 0,
        adventure: 0,
        fantasy: 0,
      },
      birthDecade: null,
      moviePrimeStart: null,
      moviePrimeEnd: null,
      vibes: {
        tone: null,
        entertainment: null,
        pacing: null,
      },
    },
    onboardingComplete: false,
    recommendations: {
      unrevealedCount: 0,
      earnedToday: 0,
      comparisonsToday: 0,
      lastResetDate: new Date().toISOString().split('T')[0],
      revealedMovieIds: [],
    },
  };
}

export function createInitialMoviesState(movies: Movie[]): MovieState[] {
  return movies.map(movie => ({
    id: movie.id,
    beta: 0,
    totalWins: 0,
    totalLosses: 0,
    totalComparisons: 0,
    timesShown: 0,
    lastShownAt: 0,
    status: 'uncompared' as MovieStatus,
  }));
}

// ============================================
// Save Functions
// ============================================

export async function saveUserSession(session: UserSession): Promise<void> {
  try {
    const data = JSON.stringify(session);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_SESSION, data);
    console.log('[Persistence] User session saved');
  } catch (error) {
    console.error('[Persistence] Failed to save user session:', error);
  }
}

export async function saveMoviesState(movies: MovieState[]): Promise<void> {
  try {
    const data = JSON.stringify(movies);
    await AsyncStorage.setItem(STORAGE_KEYS.MOVIES_STATE, data);
    console.log('[Persistence] Movies state saved');
  } catch (error) {
    console.error('[Persistence] Failed to save movies state:', error);
  }
}

export async function saveComparisonHistory(history: ComparisonRecord[]): Promise<void> {
  try {
    // Cap to most recent 200 records — full history is synced to server
    const trimmed = history.slice(-200);
    const data = JSON.stringify(trimmed);
    await AsyncStorage.setItem(STORAGE_KEYS.COMPARISON_HISTORY, data);
    console.log('[Persistence] Comparison history saved');
  } catch (error) {
    console.error('[Persistence] Failed to save comparison history:', error);
  }
}

export async function saveAllState(state: PersistedState): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.DATA_VERSION, String(state.version)),
      saveUserSession(state.userSession),
      saveMoviesState(state.moviesState),
      saveComparisonHistory(state.comparisonHistory),
    ]);
    console.log('[Persistence] All state saved successfully');
  } catch (error) {
    console.error('[Persistence] Failed to save all state:', error);
  }
}

// ============================================
// Load Functions
// ============================================

export async function loadUserSession(): Promise<UserSession | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_SESSION);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[Persistence] Failed to load user session:', error);
    return null;
  }
}

export async function loadMoviesState(): Promise<MovieState[] | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MOVIES_STATE);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[Persistence] Failed to load movies state:', error);
    return null;
  }
}

export async function loadComparisonHistory(): Promise<ComparisonRecord[] | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.COMPARISON_HISTORY);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[Persistence] Failed to load comparison history:', error);
    return null;
  }
}

export async function loadDataVersion(): Promise<number> {
  try {
    const version = await AsyncStorage.getItem(STORAGE_KEYS.DATA_VERSION);
    return version ? parseInt(version, 10) : 0;
  } catch (error) {
    console.error('[Persistence] Failed to load data version:', error);
    return 0;
  }
}

export async function loadAllState(): Promise<PersistedState | null> {
  try {
    const [version, userSession, moviesState, comparisonHistory] = await Promise.all([
      loadDataVersion(),
      loadUserSession(),
      loadMoviesState(),
      loadComparisonHistory(),
    ]);

    // If no data exists, return null
    if (!userSession) {
      return null;
    }

    // Check for data migration
    const migratedState = migrateData(
      {
        version,
        userSession,
        moviesState: moviesState || [],
        comparisonHistory: comparisonHistory || [],
      },
      version
    );

    console.log('[Persistence] State loaded successfully');
    return migratedState;
  } catch (error) {
    console.error('[Persistence] Failed to load all state:', error);
    return null;
  }
}

// ============================================
// Data Migration
// ============================================

function migrateData(state: PersistedState, fromVersion: number): PersistedState {
  let currentState = { ...state };

  // Migration from version 0 to 1
  if (fromVersion < 1) {
    console.log('[Migration] Migrating from version 0 to 1');

    // Ensure all required fields exist
    if (!currentState.userSession.preferences.genreScores) {
      currentState.userSession.preferences.genreScores = {
        action: 0, comedy: 0, drama: 0, scifi: 0, romance: 0,
        thriller: 0, animation: 0, horror: 0, adventure: 0, fantasy: 0,
      };
    }

    // Note: Missing movies are now handled in the store's initializeApp
    // since we load movies from TMDb API/cache
  }

  // Migration from version 1 to 2 (Discovery Pairs support)
  if (fromVersion < 2) {
    console.log('[Migration] Migrating from version 1 to 2 (Discovery Pairs)');

    // Add consecutiveRegularPairs field
    if (currentState.userSession.consecutiveRegularPairs === undefined) {
      currentState.userSession.consecutiveRegularPairs = 0;
    }

    // Comparison history records don't need migration - new fields are optional
  }

  currentState.version = CURRENT_DATA_VERSION;
  return currentState;
}

// ============================================
// Reset/Clear Functions
// ============================================

export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_SESSION,
      STORAGE_KEYS.MOVIES_STATE,
      STORAGE_KEYS.COMPARISON_HISTORY,
      STORAGE_KEYS.DATA_VERSION,
      STORAGE_KEYS.RECOMMENDATION_TRACKING,
    ]);
    console.log('[Persistence] All data cleared (including recommendation tracking)');
  } catch (error) {
    console.error('[Persistence] Failed to clear data:', error);
    throw error;
  }
}

export async function resetMoviesOnly(movies: Movie[]): Promise<void> {
  try {
    const initialMovies = createInitialMoviesState(movies);
    await saveMoviesState(initialMovies);
    console.log('[Persistence] Movies state reset');
  } catch (error) {
    console.error('[Persistence] Failed to reset movies:', error);
    throw error;
  }
}

// ============================================
// Utility Functions
// ============================================

export function mergeMovieStateWithData(
  movieState: MovieState,
  movieData: Movie
): Movie {
  return {
    ...movieData,
    beta: movieState.beta,
    totalWins: movieState.totalWins,
    totalLosses: movieState.totalLosses,
    totalComparisons: movieState.totalComparisons,
    timesShown: movieState.timesShown,
    lastShownAt: movieState.lastShownAt,
    status: movieState.status,
    // Preserve promoted tier (pool maintenance) — fall back to database tier
    ...(movieState.tier != null && { tier: movieState.tier }),
    ...(movieState.sourceTier != null && { sourceTier: movieState.sourceTier }),
  };
}

export function extractMovieState(movie: Movie): MovieState {
  return {
    id: movie.id,
    beta: movie.beta,
    totalWins: movie.totalWins,
    totalLosses: movie.totalLosses,
    totalComparisons: movie.totalComparisons,
    timesShown: movie.timesShown,
    lastShownAt: movie.lastShownAt,
    status: movie.status,
    // Only persist tier if it was promoted (sourceTier means promotion happened)
    tier: movie.sourceTier ? movie.tier : undefined,
    sourceTier: movie.sourceTier,
  };
}

// ============================================
// Debug Functions
// ============================================

export async function getStorageSize(): Promise<{
  total: number;
  breakdown: Record<string, number>;
}> {
  try {
    const keys = Object.values(STORAGE_KEYS);
    const breakdown: Record<string, number> = {};
    let total = 0;

    for (const key of keys) {
      const data = await AsyncStorage.getItem(key);
      const size = data ? new Blob([data]).size : 0;
      breakdown[key] = size;
      total += size;
    }

    return { total, breakdown };
  } catch (error) {
    console.error('[Persistence] Failed to get storage size:', error);
    return { total: 0, breakdown: {} };
  }
}

export async function exportAllData(): Promise<string> {
  const state = await loadAllState();
  return JSON.stringify(state, null, 2);
}

export async function importData(jsonString: string): Promise<boolean> {
  try {
    const state = JSON.parse(jsonString) as PersistedState;

    // Validate structure
    if (!state.userSession || !state.moviesState) {
      throw new Error('Invalid data structure');
    }

    await saveAllState(state);
    return true;
  } catch (error) {
    console.error('[Persistence] Failed to import data:', error);
    return false;
  }
}
