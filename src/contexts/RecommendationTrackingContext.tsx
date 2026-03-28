import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDismissedMovieIds } from '../services/database';
import { useAuth } from './AuthContext';

// ============================================
// TYPES
// ============================================

// Minimal recommendation data for storage
interface RevealedRecommendation {
  movieId: string;
  title: string;
  year: number;
  posterUrl: string | null;
  reason?: string;
}

interface RecommendationTrackingState {
  unrevealedCount: number;      // Mystery cards available
  earnedToday: number;          // Earned today (max 5)
  comparisonsToday: number;     // Comparisons made today
  lastResetDate: string;        // YYYY-MM-DD
  revealedMovieIds: string[];   // Already revealed movie IDs
  revealedRecommendations: RevealedRecommendation[];  // Full data for display
  dismissedMovieIds: string[];  // Movies dismissed from For You tab
}

interface RecommendationTrackingContextType {
  // State
  unrevealedCount: number;
  earnedToday: number;
  comparisonsToday: number;
  maxPerDay: number;
  comparisonsPerRecommendation: number;
  revealedCount: number;
  revealedRecommendations: RevealedRecommendation[];
  dismissedMovieIds: string[];

  // Computed
  comparisonsUntilNextRec: number;
  canEarnMore: boolean;

  // Actions
  onComparison: () => { unlocked: boolean };
  onReveal: (movieId: string, recommendation?: RevealedRecommendation) => void;
  isMovieRevealed: (movieId: string) => boolean;
  getRevealedMovieIds: () => string[];
  dismissRecommendation: (movieId: string) => void;
  isMovieDismissed: (movieId: string) => boolean;
  grantFirstRecommendation: () => void;
  resetTracking: () => Promise<void>;
}

// ============================================
// CONSTANTS
// ============================================

const STORAGE_KEY = '@aaybee/recommendation_tracking';
const MAX_RECOMMENDATIONS_PER_DAY = 5;
const COMPARISONS_PER_RECOMMENDATION = 5;

// ============================================
// CONTEXT
// ============================================

const RecommendationTrackingContext = createContext<RecommendationTrackingContextType | null>(null);

export function useRecommendationTracking() {
  const context = useContext(RecommendationTrackingContext);
  if (!context) {
    throw new Error('useRecommendationTracking must be used within RecommendationTrackingProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function createInitialState(): RecommendationTrackingState {
  return {
    unrevealedCount: 0,
    earnedToday: 0,
    comparisonsToday: 0,
    lastResetDate: getTodayDate(),
    revealedMovieIds: [],
    revealedRecommendations: [],
    dismissedMovieIds: [],
  };
}

export function RecommendationTrackingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<RecommendationTrackingState>(createInitialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const serverDismissalsLoaded = useRef(false);

  // Load server-side dismissals and merge with local state
  useEffect(() => {
    if (!user?.id || !isLoaded || serverDismissalsLoaded.current) return;
    serverDismissalsLoaded.current = true;

    getDismissedMovieIds(user.id).then(serverIds => {
      if (serverIds.length === 0) return;

      setState(prev => {
        const merged = new Set([...prev.dismissedMovieIds, ...serverIds]);
        if (merged.size === prev.dismissedMovieIds.length) return prev; // No new IDs
        return { ...prev, dismissedMovieIds: Array.from(merged) };
      });
    }).catch(err => {
      console.error('[RecTracking] Failed to load server dismissals:', err);
    });
  }, [user?.id, isLoaded]);

  // Load state from storage on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as RecommendationTrackingState;

          // Ensure fields exist (for backwards compatibility)
          const withDefaults = {
            ...parsed,
            revealedRecommendations: parsed.revealedRecommendations || [],
            dismissedMovieIds: parsed.dismissedMovieIds || [],
          };

          // Check if we need to reset daily counters
          const today = getTodayDate();
          if (parsed.lastResetDate !== today) {
            // New day - reset daily counters but keep unrevealed count and revealed recs
            setState({
              ...withDefaults,
              earnedToday: 0,
              comparisonsToday: 0,
              lastResetDate: today,
            });
          } else {
            setState(withDefaults);
          }

          console.log('[RecTracking] Loaded state:', {
            unrevealedCount: withDefaults.unrevealedCount,
            earnedToday: withDefaults.earnedToday,
            revealedRecommendations: withDefaults.revealedRecommendations?.length || 0,
          });
        }
      } catch (error) {
        console.error('[RecTracking] Failed to load state:', error);
      }
      setIsLoaded(true);
    };
    loadState();
  }, []);

  // Save state to storage whenever it changes
  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(error => {
        console.error('[RecTracking] Failed to save state:', error);
      });
    }
  }, [state, isLoaded]);

  // Check for daily reset on every state access
  const checkDailyReset = useCallback(() => {
    const today = getTodayDate();
    if (state.lastResetDate !== today) {
      setState(prev => ({
        ...prev,
        earnedToday: 0,
        comparisonsToday: 0,
        lastResetDate: today,
      }));
    }
  }, [state.lastResetDate]);

  // Called after each comparison
  const onComparison = useCallback((): { unlocked: boolean } => {
    checkDailyReset();

    let unlocked = false;

    setState(prev => {
      const newComparisonsToday = prev.comparisonsToday + 1;
      const recsEarnedFromComparisons = Math.floor(newComparisonsToday / COMPARISONS_PER_RECOMMENDATION);

      // Check if we crossed a threshold and haven't hit daily max
      if (recsEarnedFromComparisons > prev.earnedToday && prev.earnedToday < MAX_RECOMMENDATIONS_PER_DAY) {
        unlocked = true;
        return {
          ...prev,
          comparisonsToday: newComparisonsToday,
          earnedToday: Math.min(recsEarnedFromComparisons, MAX_RECOMMENDATIONS_PER_DAY),
          unrevealedCount: prev.unrevealedCount + 1,
        };
      }

      return {
        ...prev,
        comparisonsToday: newComparisonsToday,
      };
    });

    return { unlocked };
  }, [checkDailyReset]);

  // Called when user reveals a recommendation
  const onReveal = useCallback((movieId: string, recommendation?: RevealedRecommendation) => {
    console.log('[RecTracking] onReveal called:', movieId, recommendation?.title);
    setState(prev => {
      // Don't add duplicate
      if (prev.revealedMovieIds.includes(movieId)) {
        console.log('[RecTracking] Movie already revealed, skipping');
        return prev;
      }

      const newRevealedRecs = recommendation
        ? [...prev.revealedRecommendations, recommendation]
        : prev.revealedRecommendations;

      return {
        ...prev,
        unrevealedCount: Math.max(0, prev.unrevealedCount - 1),
        revealedMovieIds: [...prev.revealedMovieIds, movieId],
        revealedRecommendations: newRevealedRecs,
      };
    });
  }, []);

  // Check if a movie has been revealed
  const isMovieRevealed = useCallback((movieId: string): boolean => {
    return state.revealedMovieIds.includes(movieId);
  }, [state.revealedMovieIds]);

  // Get all revealed movie IDs (for service exclusion)
  const getRevealedMovieIds = useCallback((): string[] => {
    return state.revealedMovieIds;
  }, [state.revealedMovieIds]);

  // Dismiss a recommendation (swipe away, seen it, added to watchlist)
  const dismissRecommendation = useCallback((movieId: string) => {
    setState(prev => {
      if (prev.dismissedMovieIds.includes(movieId)) {
        return prev;
      }
      return {
        ...prev,
        dismissedMovieIds: [...prev.dismissedMovieIds, movieId],
      };
    });
  }, []);

  // Check if a movie has been dismissed
  const isMovieDismissed = useCallback((movieId: string): boolean => {
    return state.dismissedMovieIds.includes(movieId);
  }, [state.dismissedMovieIds]);

  // Grant first recommendation - for initial unlock at 40 comparisons
  // This is called when user has enough data but no mystery cards showing
  const grantFirstRecommendation = useCallback(() => {
    console.log('[RecTracking] grantFirstRecommendation called');
    setState(prev => {
      console.log('[RecTracking] Current state:', {
        unrevealedCount: prev.unrevealedCount,
        earnedToday: prev.earnedToday,
        comparisonsToday: prev.comparisonsToday,
        revealedMovieIds: prev.revealedMovieIds.length,
      });

      // Skip if already have unrevealed cards waiting
      if (prev.unrevealedCount > 0) {
        console.log('[RecTracking] Already have unrevealed cards, skipping');
        return prev;
      }

      // If earnedToday is 0, this is the initial grant - set clean values
      if (prev.earnedToday === 0) {
        console.log('[RecTracking] Initial grant - setting clean values');
        return {
          ...prev,
          earnedToday: 1,
          unrevealedCount: 1,
          comparisonsToday: COMPARISONS_PER_RECOMMENDATION,
        };
      }

      // If earnedToday > 0 but unrevealedCount is 0, user revealed all their recs
      // They need to earn more through comparisons, not get a free one
      // UNLESS this is stale state (they reset but tracking wasn't cleared)
      // Check: if earnedToday > 0 but revealedMovieIds is empty, it's stale
      if (prev.revealedMovieIds.length === 0) {
        console.log('[RecTracking] Stale state detected - resetting and granting');
        return {
          unrevealedCount: 1,
          earnedToday: 1,
          comparisonsToday: COMPARISONS_PER_RECOMMENDATION,
          lastResetDate: getTodayDate(),
          revealedMovieIds: [],
          revealedRecommendations: [],
          dismissedMovieIds: [],
        };
      }

      // Normal case: user earned and revealed, no free grant
      console.log('[RecTracking] User has earned today, no free grant');
      return prev;
    });
  }, []);

  // Reset tracking state - called when user resets their profile
  const resetTracking = useCallback(async () => {
    const freshState = createInitialState();
    setState(freshState);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshState));
    console.log('[RecTracking] Tracking state reset');
  }, []);

  // Computed values
  const comparisonsUntilNextRec = state.earnedToday >= MAX_RECOMMENDATIONS_PER_DAY
    ? 0
    : COMPARISONS_PER_RECOMMENDATION - (state.comparisonsToday % COMPARISONS_PER_RECOMMENDATION);

  const canEarnMore = state.earnedToday < MAX_RECOMMENDATIONS_PER_DAY;

  const value: RecommendationTrackingContextType = {
    unrevealedCount: state.unrevealedCount,
    earnedToday: state.earnedToday,
    comparisonsToday: state.comparisonsToday,
    maxPerDay: MAX_RECOMMENDATIONS_PER_DAY,
    comparisonsPerRecommendation: COMPARISONS_PER_RECOMMENDATION,
    revealedCount: state.revealedMovieIds.length,
    revealedRecommendations: state.revealedRecommendations || [],
    dismissedMovieIds: state.dismissedMovieIds || [],
    comparisonsUntilNextRec,
    canEarnMore,
    onComparison,
    onReveal,
    isMovieRevealed,
    getRevealedMovieIds,
    dismissRecommendation,
    isMovieDismissed,
    grantFirstRecommendation,
    resetTracking,
  };

  return (
    <RecommendationTrackingContext.Provider value={value}>
      {children}
    </RecommendationTrackingContext.Provider>
  );
}
