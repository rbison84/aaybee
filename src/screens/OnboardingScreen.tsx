import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, SafeAreaView, ScrollView, Image, TextInput, FlatList, ActivityIndicator, Keyboard } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';
import { useHaptics } from '../hooks/useHaptics';
import { Movie, Genre } from '../types';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { CinematicBackground, CinematicCard } from '../components/cinematic';
import { Confetti } from '../components/Confetti';
import { CatMascot, CatPose } from '../components/onboarding/CatMascot';
import { OnboardingProgressBar } from '../components/onboarding/OnboardingProgressBar';
import { Top5Preview } from '../components/onboarding/Top5Preview';
import { ONBOARDING_PAIRS } from '../data/onboardingMovies';
import { SignUpFlow } from '../components/onboarding/SignUpFlow';
import { AuthScreen } from './AuthScreen';
import { searchMoviesByTitle, DBMovie } from '../services/database';
import { getPosterUrl } from '../services/tmdb';
import { VIBE_GENRE_MAP } from '../utils/genreAffinity';
import { useAlert } from '../contexts/AlertContext';


// Number of fresh personalized comparisons (9 fresh + 7 tournament = 16 total interleaved)
const PERSONALIZED_COUNT = 9;
const TAILORED_TOTAL = 16;

// Distribution for personalized pairs (9 pairs = 18 movies):
// 3 prime pairs = 6 general + 2 childhood pairs = 4 movies
// 2 adjacent pairs = 4 movies
// 2 all-timer pairs = 4 movies
const PRIME_GENERAL_COUNT = 6;    // 3 pairs worth of general prime movies
const CHILDHOOD_COUNT = 4;        // 2 pairs worth of childhood movies (ages 0-14)
const ADJACENT_COUNT = 4;         // 2 pairs worth
const ALLTIMER_COUNT = 4;         // 2 pairs worth
const ADJACENT_YEARS_RANGE = 10;  // ±10 years from prime boundaries

// Family-friendly MPAA ratings for childhood movies
const FAMILY_RATINGS = new Set(['G', 'PG', 'PG-13', 'NR', '']);

// Interleaved sequence of fresh pairs and tournament matches
// 'fresh' = show next fresh curated pair, number = tournament match index (0-6)
const TAILORED_SEQUENCE: Array<'fresh' | number> = [
  'fresh', 'fresh', 'fresh',  // 1-3
  0, 1,                        // 4-5: QF1, QF2
  'fresh', 'fresh',            // 6-7
  2, 3,                        // 8-9: QF3, QF4
  'fresh',                     // 10
  4, 5,                        // 11-12: SF1, SF2
  'fresh', 'fresh', 'fresh',  // 13-15
  6,                           // 16: Final
];

// All-timer movies - highest cultural impact, transcend decades and vibes
// Selected by vote count and cultural significance
// Uses TMDb IDs in the format 'tmdb-{id}'
const ALL_TIMER_MOVIE_IDS = [
  // Top tier classics (highest vote counts)
  'tmdb-278',    // The Shawshank Redemption (1994)
  'tmdb-238',    // The Godfather (1972)
  'tmdb-240',    // The Godfather Part II (1974)
  'tmdb-155',    // The Dark Knight (2008)
  'tmdb-550',    // Fight Club (1999)
  'tmdb-680',    // Pulp Fiction (1994)
  'tmdb-13',     // Forrest Gump (1994)
  'tmdb-603',    // The Matrix (1999)
  'tmdb-120',    // LOTR: Fellowship (2001)
  'tmdb-122',    // LOTR: Return of the King (2003)
  'tmdb-27205',  // Inception (2010)
  'tmdb-157336', // Interstellar (2014)
  'tmdb-11',     // Star Wars (1977)
  'tmdb-1891',   // Empire Strikes Back (1980)
  'tmdb-329',    // Jurassic Park (1993)
  'tmdb-597',    // Titanic (1997)
  'tmdb-274',    // Silence of the Lambs (1991)
  'tmdb-807',    // Se7en (1995)
  'tmdb-78',     // Blade Runner (1982)
  'tmdb-105',    // Back to the Future (1985)
  'tmdb-389',    // 12 Angry Men (1957)
  'tmdb-429',    // The Good, the Bad and the Ugly (1966)
  'tmdb-496243', // Parasite (2019)
  'tmdb-299536', // Avengers: Infinity War (2018)
];

// Check if a movie matches the user's vibe preferences
const matchesVibes = (
  movie: Movie,
  vibes: { tone: 'light' | 'heavy' | null; entertainment: 'laughs' | 'thrills' | null; pacing: 'slow' | 'fast' | null }
): { matches: boolean; score: number; antiScore: number } => {
  const genres = movie.genres || [];

  const toneMatch = !vibes.tone ||
    VIBE_GENRE_MAP.tone[vibes.tone].some(g => genres.includes(g as any));
  const entMatch = !vibes.entertainment ||
    VIBE_GENRE_MAP.entertainment[vibes.entertainment].some(g => genres.includes(g as any));
  const paceMatch = !vibes.pacing ||
    VIBE_GENRE_MAP.pacing[vibes.pacing].some(g => genres.includes(g as any));

  // Count how many vibes match
  let score = 0;
  if (toneMatch) score++;
  if (entMatch) score++;
  if (paceMatch) score++;

  // Count anti-matches: dimensions where movie matches the *opposite* but not the selected vibe
  let antiScore = 0;
  if (vibes.tone) {
    const opposite = vibes.tone === 'light' ? 'heavy' : 'light';
    const matchesSelected = VIBE_GENRE_MAP.tone[vibes.tone].some(g => genres.includes(g as any));
    const matchesOpposite = VIBE_GENRE_MAP.tone[opposite].some(g => genres.includes(g as any));
    if (!matchesSelected && matchesOpposite) antiScore++;
  }
  if (vibes.entertainment) {
    const opposite = vibes.entertainment === 'laughs' ? 'thrills' : 'laughs';
    const matchesSelected = VIBE_GENRE_MAP.entertainment[vibes.entertainment].some(g => genres.includes(g as any));
    const matchesOpposite = VIBE_GENRE_MAP.entertainment[opposite].some(g => genres.includes(g as any));
    if (!matchesSelected && matchesOpposite) antiScore++;
  }
  if (vibes.pacing) {
    const opposite = vibes.pacing === 'slow' ? 'fast' : 'slow';
    const matchesSelected = VIBE_GENRE_MAP.pacing[vibes.pacing].some(g => genres.includes(g as any));
    const matchesOpposite = VIBE_GENRE_MAP.pacing[opposite].some(g => genres.includes(g as any));
    if (!matchesSelected && matchesOpposite) antiScore++;
  }

  return { matches: toneMatch && entMatch && paceMatch, score, antiScore };
};

// Get original database tier (ignoring pool promotion)
const originalTier = (m: Movie): number => m.sourceTier || m.tier || 1;

// Helper to shuffle array
const shuffle = <T,>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Helper to get movies from a pool, prioritizing higher tiers
// Only one movie per franchise/collection allowed
const getFromPool = (
  pool: Movie[],
  needed: number,
  applyVibes: boolean = false,
  usedCollections?: Set<number>,
  vibes: { tone: 'light' | 'heavy' | null; entertainment: 'laughs' | 'thrills' | null; pacing: 'slow' | 'fast' | null } = { tone: null, entertainment: null, pacing: null },
): Movie[] => {
  const result: Movie[] = [];
  const usedIds = new Set<string>();
  const usedColls = usedCollections || new Set<number>();
  const tiers = [1, 2, 3, 4];

  for (const tier of tiers) {
    if (result.length >= needed) break;
    let tierMovies = pool.filter(m => {
      if (originalTier(m) !== tier) return false;
      if (usedIds.has(m.id)) return false;
      if (m.collectionId && usedColls.has(m.collectionId)) return false;
      return true;
    });

    const shuffled = applyVibes
      ? tierMovies
          .map(m => {
            const { score, antiScore } = matchesVibes(m, vibes);
            const weight = Math.pow(2, score - antiScore);
            return { movie: m, sortKey: -Math.log(Math.random()) / weight };
          })
          .sort((a, b) => a.sortKey - b.sortKey)
          .map(x => x.movie)
      : shuffle(tierMovies);
    for (const m of shuffled) {
      if (result.length >= needed) break;
      if (m.collectionId && usedColls.has(m.collectionId)) continue;
      usedIds.add(m.id);
      if (m.collectionId) usedColls.add(m.collectionId);
      result.push(m);
    }
  }

  return result;
};

// Decades for selection
const DECADES = ['20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s', '00s', '10s'];
const DECADE_VALUES: Record<string, number> = {
  '20s': 1920, '30s': 1930, '40s': 1940, '50s': 1950, '60s': 1960,
  '70s': 1970, '80s': 1980, '90s': 1990, '00s': 2000, '10s': 2010,
};

type FavComparisonResult = 'win' | 'loss';
const FAV_TOTAL_COMPARISONS = 3;

function selectFavBinarySearchOpponent(
  rankedMovies: Movie[],
  results: FavComparisonResult[],
  targetMovieId: string,
): Movie | null {
  if (rankedMovies.length === 0) return null;
  const opponents = rankedMovies.filter(m => m.id !== targetMovieId);
  if (opponents.length === 0) return null;
  let low = 0;
  let high = opponents.length - 1;
  for (const result of results) {
    if (low >= high) break;
    const mid = Math.floor((low + high) / 2);
    if (result === 'win') {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  const midpoint = Math.floor((low + high) / 2);
  return opponents[Math.min(midpoint, opponents.length - 1)];
}

interface OnboardingScreenProps {
  onComplete: () => void;
  deepLinkHint?: string; // e.g. "someone challenged you on aaybee vs!"
}

export function OnboardingScreen({ onComplete, deepLinkHint }: OnboardingScreenProps) {
  const [step, setStep] = useState(1);
  const [pairKey, setPairKey] = useState(0);
  const [shownMovieIds, setShownMovieIds] = useState<string[]>([]);
  const [personalizedPairs, setPersonalizedPairs] = useState<{ movieA: Movie; movieB: Movie }[]>([]);
  const [tailoredIndex, setTailoredIndex] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedDecade, setSelectedDecade] = useState<string | null>(null);
  const [lastChoice, setLastChoice] = useState<'A' | 'B' | null>(null);
  const [swipeHistory, setSwipeHistory] = useState<Array<{
    movie: Movie;
    position: 'A' | 'B';
    replacedWith: Movie;
    pairIndex: number;
  }>>([]);
  const [vibeSelections, setVibeSelections] = useState<{
    tone: 'light' | 'heavy' | null;
    entertainment: 'laughs' | 'thrills' | null;
    pacing: 'slow' | 'fast' | null;
  }>({ tone: null, entertainment: null, pacing: null });
  const [showSignIn, setShowSignIn] = useState(false);

  // Tournament state for final 7 comparisons to solidify top 5
  const [tournamentMovies, setTournamentMovies] = useState<Movie[]>([]);
  const [tournamentResults, setTournamentResults] = useState<{ qfWinners: Movie[]; sfWinners: Movie[]; champion: Movie | null }>({
    qfWinners: [],
    sfWinners: [],
    champion: null,
  });

  // Favorites flow state
  const [favoriteMovies, setFavoriteMovies] = useState<Array<{
    id: string; title: string; year: number; posterUrl: string | null;
  } | null>>([null, null, null]);
  // Grid selection state (step 16) — single 4x4 grid, pick up to 2
  const [gridMovies, setGridMovies] = useState<Movie[]>([]);
  const [gridSelections, setGridSelections] = useState<Movie[]>([]);
  const [gridPhase, setGridPhase] = useState<'grid' | 'missing' | 'search'>('grid');

  // Search state (kept for "missing movie" search)
  const [favSearchQuery, setFavSearchQuery] = useState('');
  const [favSearchResults, setFavSearchResults] = useState<DBMovie[]>([]);
  const [favSearchLoading, setFavSearchLoading] = useState(false);
  const [favRankIndex, setFavRankIndex] = useState(0);
  const [favComparisonIndex, setFavComparisonIndex] = useState(0);
  const [favResults, setFavResults] = useState<FavComparisonResult[]>([]);
  const [favCurrentOpponent, setFavCurrentOpponent] = useState<Movie | null>(null);
  const [favWaitingForResult, setFavWaitingForResult] = useState(false);
  const [favInitialComparisons, setFavInitialComparisons] = useState(0);
  const favDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    setBirthDecade,
    setVibePreferences,
    recordComparison,
    undoLastComparison,
    completeOnboarding,
    getRankedMovies,
    getAllComparedMovies,
    userSession,
    movies,
    markMovieAsUnknown,
    markMovieAsKnown,
  } = useAppStore();
  const haptics = useHaptics();
  const { showAlert } = useAlert();

  // Get fixed pairs from store
  const fixedPairs = useMemo(() => {
    return ONBOARDING_PAIRS.map(pair => ({
      movieA: movies.get(pair.movieAId),
      movieB: movies.get(pair.movieBId),
    })).filter(pair => pair.movieA && pair.movieB) as { movieA: Movie; movieB: Movie }[];
  }, [movies]);

  // Generate personalized pairs when reaching step 14
  // 40/40/20 distribution:
  // - 40% from prime years (ages 12-25)
  // - 40% from adjacent years (±10 years from prime)
  // - 20% from all-timers (top movies regardless of decade)
  useEffect(() => {
    if (step === 14 && personalizedPairs.length === 0) {
      const primeYears = userSession.preferences.moviePrimeStart && userSession.preferences.moviePrimeEnd
        ? { start: userSession.preferences.moviePrimeStart, end: userSession.preferences.moviePrimeEnd }
        : null;

      const vibes = userSession.preferences.vibes || { tone: null, entertainment: null, pacing: null };

      // Calculate targets
      const birthDecade = userSession.preferences.birthDecade;
      const childhoodEnd = birthDecade ? birthDecade + 14 : null;

      console.log('[Onboarding] === Movie Distribution ===');
      console.log('[Onboarding] Prime years:', primeYears);
      console.log('[Onboarding] Childhood end:', childhoodEnd);
      console.log('[Onboarding] Vibes:', vibes);

      // Track used collections across all selections (one movie per franchise)
      // Seed with collections from fixed pairs so we don't repeat those franchises
      const usedCollections = new Set<number>();
      for (const id of shownMovieIds) {
        const m = movies.get(id);
        if (m?.collectionId) usedCollections.add(m.collectionId);
      }

      // ====== PHASE 1: Select 8 all-timer movies ======
      const allTimerIdSet = new Set(ALL_TIMER_MOVIE_IDS);
      const availableAllTimers = ALL_TIMER_MOVIE_IDS
        .map(id => movies.get(id))
        .filter((m): m is Movie => {
          if (m === undefined || shownMovieIds.includes(m.id)) return false;
          if (m.collectionId && usedCollections.has(m.collectionId)) return false;
          return true;
        });

      const allTimerSelection: Movie[] = [];
      for (const movie of shuffle(availableAllTimers)) {
        if (allTimerSelection.length >= ALLTIMER_COUNT) break;
        if (movie.collectionId && usedCollections.has(movie.collectionId)) continue;
        allTimerSelection.push(movie);
        if (movie.collectionId) usedCollections.add(movie.collectionId);
      }
      console.log('[Onboarding] All-timers selected:', allTimerSelection.length, allTimerSelection.map(m => m.title));

      // ====== Get all available movies excluding all-timers and shown ======
      const allAvailableMovies = Array.from(movies.values())
        .filter(m =>
          !shownMovieIds.includes(m.id) &&
          !allTimerIdSet.has(m.id) &&
          !allTimerSelection.some(at => at.id === m.id) &&
          originalTier(m) === 1
        );

      console.log('[Onboarding] Total available (excl all-timers):', allAvailableMovies.length);

      let childhoodSelection: Movie[] = [];
      let primeSelection: Movie[] = [];
      let adjacentSelection: Movie[] = [];

      if (primeYears && birthDecade) {
        // Define adjacent years: ±10 years from prime boundaries
        const adjacentBefore = {
          start: primeYears.start - ADJACENT_YEARS_RANGE,
          end: primeYears.start - 1
        };
        const adjacentAfter = {
          start: primeYears.end + 1,
          end: primeYears.end + ADJACENT_YEARS_RANGE
        };

        console.log(`[Onboarding] Prime: ${primeYears.start}-${primeYears.end}`);
        console.log(`[Onboarding] Childhood: ${birthDecade}-${birthDecade + 14}`);
        console.log(`[Onboarding] Adjacent: ${adjacentBefore.start}-${adjacentBefore.end}, ${adjacentAfter.start}-${adjacentAfter.end}`);

        // ====== PHASE 2: Try to select 6 childhood movies (ages 0-14) ======
        const childhoodPool = allAvailableMovies.filter(m => {
          if (m.year < birthDecade || m.year > birthDecade + 14) return false;
          // Must be family-friendly (G, PG, PG-13) or animation
          if (m.genres?.includes('animation' as any)) return true;
          if (m.certification && FAMILY_RATINGS.has(m.certification)) return true;
          // Fallback: exclude horror/thriller if no certification
          if (!m.certification) {
            return !m.genres?.includes('horror' as any) && !m.genres?.includes('thriller' as any);
          }
          return false;
        });
        console.log(`[Onboarding] Childhood pool: ${childhoodPool.length} movies`);

        // Only use childhood selection if pool is large enough (skip for 1940s/1950s)
        const useChildhood = childhoodPool.length >= 6;
        if (useChildhood) {
          childhoodSelection = getFromPool(childhoodPool, CHILDHOOD_COUNT, false, usedCollections);
          console.log('[Onboarding] Childhood selected:', childhoodSelection.length, childhoodSelection.map(m => `${m.title} (${m.year})`));
        } else {
          console.log('[Onboarding] Childhood pool too small, skipping childhood selection');
        }

        // ====== PHASE 3: Select prime years movies (general, excluding childhood) ======
        const usedChildhoodIds = new Set(childhoodSelection.map(m => m.id));
        const primePool = allAvailableMovies.filter(
          m => m.year >= primeYears.start && m.year <= primeYears.end && !usedChildhoodIds.has(m.id)
        );
        console.log(`[Onboarding] Prime pool: ${primePool.length} movies`);

        // If no childhood, take full 18 prime movies; otherwise take 12
        const primeNeeded = useChildhood ? PRIME_GENERAL_COUNT : (PRIME_GENERAL_COUNT + CHILDHOOD_COUNT);
        primeSelection = getFromPool(primePool, primeNeeded, true, usedCollections, vibes);
        console.log('[Onboarding] Prime selected:', primeSelection.length, primeSelection.map(m => `${m.title} (${m.year})`));

        // ====== PHASE 4: Select adjacent years movies ======
        const usedPrimeIds = new Set([...primeSelection, ...childhoodSelection].map(m => m.id));
        const adjacentPool = allAvailableMovies.filter(
          m => !usedPrimeIds.has(m.id) && (
            (m.year >= adjacentBefore.start && m.year <= adjacentBefore.end) ||
            (m.year >= adjacentAfter.start && m.year <= adjacentAfter.end)
          )
        );
        console.log(`[Onboarding] Adjacent pool: ${adjacentPool.length} movies`);

        adjacentSelection = getFromPool(adjacentPool, ADJACENT_COUNT, true, usedCollections, vibes);
        console.log('[Onboarding] Adjacent selected:', adjacentSelection.length, adjacentSelection.map(m => `${m.title} (${m.year})`));

        // ====== FALLBACKS ======
        const usedIds = new Set([
          ...childhoodSelection.map(m => m.id),
          ...primeSelection.map(m => m.id),
          ...adjacentSelection.map(m => m.id),
          ...allTimerSelection.map(m => m.id)
        ]);

        // If prime pool is too small, fill from adjacent (respecting collections)
        const totalPrimeNeeded = primeNeeded;
        if (primeSelection.length < totalPrimeNeeded) {
          const shortfall = totalPrimeNeeded - primeSelection.length;
          const additionalFromAdjacent = adjacentPool
            .filter(m => !usedIds.has(m.id) && (!m.collectionId || !usedCollections.has(m.collectionId)))
            .slice(0, shortfall);
          additionalFromAdjacent.forEach(m => {
            usedIds.add(m.id);
            if (m.collectionId) usedCollections.add(m.collectionId);
          });
          primeSelection.push(...additionalFromAdjacent);
          console.log(`[Onboarding] Filled prime shortfall with ${additionalFromAdjacent.length} from adjacent`);
        }

        // If adjacent pool is too small, fill from any remaining movies (respecting collections)
        if (adjacentSelection.length < ADJACENT_COUNT) {
          const shortfall = ADJACENT_COUNT - adjacentSelection.length;
          const remainingMovies = allAvailableMovies.filter(m =>
            !usedIds.has(m.id) && (!m.collectionId || !usedCollections.has(m.collectionId))
          );
          const additionalFromRemaining = shuffle(remainingMovies).slice(0, shortfall);
          adjacentSelection.push(...additionalFromRemaining);
          console.log(`[Onboarding] Filled adjacent shortfall with ${additionalFromRemaining.length} from remaining`);
        }
      } else {
        // No prime years set - distribute evenly with vibe filtering
        const halfNeeded = Math.floor((PRIME_GENERAL_COUNT + CHILDHOOD_COUNT + ADJACENT_COUNT) / 2);
        primeSelection = getFromPool(allAvailableMovies, halfNeeded, true, usedCollections, vibes);
        const usedIds = new Set(primeSelection.map(m => m.id));
        adjacentSelection = getFromPool(
          allAvailableMovies.filter(m => !usedIds.has(m.id)),
          halfNeeded,
          true,
          usedCollections,
          vibes
        );
      }

      // ====== BUILD PAIRS - Mix movies from all categories ======
      // Combine all selections into one pool, then shuffle and pair
      const allSelectedMovies = [
        ...allTimerSelection,
        ...childhoodSelection,
        ...primeSelection,
        ...adjacentSelection,
      ];

      // Shuffle within tiers, then concat in tier order so tier 1 pairs come first
      const tier1 = shuffle(allSelectedMovies.filter(m => originalTier(m) === 1));
      const tier2plus = shuffle(allSelectedMovies.filter(m => originalTier(m) >= 2));
      const shuffledAll = [...tier1, ...tier2plus];

      // Create pairs from the mixed pool
      const mixedPairs: { movieA: Movie; movieB: Movie }[] = [];
      for (let i = 0; i < shuffledAll.length - 1 && mixedPairs.length < PERSONALIZED_COUNT; i += 2) {
        mixedPairs.push({ movieA: shuffledAll[i], movieB: shuffledAll[i + 1] });
      }

      console.log('[Onboarding] === Final Distribution ===');
      console.log('[Onboarding] All-timers:', allTimerSelection.length);
      console.log('[Onboarding] Childhood:', childhoodSelection.length);
      console.log('[Onboarding] Prime:', primeSelection.length);
      console.log('[Onboarding] Adjacent:', adjacentSelection.length);
      console.log('[Onboarding] Total movies:', allSelectedMovies.length);
      console.log('[Onboarding] Total pairs:', mixedPairs.length);

      setPersonalizedPairs(mixedPairs);
    }
  }, [step, movies, shownMovieIds, userSession.preferences, personalizedPairs.length]);

  // Generate tournament bracket lazily when first tournament match is reached
  useEffect(() => {
    if (step === 14 && tailoredIndex >= 3 && tournamentMovies.length === 0) {
      const top8 = getAllComparedMovies().slice(0, 8);
      setTournamentMovies(top8);
      setTournamentResults({ qfWinners: [], sfWinners: [], champion: null });
    }
  }, [step, tailoredIndex, getAllComparedMovies, tournamentMovies.length]);

  // Generate 4x4 grid for step 16 favorite selection
  useEffect(() => {
    if (step === 16 && gridMovies.length === 0) {
      const vibes = userSession.preferences.vibes || { tone: null, entertainment: null, pacing: null };
      const primeYears = userSession.preferences.moviePrimeStart && userSession.preferences.moviePrimeEnd
        ? { start: userSession.preferences.moviePrimeStart, end: userSession.preferences.moviePrimeEnd }
        : null;
      const birthDecade = userSession.preferences.birthDecade;

      // Build base pool: tier 1, not shown
      const shownSet = new Set(shownMovieIds);
      let basePool = Array.from(movies.values()).filter(m =>
        originalTier(m) === 1 && !shownSet.has(m.id) && m.status !== 'unknown'
      );

      const usedCollections = new Set<number>();
      for (const id of shownMovieIds) {
        const m = movies.get(id);
        if (m?.collectionId) usedCollections.add(m.collectionId);
      }

      // Build era pools
      const allTimerIdSet = new Set(ALL_TIMER_MOVIE_IDS);
      const allTimerPool = basePool.filter(m => allTimerIdSet.has(m.id));
      const nonAllTimerPool = basePool.filter(m => !allTimerIdSet.has(m.id));

      let primePool: Movie[] = [];
      let childhoodPool: Movie[] = [];
      let adjacentPool: Movie[] = [];

      if (primeYears && birthDecade) {
        primePool = nonAllTimerPool.filter(m =>
          m.year >= primeYears.start && m.year <= primeYears.end
        );
        childhoodPool = nonAllTimerPool.filter(m => {
          if (m.year < birthDecade || m.year > birthDecade + 14) return false;
          if (m.genres?.includes('animation' as any)) return true;
          if (m.certification && FAMILY_RATINGS.has(m.certification)) return true;
          if (!m.certification) {
            return !m.genres?.includes('horror' as any) && !m.genres?.includes('thriller' as any);
          }
          return false;
        });
        adjacentPool = nonAllTimerPool.filter(m =>
          !primePool.includes(m) && !childhoodPool.includes(m) && (
            (m.year >= primeYears.start - ADJACENT_YEARS_RANGE && m.year < primeYears.start) ||
            (m.year > primeYears.end && m.year <= primeYears.end + ADJACENT_YEARS_RANGE)
          )
        );
      } else {
        primePool = nonAllTimerPool;
      }

      const usedIds = new Set<string>();
      const gridResult: Movie[] = [];

      // Target distribution for 16 movies: ~5 prime, ~3 childhood, ~4 adjacent, ~4 all-timer
      const targets = [
        { pool: primePool, count: 5 },
        { pool: childhoodPool.length >= 3 ? childhoodPool : primePool, count: 3 },
        { pool: adjacentPool.length >= 4 ? adjacentPool : primePool, count: 4 },
        { pool: allTimerPool, count: 4 },
      ];

      for (const { pool, count } of targets) {
        const available = pool.filter(m =>
          !usedIds.has(m.id) &&
          (!m.collectionId || !usedCollections.has(m.collectionId))
        );
        const picked = getFromPool(available, count, true, usedCollections, vibes);
        for (const m of picked) {
          usedIds.add(m.id);
          if (m.collectionId) usedCollections.add(m.collectionId);
          gridResult.push(m);
        }
      }

      // Fill to 16 from any remaining tier-1
      if (gridResult.length < 16) {
        const remaining = basePool.filter(m =>
          !usedIds.has(m.id) &&
          (!m.collectionId || !usedCollections.has(m.collectionId))
        );
        const extra = getFromPool(remaining, 16 - gridResult.length, true, usedCollections, vibes);
        for (const m of extra) {
          usedIds.add(m.id);
          if (m.collectionId) usedCollections.add(m.collectionId);
          gridResult.push(m);
        }
      }

      // If still short, fill from tier 2
      if (gridResult.length < 16) {
        const tier2Pool = Array.from(movies.values()).filter(m =>
          originalTier(m) === 2 && !usedIds.has(m.id) && !shownSet.has(m.id) &&
          m.status !== 'unknown' &&
          (!m.collectionId || !usedCollections.has(m.collectionId))
        );
        const extra = getFromPool(tier2Pool, 16 - gridResult.length, true, usedCollections, vibes);
        for (const m of extra) {
          usedIds.add(m.id);
          if (m.collectionId) usedCollections.add(m.collectionId);
          gridResult.push(m);
        }
      }

      const grid = shuffle(gridResult);
      setShownMovieIds(prev => [...prev, ...grid.map(m => m.id)]);
      setGridMovies(grid);

      console.log('[Onboarding] Grid movies generated:', grid.length);
    }
  }, [step, gridMovies, movies, shownMovieIds, userSession.preferences]);

  const goToNextStep = useCallback(() => {
    setPairKey(prev => prev + 1);
    setStep(prev => prev + 1);
  }, []);

  const handleComparison = useCallback((winnerId: string, loserId: string) => {
    recordComparison(winnerId, loserId);
    setShownMovieIds(prev => [...prev, winnerId, loserId]);
  }, [recordComparison]);

  const handleDecadeSelect = useCallback((decade: string) => {
    setSelectedDecade(decade);
  }, []);

  const handleDecadeContinue = useCallback(() => {
    if (selectedDecade) {
      setBirthDecade(DECADE_VALUES[selectedDecade]);
    }
    goToNextStep();
  }, [selectedDecade, setBirthDecade, goToNextStep]);

  const handleComplete = useCallback(() => {
    completeOnboarding();
    onComplete();
  }, [completeOnboarding, onComplete]);

  // Unified undo handler for tailored comparisons (fresh + tournament interleaved)
  const handleGoBackTailored = useCallback(() => {
    if (tailoredIndex <= 0) return;
    const undone = undoLastComparison();
    if (!undone) return;

    const prevEntry = TAILORED_SEQUENCE[tailoredIndex - 1];

    if (prevEntry === 'fresh') {
      // Undo fresh comparison
      setShownMovieIds(prev => prev.slice(0, -2));
    } else {
      // Undo tournament match
      const matchIndex = prevEntry as number;
      if (matchIndex < 4) {
        // Was a QF match, pop last qfWinner
        setTournamentResults(prev => ({
          ...prev,
          qfWinners: prev.qfWinners.slice(0, -1),
        }));
      } else if (matchIndex < 6) {
        // Was a SF match, pop last sfWinner
        setTournamentResults(prev => ({
          ...prev,
          sfWinners: prev.sfWinners.slice(0, -1),
        }));
      } else {
        // Was the final, reset champion
        setTournamentResults(prev => ({
          ...prev,
          champion: null,
        }));
      }
    }

    setTailoredIndex(prev => prev - 1);
    setPairKey(prev => prev + 1);
  }, [tailoredIndex, undoLastComparison]);

  // Handle swipe-away in personalized pairs (mark as unknown and replace)
  const handleSwipeAwayPersonalized = useCallback((pairIndex: number, position: 'A' | 'B') => {
    const pair = personalizedPairs[pairIndex];
    if (!pair) return;

    const movieToReplace = position === 'A' ? pair.movieA : pair.movieB;
    const otherMovie = position === 'A' ? pair.movieB : pair.movieA;

    // Mark as unknown
    markMovieAsUnknown(movieToReplace.id);

    // Count swipes already made on this pair (not including this one)
    const swipesOnThisPair = swipeHistory.filter(s => s.pairIndex === pairIndex).length;

    // Find all movie IDs currently in use
    const usedIds = new Set<string>();
    personalizedPairs.forEach(p => {
      usedIds.add(p.movieA.id);
      usedIds.add(p.movieB.id);
    });
    shownMovieIds.forEach(id => usedIds.add(id));
    // Also exclude movies in swipe history (they were swiped away)
    swipeHistory.forEach(s => usedIds.add(s.movie.id));

    // Determine the era of the swiped movie
    const birthDecade = userSession.preferences.birthDecade;
    const primeStart = userSession.preferences.moviePrimeStart;
    const primeEnd = userSession.preferences.moviePrimeEnd;
    const movieYear = movieToReplace.year;
    const allTimerIdSet = new Set(ALL_TIMER_MOVIE_IDS);

    type EraType = 'childhood' | 'prime' | 'adjacent' | 'alltimer';
    let originalEra: EraType = 'alltimer';

    // Check if it's an all-timer first
    if (allTimerIdSet.has(movieToReplace.id)) {
      originalEra = 'alltimer';
    } else if (birthDecade && primeStart && primeEnd) {
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
      if (era === 'alltimer') {
        return allTimerIdSet.has(movie.id);
      }
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
        default:
          return true;
      }
    };

    // After 2 swipes (on 3rd+ replacement), use known movies
    const statusFilter = swipesOnThisPair >= 2
      ? (m: Movie) => m.status === 'known'
      : (m: Movie) => m.status !== 'unknown';

    // Try to find replacement prioritizing recognizability (tier) over era match
    let replacement: Movie | null = null;
    const tiers = [1, 2, 3, 4];
    const eraOrder: EraType[] = [originalEra, 'prime', 'adjacent', 'alltimer', 'childhood']
      .filter((e, i, arr) => arr.indexOf(e) === i) as EraType[]; // Dedupe while preserving order

    // Search by tier first, then by era (a well-known movie from another era
    // beats an obscure movie from the right era during onboarding)
    const otherCollectionId = otherMovie.collectionId;
    for (const tier of tiers) {
      for (const era of eraOrder) {
        const candidates = Array.from(movies.values()).filter(m =>
          !usedIds.has(m.id) &&
          statusFilter(m) &&
          originalTier(m) === tier &&
          filterByEra(m, era) &&
          !(m.collectionId && otherCollectionId && m.collectionId === otherCollectionId)
        );
        if (candidates.length > 0) {
          replacement = candidates[Math.floor(Math.random() * candidates.length)];
          console.log(`[Onboarding Swipe] Replacement from ${era} era, tier ${tier}: ${replacement.title} (${replacement.year})`);
          break;
        }
      }
      if (replacement) break;
    }

    // Final fallback: any non-unknown movie
    if (!replacement) {
      const fallbackCandidates = Array.from(movies.values()).filter(m =>
        !usedIds.has(m.id) &&
        m.status !== 'unknown'
      );
      if (fallbackCandidates.length > 0) {
        replacement = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
        console.log(`[Onboarding Swipe] Fallback replacement: ${replacement.title}`);
      }
    }

    if (!replacement) {
      // No replacement available, just move to next pair
      setSwipeHistory([]);
      setTailoredIndex(prev => prev + 1);
      setPairKey(prev => prev + 1);
      return;
    }

    // Push to swipe history for undo
    setSwipeHistory(prev => [...prev, {
      movie: movieToReplace,
      position,
      replacedWith: replacement!,
      pairIndex,
    }]);

    // Update the pair
    const newPairs = [...personalizedPairs];
    newPairs[pairIndex] = position === 'A'
      ? { movieA: replacement, movieB: otherMovie }
      : { movieA: otherMovie, movieB: replacement };

    setPersonalizedPairs(newPairs);
    setPairKey(prev => prev + 1);
  }, [personalizedPairs, shownMovieIds, movies, markMovieAsUnknown, swipeHistory, userSession.preferences]);

  // Handle swipe away with confirmation for ranked movies in personalized pairs
  const handleSwipeAwayPersonalizedWithConfirmation = useCallback((pairIndex: number, position: 'A' | 'B') => {
    const pair = personalizedPairs[pairIndex];
    if (!pair) return;

    const movie = position === 'A' ? pair.movieA : pair.movieB;

    if (movie.totalComparisons > 0) {
      showAlert(
        'are you sure?',
        'you have already compared this movie. if you go ahead you won\'t see this movie in comparisons any more',
        [
          { text: 'no, let\'s keep this movie', style: 'cancel' },
          {
            text: 'yes, I am sure',
            style: 'destructive',
            onPress: () => handleSwipeAwayPersonalized(pairIndex, position),
          },
        ]
      );
    } else {
      handleSwipeAwayPersonalized(pairIndex, position);
    }
  }, [personalizedPairs, showAlert, handleSwipeAwayPersonalized]);

  // Handle undo swipe in personalized pairs (pops from history stack)
  const handleUndoSwipePersonalized = useCallback(() => {
    if (swipeHistory.length === 0) return;

    // Pop the last swipe from history
    const lastSwipe = swipeHistory[swipeHistory.length - 1];
    const { movie, position, pairIndex } = lastSwipe;
    const pair = personalizedPairs[pairIndex];

    if (!pair) {
      setSwipeHistory(prev => prev.slice(0, -1));
      return;
    }

    // Restore the movie's status (mark as known again)
    markMovieAsKnown(movie.id);

    // Restore the pair
    const otherMovie = position === 'A' ? pair.movieB : pair.movieA;
    const newPairs = [...personalizedPairs];
    newPairs[pairIndex] = position === 'A'
      ? { movieA: movie, movieB: otherMovie }
      : { movieA: otherMovie, movieB: movie };

    setPersonalizedPairs(newPairs);
    setSwipeHistory(prev => prev.slice(0, -1));
    setPairKey(prev => prev + 1);
  }, [swipeHistory, personalizedPairs, markMovieAsKnown]);

  // Favorites: debounced search handler
  const handleFavSearch = useCallback((text: string) => {
    setFavSearchQuery(text);
    if (favDebounceRef.current) clearTimeout(favDebounceRef.current);
    if (text.trim().length < 2) {
      setFavSearchResults([]);
      setFavSearchLoading(false);
      return;
    }
    setFavSearchLoading(true);
    favDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchMoviesByTitle(text.trim());
        // Filter out movies already picked as favorites
        const pickedIds = new Set(favoriteMovies.filter(Boolean).map(m => m!.id));
        setFavSearchResults(results.filter(r => !pickedIds.has(r.id)));
      } catch {
        setFavSearchResults([]);
      } finally {
        setFavSearchLoading(false);
      }
    }, 300);
  }, [favoriteMovies]);

  // Grid: select a movie from grid
  const handleGridSelect = useCallback((movie: Movie) => {
    haptics.medium();
    setGridSelections(prev => {
      const already = prev.find(m => m.id === movie.id);
      if (already) {
        // Deselect
        return prev.filter(m => m.id !== movie.id);
      }
      if (prev.length >= 2) {
        // At cap — ignore
        return prev;
      }
      // Select
      markMovieAsKnown(movie.id);
      return [...prev, movie];
    });
  }, [markMovieAsKnown, haptics]);

  // Grid: advance to missing movie phase
  const handleGridContinue = useCallback(() => {
    setGridPhase('missing');
  }, []);

  // Grid: finish selection and start rankings
  const handleFinishGridSelection = useCallback(() => {
    const picks = gridSelections;
    const favs: Array<{ id: string; title: string; year: number; posterUrl: string | null } | null> = picks.map(m => ({
      id: m.id, title: m.title, year: m.year, posterUrl: m.posterUrl || null,
    }));
    // Pad to at least 3
    while (favs.length < 3) favs.push(null);
    setFavoriteMovies(favs);

    // Initialize ranking for the first pick
    const validFavs = favs.filter(Boolean) as { id: string; title: string; year: number; posterUrl: string | null }[];
    if (validFavs.length > 0) {
      const storeMovie = movies.get(validFavs[0].id);
      setFavRankIndex(0);
      setFavComparisonIndex(0);
      setFavResults([]);
      setFavCurrentOpponent(null);
      setFavInitialComparisons(storeMovie?.totalComparisons || 0);
      setStep(17);
    } else {
      setStep(18);
    }
  }, [gridSelections, movies]);

  // Missing movie: select from search results as 4th favorite
  const handleMissingMovieSelect = useCallback((item: DBMovie) => {
    Keyboard.dismiss();
    const posterUrl = item.poster_url || getPosterUrl(item.poster_path);
    markMovieAsKnown(item.id, {
      title: item.title,
      year: item.year,
      posterUrl,
      genres: item.genres as Genre[],
      posterColor: item.poster_color,
      overview: item.overview || '',
      voteAverage: item.vote_average,
      voteCount: item.vote_count,
      directorName: item.director_name || undefined,
      directorId: item.director_id ? String(item.director_id) : undefined,
      collectionId: item.collection_id || undefined,
      collectionName: item.collection_name || undefined,
      certification: item.certification || undefined,
      tmdbId: item.tmdb_id || undefined,
      posterPath: item.poster_path || undefined,
    });
    // Add as 4th selection
    setGridSelections(prev => [...prev, movies.get(item.id) || {
      id: item.id, title: item.title, year: item.year,
      posterUrl, posterColor: item.poster_color || '#1A1A1E',
      genres: (item.genres || []) as Genre[], beta: 0,
      totalWins: 0, totalLosses: 0, totalComparisons: 0,
      timesShown: 0, lastShownAt: 0, status: 'known' as const,
    } as Movie]);

    // Build favorite movies from all picks including this one
    const picks = [...gridSelections.filter(Boolean) as Movie[]];
    const searchedMovie = movies.get(item.id) || {
      id: item.id, title: item.title, year: item.year,
      posterUrl, posterColor: item.poster_color || '#1A1A1E',
      genres: (item.genres || []) as Genre[], beta: 0,
      totalWins: 0, totalLosses: 0, totalComparisons: 0,
      timesShown: 0, lastShownAt: 0, status: 'known' as const,
    } as Movie;
    picks.push(searchedMovie);

    const favs = picks.map(m => ({
      id: m.id, title: m.title, year: m.year, posterUrl: m.posterUrl || null,
    }));
    setFavoriteMovies(favs);

    // Initialize ranking
    if (favs.length > 0) {
      const storeMovie = movies.get(favs[0].id);
      setFavRankIndex(0);
      setFavComparisonIndex(0);
      setFavResults([]);
      setFavCurrentOpponent(null);
      setFavInitialComparisons(storeMovie?.totalComparisons || 0);
      setStep(17);
    } else {
      setStep(18);
    }

    setFavSearchQuery('');
    setFavSearchResults([]);
  }, [markMovieAsKnown, gridSelections, movies]);

  // Favorites ranking: select opponent when comparison starts or changes
  useEffect(() => {
    if (step === 17 && !favWaitingForResult) {
      const pickedFavs = favoriteMovies.filter(Boolean) as { id: string; title: string; year: number; posterUrl: string | null }[];
      if (favRankIndex < pickedFavs.length) {
        const currentCompared = getAllComparedMovies();
        // Exclude other picked favorites that haven't completed their ranking
        const excludeIds = new Set(
          pickedFavs
            .filter((_, idx) => idx !== favRankIndex)
            .filter(fav => {
              const m = movies.get(fav.id);
              return !m || m.totalComparisons < FAV_TOTAL_COMPARISONS;
            })
            .map(fav => fav.id)
        );
        const filteredRanked = currentCompared.filter(m => !excludeIds.has(m.id));
        // If the user picked their movie in both first two comparisons,
        // force the third comparison against the current #1 movie
        if (favResults.length === 2 && favResults[0] === 'win' && favResults[1] === 'win') {
          const top1 = filteredRanked.find(m => m.id !== pickedFavs[favRankIndex].id);
          setFavCurrentOpponent(top1 || null);
        } else {
          const opponent = selectFavBinarySearchOpponent(filteredRanked, favResults, pickedFavs[favRankIndex].id);
          setFavCurrentOpponent(opponent);
        }
      }
    }
  }, [step, favComparisonIndex, favRankIndex, favResults, favoriteMovies, getAllComparedMovies, favWaitingForResult, movies]);

  // Favorites ranking: after each favorite finishes, auto-advance to next or go to reveal
  useEffect(() => {
    if (!favWaitingForResult) return;
    const pickedFavs = favoriteMovies.filter(Boolean) as { id: string; title: string; year: number; posterUrl: string | null }[];
    if (favRankIndex >= pickedFavs.length) return;
    const currentFav = pickedFavs[favRankIndex];
    const storeMovie = movies.get(currentFav.id);
    if (!storeMovie) return;
    const expectedTotal = favInitialComparisons + FAV_TOTAL_COMPARISONS;
    if (storeMovie.totalComparisons >= expectedTotal) {
      setFavWaitingForResult(false);
      const nextIdx = favRankIndex + 1;
      if (nextIdx < pickedFavs.length) {
        // Auto-advance to next unranked favorite (stay on step 17)
        const nextFav = pickedFavs[nextIdx];
        const nextStoreMovie = movies.get(nextFav.id);
        setFavRankIndex(nextIdx);
        setFavComparisonIndex(0);
        setFavResults([]);
        setFavCurrentOpponent(null);
        setFavInitialComparisons(nextStoreMovie?.totalComparisons || 0);
        setPairKey(prev => prev + 1);
      } else {
        // All ranked, go to reveal
        setStep(18);
      }
    }
  }, [movies, favWaitingForResult, favInitialComparisons, favoriteMovies, favRankIndex]);

  // Favorites ranking: handle a comparison choice
  const handleFavChoice = useCallback((choseTarget: boolean) => {
    const pickedFavs = favoriteMovies.filter(Boolean) as { id: string; title: string; year: number; posterUrl: string | null }[];
    if (favRankIndex >= pickedFavs.length || !favCurrentOpponent) return;
    const targetId = pickedFavs[favRankIndex].id;
    haptics.medium();
    const result: FavComparisonResult = choseTarget ? 'win' : 'loss';
    const newResults = [...favResults, result];
    setFavResults(newResults);
    if (choseTarget) {
      recordComparison(targetId, favCurrentOpponent.id);
    } else {
      recordComparison(favCurrentOpponent.id, targetId);
    }
    const nextIndex = favComparisonIndex + 1;
    setPairKey(prev => prev + 1);
    if (nextIndex >= FAV_TOTAL_COMPARISONS) {
      setFavWaitingForResult(true);
    } else {
      setFavComparisonIndex(nextIndex);
    }
  }, [favoriteMovies, favRankIndex, favCurrentOpponent, favResults, favComparisonIndex, recordComparison, haptics]);

  // Calculate progress for bar (shown in step 14: 16 interleaved pairs)
  const progress = useMemo(() => {
    if (step !== 14) return step > 14 ? 1 : 0;
    return tailoredIndex / TAILORED_TOTAL;
  }, [step, tailoredIndex]);

  // Haptic feedback on step 15 (after tailored comparisons complete)
  useEffect(() => {
    if (step === 15) {
      haptics.success();
    }
  }, [step, haptics]);

  // Show confetti on step 18 (top 5 reveal)
  useEffect(() => {
    if (step === 18) {
      setShowConfetti(true);
      haptics.success();
    }
  }, [step, haptics]);

  const renderStep = () => {
    switch (step) {
      // STEP 1: Welcome
      case 1:
        return (
          <StepContainer>
            {deepLinkHint && (
              <View style={styles.deepLinkBanner}>
                <Text style={styles.deepLinkBannerText}>{deepLinkHint}</Text>
              </View>
            )}
            <CatMascot pose="sat" size={220} />
            <Text style={styles.welcomeSubText}>Let's Play A or B!</Text>
            <ContinueButton onPress={goToNextStep} />
          </StepContainer>
        );

      // STEP 2: First Comparison (Star Wars vs Titanic)
      case 2: {
        const pair = fixedPairs[0];
        if (!pair) return <LoadingStep onSkip={goToNextStep} />;
        return (
          <View style={styles.fullContainer}>
            <View style={styles.comparisonContent}>
              <Text style={styles.promptText}>Which movie do you like more?</Text>
              <ComparisonStepSimple
                movieA={pair.movieA}
                movieB={pair.movieB}
                pairKey={pairKey}
                onSelectA={() => {
                  handleComparison(pair.movieA.id, pair.movieB.id);
                  setLastChoice('A');
                  goToNextStep();
                }}
                onSelectB={() => {
                  handleComparison(pair.movieB.id, pair.movieA.id);
                  setLastChoice('B');
                  goToNextStep();
                }}
              />
            </View>
          </View>
        );
      }

      // STEP 3: Great Choice transition
      case 3:
        return (
          <StepContainer>
            <Text style={styles.celebrationText}>Great choice!</Text>
            <CatMascot pose={lastChoice === 'B' ? 'right' : 'left'} size={220} />
            <Text style={styles.subText}>Let's do another</Text>
            <ContinueButton onPress={goToNextStep} />
          </StepContainer>
        );

      // STEP 4: Second Comparison
      case 4: {
        const pair = fixedPairs[1];
        if (!pair) return <LoadingStep onSkip={goToNextStep} />;
        return (
          <View style={styles.comparisonContent}>
            <Text style={styles.promptText}>Which movie do you like more?</Text>
            <ComparisonStepSimple
              movieA={pair.movieA}
              movieB={pair.movieB}
              pairKey={pairKey}
              onSelectA={() => {
                handleComparison(pair.movieA.id, pair.movieB.id);
                setLastChoice('A');
                goToNextStep();
              }}
              onSelectB={() => {
                handleComparison(pair.movieB.id, pair.movieA.id);
                setLastChoice('B');
                goToNextStep();
              }}
            />
          </View>
        );
      }

      // STEP 5: Transition after second comparison
      case 5:
        return (
          <StepContainer>
            <Text style={styles.celebrationText}>Sometimes it's hard to pick!</Text>
            <CatMascot pose={lastChoice === 'B' ? 'right' : 'left'} size={220} />
            <Text style={styles.subText}>3 more quick ones!</Text>
            <ContinueButton onPress={goToNextStep} />
          </StepContainer>
        );

      // STEPS 6-8: Three more comparisons
      case 6:
      case 7:
      case 8: {
        const pairIndex = step - 4; // 6->2, 7->3, 8->4
        const pair = fixedPairs[pairIndex];
        if (!pair) return <LoadingStep onSkip={goToNextStep} />;
        return (
          <View style={styles.comparisonContent}>
            <Text style={styles.promptText}>Which movie do you like more?</Text>
            <ComparisonStepSimple
              movieA={pair.movieA}
              movieB={pair.movieB}
              pairKey={pairKey}
              onSelectA={() => {
                handleComparison(pair.movieA.id, pair.movieB.id);
                goToNextStep();
              }}
              onSelectB={() => {
                handleComparison(pair.movieB.id, pair.movieA.id);
                goToNextStep();
              }}
            />
          </View>
        );
      }

      // STEP 9: Decade Selection
      case 9:
        return (
          <StepContainer>
            <Text style={styles.mainText}>Oh, and what decade were you born?</Text>
            <View style={styles.decadeGrid}>
              {DECADES.map(decade => (
                <Pressable
                  key={decade}
                  style={[styles.decadeButton, selectedDecade === decade && styles.decadeButtonSelected]}
                  onPress={() => handleDecadeSelect(decade)}
                >
                  <Text style={[styles.decadeButtonText, selectedDecade === decade && styles.decadeButtonTextSelected]}>
                    {decade}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ContinueButton onPress={handleDecadeContinue} disabled={!selectedDecade} />
          </StepContainer>
        );

      // STEP 10: Vibe - Tone (Light vs Heavy)
      case 10:
        return (
          <VibeStep
            key="vibe-tone"
            question="Which vibes do you tend to prefer?"
            optionA={{ key: 'light', label: 'Light', icon: 'light' }}
            optionB={{ key: 'heavy', label: 'Heavy', icon: 'heavy' }}
            onSelect={(val) => {
              setVibeSelections(prev => ({ ...prev, tone: val as 'light' | 'heavy' }));
              haptics.success();
              goToNextStep();
            }}
          />
        );

      // STEP 11: Vibe - Entertainment (Laughs vs Thrills)
      case 11:
        return (
          <VibeStep
            key="vibe-entertainment"
            question="Which vibes do you tend to prefer?"
            optionA={{ key: 'laughs', label: 'Laughs', icon: 'laughs' }}
            optionB={{ key: 'thrills', label: 'Thrills', icon: 'thrills' }}
            onSelect={(val) => {
              setVibeSelections(prev => ({ ...prev, entertainment: val as 'laughs' | 'thrills' }));
              haptics.success();
              goToNextStep();
            }}
          />
        );

      // STEP 12: Vibe - Pacing (Slow vs Fast)
      case 12:
        return (
          <VibeStep
            key="vibe-pacing"
            question="Which vibes do you tend to prefer?"
            optionA={{ key: 'slow', label: 'Slow burn', icon: 'slow' }}
            optionB={{ key: 'fast', label: 'Fast-paced', icon: 'fast' }}
            onSelect={(val) => {
              const updatedVibes = { ...vibeSelections, pacing: val as 'slow' | 'fast' };
              setVibeSelections(updatedVibes);
              setVibePreferences(updatedVibes);
              haptics.success();
              goToNextStep();
            }}
          />
        );

      // STEP 13: Progress Teaser
      case 13:
        return (
          <StepContainer>
            <Text style={styles.mainText}>Pretty soon we'll know your top movies</Text>
            <CatMascot pose="sat" size={220} />
            <Text style={styles.subText}>You can see your progress at the top</Text>
            <ContinueButton onPress={goToNextStep} />
          </StepContainer>
        );

      // STEP 14: Interleaved tailored comparisons (9 fresh + 7 tournament = 16 total)
      case 14: {
        // Wait for pairs to be generated
        if (personalizedPairs.length === 0) {
          return (
            <StepContainer>
              <Text style={styles.subText}>Loading your personalized picks...</Text>
            </StepContainer>
          );
        }

        // All comparisons done
        if (tailoredIndex >= TAILORED_TOTAL) {
          goToNextStep();
          return null;
        }

        const currentEntry = TAILORED_SEQUENCE[tailoredIndex];

        if (currentEntry === 'fresh') {
          // Fresh curated pair
          const freshPairIndex = TAILORED_SEQUENCE.slice(0, tailoredIndex).filter(x => x === 'fresh').length;
          const pair = personalizedPairs[freshPairIndex];

          if (!pair) {
            // Ran out of fresh pairs, advance
            setTailoredIndex(prev => prev + 1);
            return null;
          }

          return (
            <View style={styles.comparisonContent}>
              <Text style={styles.promptText}>Which movie do you like more?</Text>
              <ComparisonStepSimple
                movieA={pair.movieA}
                movieB={pair.movieB}
                pairKey={pairKey}
                onSelectA={() => {
                  handleComparison(pair.movieA.id, pair.movieB.id);
                  setTailoredIndex(prev => prev + 1);
                  setPairKey(prev => prev + 1);
                }}
                onSelectB={() => {
                  handleComparison(pair.movieB.id, pair.movieA.id);
                  setTailoredIndex(prev => prev + 1);
                  setPairKey(prev => prev + 1);
                }}
                canGoBack={tailoredIndex > 0}
                onGoBack={handleGoBackTailored}
                onSwipeAwayA={() => handleSwipeAwayPersonalizedWithConfirmation(freshPairIndex, 'A')}
                onSwipeAwayB={() => handleSwipeAwayPersonalizedWithConfirmation(freshPairIndex, 'B')}
                shouldConfirmSwipeAwayA={pair.movieA.totalComparisons > 0}
                shouldConfirmSwipeAwayB={pair.movieB.totalComparisons > 0}
                onUndoSwipe={handleUndoSwipePersonalized}
                showUndoButton={swipeHistory.some(s => s.pairIndex === freshPairIndex)}
              />
            </View>
          );
        } else {
          // Tournament match
          const matchIndex = currentEntry as number;

          if (tournamentMovies.length < 8) {
            return (
              <StepContainer>
                <Text style={styles.subText}>Preparing final rounds...</Text>
              </StepContainer>
            );
          }

          // QF: 0=1v8, 1=4v5, 2=2v7, 3=3v6 | SF: 4=QF0vQF1, 5=QF2vQF3 | F: 6=SF0vSF1
          let movieA: Movie, movieB: Movie;
          const qf = tournamentResults.qfWinners;
          const sf = tournamentResults.sfWinners;

          if (matchIndex === 0) { movieA = tournamentMovies[0]; movieB = tournamentMovies[7]; }
          else if (matchIndex === 1) { movieA = tournamentMovies[3]; movieB = tournamentMovies[4]; }
          else if (matchIndex === 2) { movieA = tournamentMovies[1]; movieB = tournamentMovies[6]; }
          else if (matchIndex === 3) { movieA = tournamentMovies[2]; movieB = tournamentMovies[5]; }
          else if (matchIndex === 4) { movieA = qf[0]; movieB = qf[1]; }
          else if (matchIndex === 5) { movieA = qf[2]; movieB = qf[3]; }
          else { movieA = sf[0]; movieB = sf[1]; }

          const handleTournamentSelect = (winner: Movie) => {
            recordComparison(winner.id, winner === movieA ? movieB.id : movieA.id);

            if (matchIndex < 4) {
              setTournamentResults(prev => ({
                ...prev,
                qfWinners: [...prev.qfWinners, winner],
              }));
            } else if (matchIndex < 6) {
              setTournamentResults(prev => ({
                ...prev,
                sfWinners: [...prev.sfWinners, winner],
              }));
            } else {
              setTournamentResults(prev => ({
                ...prev,
                champion: winner,
              }));
            }

            setPairKey(prev => prev + 1);
            setTailoredIndex(prev => prev + 1);
          };

          return (
            <View style={styles.comparisonContent}>
              <Text style={styles.promptText}>Which movie do you like more?</Text>
              <ComparisonStepSimple
                movieA={movieA}
                movieB={movieB}
                pairKey={pairKey}
                onSelectA={() => handleTournamentSelect(movieA)}
                onSelectB={() => handleTournamentSelect(movieB)}
                canGoBack={tailoredIndex > 0}
                onGoBack={handleGoBackTailored}
              />
            </View>
          );
        }
      }

      // STEP 15: Completion
      case 15:
        return (
          <StepContainer>
            <Text style={styles.celebrationText}>Nearly there!</Text>
            <CatMascot pose="arms" size={220} />
            <Text style={styles.subText}>Pick a couple movies you really love</Text>
            <ContinueButton onPress={goToNextStep} />
          </StepContainer>
        );

      // STEP 16: Pick up to 2 favorites from 4x4 grid
      case 16: {
        // Grid phase
        if (gridPhase === 'grid') {
          if (gridMovies.length === 0) {
            return (
              <StepContainer>
                <Text style={styles.subText}>Loading movies...</Text>
              </StepContainer>
            );
          }

          const selectedIds = new Set(gridSelections.map(m => m.id));

          return (
            <Animated.View key="grid" style={styles.fullContainer} entering={FadeIn.duration(300)}>
              <ScrollView contentContainerStyle={styles.scrollStepContent} bounces={false} showsVerticalScrollIndicator={false}>
                <Text style={styles.mainText}>Pick up to 2 favorites</Text>
                <Text style={styles.subTextSmall}>Which ones do you really love?</Text>

                <View style={styles.gridContainer4x4}>
                  {gridMovies.map((movie) => {
                    const isSelected = selectedIds.has(movie.id);
                    const posterUrl = movie.posterUrl || getPosterUrl(movie.posterPath || null);
                    return (
                      <Pressable
                        key={movie.id}
                        style={[styles.gridCell4x4, isSelected && styles.gridCellSelected]}
                        onPress={() => handleGridSelect(movie)}
                      >
                        {posterUrl ? (
                          <Image source={{ uri: posterUrl }} style={styles.gridPoster} resizeMode="cover" />
                        ) : (
                          <View style={[styles.gridPoster, { backgroundColor: movie.posterColor || colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={styles.top5FallbackText}>{movie.title.slice(0, 2).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.gridMovieTitle}>
                          <Text style={styles.gridMovieTitleText} numberOfLines={1}>{movie.title}</Text>
                        </View>
                        {isSelected && (
                          <View style={styles.gridCheckmark}>
                            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                              <Path d="M20 6L9 17l-5-5" stroke={colors.background} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                            </Svg>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <ContinueButton
                  onPress={handleGridContinue}
                  disabled={gridSelections.length === 0}
                />
              </ScrollView>
            </Animated.View>
          );
        }

        // Missing movie phase
        if (gridPhase === 'missing') {
          return (
            <StepContainer>
              <Text style={styles.mainText}>Was there a movie you were hoping would come up?</Text>
              <ContinueButton
                onPress={() => setGridPhase('search')}
                label="Search for it"
              />
              <Pressable onPress={handleFinishGridSelection} style={{ marginTop: spacing.lg }}>
                <Text style={styles.skipText}>No, continue</Text>
              </Pressable>
            </StepContainer>
          );
        }

        // Search phase
        if (gridPhase === 'search') {
          return (
            <StepContainer style={styles.favStepContainer}>
              <Text style={styles.mainText}>Search for your movie</Text>
              <View style={styles.favSearchPanel}>
                <View style={styles.favSearchInputRow}>
                  <TextInput
                    style={styles.favSearchInput}
                    placeholder="Search for a movie..."
                    placeholderTextColor={colors.textMuted}
                    value={favSearchQuery}
                    onChangeText={handleFavSearch}
                    autoFocus
                    returnKeyType="search"
                  />
                  <Pressable
                    style={styles.favSearchCancel}
                    onPress={() => {
                      handleFinishGridSelection();
                    }}
                  >
                    <Text style={styles.favSearchCancelText}>Cancel</Text>
                  </Pressable>
                </View>
                {favSearchLoading && (
                  <ActivityIndicator color={colors.accent} style={styles.favSearchSpinner} />
                )}
                <FlatList
                  data={favSearchResults}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  style={styles.favSearchList}
                  renderItem={({ item }) => {
                    const poster = item.poster_url || getPosterUrl(item.poster_path);
                    return (
                      <Pressable
                        style={styles.favSearchResult}
                        onPress={() => handleMissingMovieSelect(item)}
                      >
                        {poster ? (
                          <Image source={{ uri: poster }} style={styles.favSearchResultPoster} resizeMode="cover" />
                        ) : (
                          <View style={[styles.favSearchResultPoster, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={styles.top5FallbackText}>{item.title.slice(0, 2).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.favSearchResultInfo}>
                          <Text style={styles.favSearchResultTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.favSearchResultYear}>{item.year}</Text>
                        </View>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    !favSearchLoading && favSearchQuery.trim().length >= 2 ? (
                      <Text style={styles.favSearchEmpty}>No results found</Text>
                    ) : null
                  }
                />
              </View>
            </StepContainer>
          );
        }

        return null;
      }

      // STEP 17: Rank favorites — binary search comparisons, one at a time
      case 17: {
        const pickedFavs = favoriteMovies.filter(Boolean) as { id: string; title: string; year: number; posterUrl: string | null }[];
        if (pickedFavs.length === 0) {
          // No favorites to rank, skip ahead
          setStep(19);
          return null;
        }
        const currentFav = pickedFavs[favRankIndex];
        if (!currentFav) {
          goToNextStep();
          return null;
        }
        const currentFavStore = movies.get(currentFav.id);

        if (!favCurrentOpponent) {
          return (
            <StepContainer>
              <Text style={styles.subText}>Loading comparison...</Text>
            </StepContainer>
          );
        }

        const favMovieA: Movie = currentFavStore || {
          id: currentFav.id,
          title: currentFav.title,
          year: currentFav.year,
          posterUrl: currentFav.posterUrl || '',
          posterColor: '#1A1A1E',
          genres: [],
          beta: 0,
          totalWins: 0,
          totalLosses: 0,
          totalComparisons: 0,
          timesShown: 0,
          lastShownAt: 0,
          status: 'known' as const,
        };

        return (
          <View style={styles.comparisonContent}>
            <View style={styles.favRankHeader}>
              <Text style={styles.favRankHeaderTitle}>Ranking {currentFav.title}</Text>
              <Text style={styles.favRankHeaderProgress}>{favRankIndex + 1} of {pickedFavs.length}</Text>
            </View>
            <View style={styles.favProgressBar}>
              <View style={[styles.favProgressFill, { width: `${(favComparisonIndex / FAV_TOTAL_COMPARISONS) * 100}%` }]} />
            </View>
            <Text style={styles.promptText}>Which do you prefer?</Text>
            <ComparisonStepSimple
              movieA={favMovieA}
              movieB={favCurrentOpponent}
              pairKey={pairKey}
              onSelectA={() => handleFavChoice(true)}
              onSelectB={() => handleFavChoice(false)}
            />
          </View>
        );
      }

      // STEP 18: aaybee classic — 3x3 grid, top 3 revealed, rest locked
      case 18: {
        const classicMovies = getRankedMovies().slice(0, 9);
        const classicSlots = Array.from({ length: 9 }, (_, i) => classicMovies[i] || null);
        return (
          <Animated.View style={styles.fullContainer} entering={FadeIn.duration(300)}>
            <ScrollView contentContainerStyle={styles.scrollStepContent} bounces={false} showsVerticalScrollIndicator={false}>
              <CatMascot pose="arms" size={140} />
              <Text style={styles.classicTitle}>your aaybee classic</Text>

              <View style={styles.classicGrid}>
                {classicSlots.map((movie, i) => {
                  const isRevealed = i < 3 && movie;
                  return (
                    <View key={movie?.id ?? `locked-${i}`} style={styles.classicCell}>
                      {isRevealed ? (
                        <>
                          {movie!.posterUrl ? (
                            <Image source={{ uri: movie!.posterUrl }} style={styles.classicPoster} resizeMode="cover" />
                          ) : (
                            <View style={[styles.classicPoster, { backgroundColor: movie!.posterColor || colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                              <Text style={styles.top5FallbackText}>{movie!.title.slice(0, 2).toUpperCase()}</Text>
                            </View>
                          )}
                          <View style={styles.classicRankBadge}>
                            <Text style={styles.classicRankText}>{i + 1}</Text>
                          </View>
                          <View style={styles.classicTitleBar}>
                            <Text style={styles.classicTitleText} numberOfLines={1}>{movie!.title}</Text>
                          </View>
                        </>
                      ) : (
                        <View style={styles.classicLocked}>
                          <Text style={styles.classicLockedText}>{i + 1}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              <Text style={styles.classicHint}>keep ranking to reveal the rest</Text>
              <ContinueButton onPress={goToNextStep} />
            </ScrollView>
          </Animated.View>
        );
      }

      // STEP 19: Promise
      case 19:
        return (
          <StepContainer>
            <Text style={styles.mainText}>Your classic will keep evolving</Text>
            <CatMascot pose="arms" size={220} />
            <Text style={styles.subText}>The more you compare, the sharper your top 9 gets.</Text>
            <ContinueButton onPress={goToNextStep} />
          </StepContainer>
        );

      // STEP 20: Sign Up Flow
      case 20:
        return (
          <SignUpFlow
            onComplete={(skipped) => {
              // Complete onboarding regardless of sign up choice
              handleComplete();
            }}
            onBack={() => setStep(19)}
          />
        );

      default:
        handleComplete();
        return null;
    }
  };

  return (
    <CinematicBackground>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.appHeader}>
          <Text style={styles.headerLogo}>aaybee</Text>
          <Pressable style={styles.signInBadge} onPress={() => setShowSignIn(true)}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Circle cx="12" cy="8" r="4" stroke={colors.textMuted} strokeWidth={2} />
              <Path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </View>
        {step === 14 && (
          <View style={styles.progressContainer}>
            <OnboardingProgressBar
              progress={progress}
            />
          </View>
        )}
        <View style={styles.content}>
          {renderStep()}
        </View>
        <Confetti visible={showConfetti} onComplete={() => setShowConfetti(false)} />
        {showSignIn && (
          <View style={StyleSheet.absoluteFill}>
            <AuthScreen
              onClose={() => setShowSignIn(false)}
              initialMode="signin"
            />
          </View>
        )}
      </SafeAreaView>
    </CinematicBackground>
  );
}

// ============================================
// Reusable Components
// ============================================

function StepContainer({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <ScrollView contentContainerStyle={[styles.stepContainer, style]} bounces={false} showsVerticalScrollIndicator={false}>
      <Animated.View style={styles.stepContainerInner} entering={FadeIn.duration(300)}>
        {children}
      </Animated.View>
    </ScrollView>
  );
}

function ContinueButton({ onPress, label = 'Continue', disabled = false }: { onPress: () => void; label?: string; disabled?: boolean }) {
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        style={[styles.continueButton, disabled && styles.continueButtonDisabled]}
        onPress={() => { if (!disabled) { haptics.medium(); onPress(); } }}
        onPressIn={() => { if (!disabled) scale.value = withSpring(0.95); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        disabled={disabled}
      >
        <Text style={[styles.continueButtonText, disabled && styles.continueButtonTextDisabled]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function LoadingStep({ onSkip }: { onSkip: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onSkip, 100);
    return () => clearTimeout(timer);
  }, [onSkip]);
  return null;
}

function ComparisonStepSimple({
  movieA,
  movieB,
  pairKey,
  onSelectA,
  onSelectB,
  onGoBack,
  canGoBack = false,
  onSwipeAwayA,
  onSwipeAwayB,
  shouldConfirmSwipeAwayA,
  shouldConfirmSwipeAwayB,
  onUndoSwipe,
  showUndoButton = false,
}: {
  movieA: Movie;
  movieB: Movie;
  pairKey: number;
  onSelectA: () => void;
  onSelectB: () => void;
  onGoBack?: () => void;
  canGoBack?: boolean;
  onSwipeAwayA?: () => void;
  onSwipeAwayB?: () => void;
  shouldConfirmSwipeAwayA?: boolean;
  shouldConfirmSwipeAwayB?: boolean;
  onUndoSwipe?: () => void;
  showUndoButton?: boolean;
}) {
  const [selectionState, setSelectionState] = useState<'idle' | 'selected'>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const haptics = useHaptics();

  useEffect(() => {
    setSelectionState('idle');
    setWinnerId(null);
  }, [pairKey]);

  const handleSelect = (isA: boolean) => {
    if (selectionState !== 'idle') return;
    setSelectionState('selected');
    setWinnerId(isA ? movieA.id : movieB.id);
    haptics.success();
    setTimeout(() => {
      if (isA) onSelectA();
      else onSelectB();
    }, 400);
  };

  const handleSwipeA = () => {
    if (selectionState !== 'idle' || !onSwipeAwayA) return;
    haptics.light();
    onSwipeAwayA();
  };

  const handleSwipeB = () => {
    if (selectionState !== 'idle' || !onSwipeAwayB) return;
    haptics.light();
    onSwipeAwayB();
  };

  return (
    <>
      <View style={styles.cardsRow}>
        <CinematicCard
          movie={movieA}
          onSelect={() => handleSelect(true)}
          onSwipeAway={onSwipeAwayA ? handleSwipeA : undefined}
          shouldConfirmSwipeAway={shouldConfirmSwipeAwayA}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieA.id}
          isLoser={winnerId === movieB.id}
          label="A"
          labelColor="#E5A84B"
          position="left"
        />
        <CinematicCard
          movie={movieB}
          onSelect={() => handleSelect(false)}
          onSwipeAway={onSwipeAwayB ? handleSwipeB : undefined}
          shouldConfirmSwipeAway={shouldConfirmSwipeAwayB}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieB.id}
          isLoser={winnerId === movieA.id}
          label="B"
          position="right"
          labelColor="#4ABFED"
        />
      </View>
      <View style={styles.actionRowCentered}>
        {onGoBack && (
          <Pressable
            style={[styles.goBackButton, (!canGoBack || selectionState !== 'idle') && styles.buttonDisabled]}
            onPress={onGoBack}
            disabled={!canGoBack || selectionState !== 'idle'}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path
                d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                fill={(!canGoBack || selectionState !== 'idle') ? colors.border : colors.textMuted}
              />
            </Svg>
          </Pressable>
        )}
        {onUndoSwipe && (
          <Pressable
            style={[styles.undoSwipeButton, (!showUndoButton || selectionState !== 'idle') && styles.buttonDisabled]}
            onPress={onUndoSwipe}
            disabled={!showUndoButton || selectionState !== 'idle'}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
                fill={(!showUndoButton || selectionState !== 'idle') ? colors.border : colors.textMuted}
              />
            </Svg>
          </Pressable>
        )}
      </View>
    </>
  );
}

function ComparisonStep({
  movieA,
  movieB,
  pairKey,
  onSelectA,
  onSelectB,
}: {
  movieA: Movie;
  movieB: Movie;
  pairKey: number;
  onSelectA: () => void;
  onSelectB: () => void;
}) {
  const [selectionState, setSelectionState] = useState<'idle' | 'selected'>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const haptics = useHaptics();

  useEffect(() => {
    setSelectionState('idle');
    setWinnerId(null);
  }, [pairKey]);

  const handleSelect = (isA: boolean) => {
    if (selectionState !== 'idle') return;
    setSelectionState('selected');
    setWinnerId(isA ? movieA.id : movieB.id);
    haptics.success();
    setTimeout(() => {
      if (isA) onSelectA();
      else onSelectB();
    }, 400);
  };

  return (
    <View style={styles.comparisonContainer}>
      <View style={styles.cardsRow}>
        <CinematicCard
          movie={movieA}
          onSelect={() => handleSelect(true)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieA.id}
          isLoser={winnerId === movieB.id}
        />
        <CinematicCard
          movie={movieB}
          onSelect={() => handleSelect(false)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieB.id}
          isLoser={winnerId === movieA.id}
        />
      </View>
      <View style={styles.buttonRow}>
        <Pressable style={styles.choiceButton} onPress={() => handleSelect(true)} disabled={selectionState !== 'idle'}>
          <Text style={styles.choiceButtonText}>A</Text>
        </Pressable>
        <Pressable style={styles.choiceButton} onPress={() => handleSelect(false)} disabled={selectionState !== 'idle'}>
          <Text style={styles.choiceButtonText}>B</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ComparisonStepWithCat({
  prompt,
  movieA,
  movieB,
  pairKey,
  onSelectA,
  onSelectB,
  catPose,
  showHeader = false,
  showLabels = false,
}: {
  prompt: string;
  movieA: Movie;
  movieB: Movie;
  pairKey: number;
  onSelectA: () => void;
  onSelectB: () => void;
  catPose: CatPose;
  showHeader?: boolean;
  showLabels?: boolean;
}) {
  const [selectionState, setSelectionState] = useState<'idle' | 'selected'>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const haptics = useHaptics();

  useEffect(() => {
    setSelectionState('idle');
    setWinnerId(null);
  }, [pairKey]);

  const handleSelect = (isA: boolean) => {
    if (selectionState !== 'idle') return;
    setSelectionState('selected');
    setWinnerId(isA ? movieA.id : movieB.id);
    haptics.success();
    setTimeout(() => {
      if (isA) onSelectA();
      else onSelectB();
    }, 400);
  };

  return (
    <View style={styles.comparisonContainerWithCat}>
      {showHeader && (
        <View style={styles.onboardingHeader}>
          <Text style={styles.headerLogo}>aaybee</Text>
        </View>
      )}
      <Text style={styles.promptText}>{prompt}</Text>
      <View style={styles.cardsRow}>
        <CinematicCard
          movie={movieA}
          onSelect={() => handleSelect(true)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieA.id}
          isLoser={winnerId === movieB.id}
          label={showLabels ? "A" : undefined}
        />
        <CinematicCard
          movie={movieB}
          onSelect={() => handleSelect(false)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieB.id}
          isLoser={winnerId === movieA.id}
          label={showLabels ? "B" : undefined}
          labelColor={showLabels ? "#4ABFED" : undefined}
        />
      </View>
      {showLabels ? (
        <View style={styles.buttonRow}>
          <Pressable style={styles.choiceButton} onPress={() => handleSelect(true)} disabled={selectionState !== 'idle'}>
            <Text style={styles.choiceButtonText}>A</Text>
          </Pressable>
          <Pressable style={[styles.choiceButton, styles.choiceButtonB]} onPress={() => handleSelect(false)} disabled={selectionState !== 'idle'}>
            <Text style={styles.choiceButtonText}>B</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <Pressable style={styles.choiceButton} onPress={() => handleSelect(true)} disabled={selectionState !== 'idle'}>
            <Text style={styles.choiceButtonText}>A</Text>
          </Pressable>
          <Pressable style={styles.choiceButton} onPress={() => handleSelect(false)} disabled={selectionState !== 'idle'}>
            <Text style={styles.choiceButtonText}>B</Text>
          </Pressable>
        </View>
      )}
      <CatMascot pose={catPose} size={220} />
    </View>
  );
}

function ComparisonStepWithMessage({
  topText,
  subText,
  movieA,
  movieB,
  pairKey,
  onSelectA,
  onSelectB,
  catPose,
}: {
  topText: string;
  subText: string;
  movieA: Movie;
  movieB: Movie;
  pairKey: number;
  onSelectA: () => void;
  onSelectB: () => void;
  catPose: CatPose;
}) {
  const [selectionState, setSelectionState] = useState<'idle' | 'selected'>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const haptics = useHaptics();

  useEffect(() => {
    setSelectionState('idle');
    setWinnerId(null);
  }, [pairKey]);

  const handleSelect = (isA: boolean) => {
    if (selectionState !== 'idle') return;
    setSelectionState('selected');
    setWinnerId(isA ? movieA.id : movieB.id);
    haptics.success();
    setTimeout(() => {
      if (isA) onSelectA();
      else onSelectB();
    }, 400);
  };

  return (
    <View style={styles.comparisonContainerWithCat}>
      <Text style={styles.celebrationText}>{topText}</Text>
      <Text style={styles.subTextSmall}>{subText}</Text>
      <View style={styles.cardsRow}>
        <CinematicCard
          movie={movieA}
          onSelect={() => handleSelect(true)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieA.id}
          isLoser={winnerId === movieB.id}
        />
        <CinematicCard
          movie={movieB}
          onSelect={() => handleSelect(false)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieB.id}
          isLoser={winnerId === movieA.id}
        />
      </View>
      <View style={styles.buttonRow}>
        <Pressable style={styles.choiceButton} onPress={() => handleSelect(true)} disabled={selectionState !== 'idle'}>
          <Text style={styles.choiceButtonText}>A</Text>
        </Pressable>
        <Pressable style={styles.choiceButton} onPress={() => handleSelect(false)} disabled={selectionState !== 'idle'}>
          <Text style={styles.choiceButtonText}>B</Text>
        </Pressable>
      </View>
      <CatMascot pose={catPose} size={220} />
    </View>
  );
}

type VibeIconType = 'light' | 'heavy' | 'laughs' | 'thrills' | 'slow' | 'fast';

function VibeIcon({ type, size = 48, color }: { type: VibeIconType; size?: number; color: string }) {
  const strokeWidth = 2;

  switch (type) {
    case 'light':
      // Sun icon
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'heavy':
      // Cloud with rain
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M18 10a4 4 0 00-8 0 3 3 0 100 6h8a3 3 0 100-6z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M8 18v2M12 18v2M16 18v2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'laughs':
      // Smiley face
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Circle cx="9" cy="10" r="1" fill={color} />
          <Circle cx="15" cy="10" r="1" fill={color} />
        </Svg>
      );
    case 'thrills':
      // Lightning bolt
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'slow':
      // Feather/leaf - gentle
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5l6.74-6.76z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M16 8L2 22M17.5 15H9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'fast':
      // Rocket
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    default:
      return null;
  }
}

const VIBE_COLOR_A = '#E5A84B'; // Orange/amber (hardcoded to preserve across themes)
const VIBE_COLOR_B = '#4ABFED'; // Blue

function VibeStep({
  question,
  optionA,
  optionB,
  onSelect,
}: {
  question: string;
  optionA: { key: string; label: string; icon: VibeIconType };
  optionB: { key: string; label: string; icon: VibeIconType };
  onSelect: (val: string) => void;
}) {
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);
  const scaleA = useSharedValue(1);
  const scaleB = useSharedValue(1);
  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(1);

  const handleSelect = (choice: 'A' | 'B', key: string) => {
    if (selected) return;
    setSelected(choice);
    if (choice === 'A') {
      scaleA.value = withSpring(1.05, { damping: 12, stiffness: 150 });
      scaleB.value = withTiming(0.92, { duration: 300 });
      opacityB.value = withTiming(0.4, { duration: 300 });
    } else {
      scaleB.value = withSpring(1.05, { damping: 12, stiffness: 150 });
      scaleA.value = withTiming(0.92, { duration: 300 });
      opacityA.value = withTiming(0.4, { duration: 300 });
    }
    setTimeout(() => onSelect(key), 400);
  };

  const animStyleA = useAnimatedStyle(() => ({
    transform: [{ scale: scaleA.value }],
    opacity: opacityA.value,
  }));
  const animStyleB = useAnimatedStyle(() => ({
    transform: [{ scale: scaleB.value }],
    opacity: opacityB.value,
  }));

  const iconColorA = selected === 'A' ? VIBE_COLOR_A : colors.tabBarInactive;
  const iconColorB = selected === 'B' ? VIBE_COLOR_B : colors.tabBarInactive;

  return (
    <StepContainer>
      <Text style={styles.mainText}>{question}</Text>
      <View style={styles.vibeStepRow}>
        <Animated.View style={animStyleA}>
          <Pressable
            style={[styles.vibeStepCard, selected === 'A' && styles.vibeStepCardSelectedA]}
            onPress={() => handleSelect('A', optionA.key)}
            disabled={selected !== null}
          >
            <View style={[styles.vibeStepLabelBadge, { backgroundColor: VIBE_COLOR_A }]}>
              <Text style={styles.vibeStepLabelText}>A</Text>
            </View>
            <VibeIcon type={optionA.icon} size={64} color={iconColorA} />
            <Text style={[styles.vibeStepLabel, { color: iconColorA }]}>{optionA.label}</Text>
          </Pressable>
        </Animated.View>
        <Animated.View style={animStyleB}>
          <Pressable
            style={[styles.vibeStepCard, selected === 'B' && styles.vibeStepCardSelectedB]}
            onPress={() => handleSelect('B', optionB.key)}
            disabled={selected !== null}
          >
            <View style={[styles.vibeStepLabelBadge, { backgroundColor: VIBE_COLOR_B }]}>
              <Text style={styles.vibeStepLabelText}>B</Text>
            </View>
            <VibeIcon type={optionB.icon} size={64} color={iconColorB} />
            <Text style={[styles.vibeStepLabel, { color: iconColorB }]}>{optionB.label}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </StepContainer>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  fullContainer: {
    flex: 1,
  },
  progressContainer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  stepContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  stepContainerInner: {
    alignItems: 'center',
    width: '100%',
  },
  scrollStepContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  deepLinkBanner: {
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  deepLinkBannerText: {
    ...typography.captionMedium,
    color: colors.accent,
    textAlign: 'center',
  },
  welcomeSubText: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  mainText: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  subText: {
    ...typography.h3,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  subTextSmall: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  promptText: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  celebrationText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  continueButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl + spacing.lg,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
  },
  continueButtonDisabled: {
    backgroundColor: colors.surface,
  },
  continueButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  continueButtonTextDisabled: {
    color: colors.textMuted,
  },
  comparisonContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  comparisonContainerWithCat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  onboardingHeader: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  choiceButton: {
    width: 70,
    height: 44,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  choiceButtonB: {
    backgroundColor: '#4ABFED',
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.tabBarBorder,
  },
  signInBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLogo: {
    fontSize: 36,
    color: colors.textPrimary,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  comparisonContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  actionRowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
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
  choiceButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.background,
  },
  decadeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xl,
    maxWidth: 320,
  },
  decadeButton: {
    width: 56,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  decadeButtonSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  decadeButtonText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  decadeButtonTextSelected: {
    color: colors.background,
    fontWeight: '600',
  },
  vibeStepRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  vibeStepCard: {
    width: 140,
    height: 180,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  vibeStepCardSelectedA: {
    borderColor: colors.accent,
  },
  vibeStepCardSelectedB: {
    borderColor: '#4ABFED',
  },
  vibeStepLabelBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeStepLabelText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
  vibeStepLabel: {
    ...typography.h3,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  rankingList: {
    marginVertical: spacing.lg,
    alignItems: 'flex-start',
  },
  rankingItem: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginVertical: spacing.xs,
  },
  rankingItemEmpty: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    marginVertical: spacing.xs,
  },
  top5TopRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  top5BottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  top5LargePosterContainer: {
    position: 'relative',
    alignItems: 'center',
    width: 90,
  },
  top5SmallPosterContainer: {
    position: 'relative',
    alignItems: 'center',
    width: 80,
  },
  top5LargePoster: {
    width: 90,
    height: 135,
    borderRadius: borderRadius.md,
  },
  top5LargePosterFallback: {
    width: 90,
    height: 135,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  top5SmallPoster: {
    width: 72,
    height: 108,
    borderRadius: borderRadius.md,
  },
  top5SmallPosterFallback: {
    width: 72,
    height: 108,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  top5MovieTitle: {
    ...typography.tiny,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  top5FallbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMuted,
  },
  top5RankBadge: {
    position: 'absolute',
    top: -8,
    left: -8,
    backgroundColor: colors.accent,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  top5RankText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },

  // Classic 3x3 grid styles
  classicTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  classicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    maxWidth: 260,
    alignSelf: 'center',
  },
  classicCell: {
    width: 80,
    height: 120,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  classicPoster: {
    width: '100%',
    height: '100%',
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
  classicRankBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.accent,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  classicRankText: {
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
    ...typography.tiny,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  classicHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },

  // Favorites flow styles
  favStepContainer: {
    paddingHorizontal: spacing.lg,
  },
  // Grid selection styles
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    maxWidth: 340,
    alignSelf: 'center',
  },
  gridCell: {
    width: 100,
    height: 149,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gridCellSelected: {
    borderColor: colors.accent,
  },
  gridPoster: {
    width: '100%',
    height: '100%',
  },
  gridMovieTitle: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  gridMovieTitleText: {
    ...typography.tiny,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  gridContainer4x4: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    maxWidth: 340,
    alignSelf: 'center',
  },
  gridCell4x4: {
    width: 76,
    height: 114,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gridCheckmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  // Favorites search panel
  favSearchPanel: {
    flex: 1,
    width: '100%',
    marginTop: spacing.md,
  },
  favSearchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  favSearchInput: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  favSearchCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  favSearchCancelText: {
    ...typography.caption,
    color: colors.accent,
  },
  favSearchSpinner: {
    marginVertical: spacing.md,
  },
  favSearchList: {
    flex: 1,
  },
  favSearchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  favSearchResultPoster: {
    width: 40,
    height: 60,
    borderRadius: borderRadius.sm,
  },
  favSearchResultInfo: {
    flex: 1,
  },
  favSearchResultTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  favSearchResultYear: {
    ...typography.caption,
    color: colors.textMuted,
  },
  favSearchEmpty: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  // Favorites ranking styles
  favRankHeader: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  favRankHeaderTitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  favRankHeaderProgress: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  favProgressBar: {
    width: '60%',
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    alignSelf: 'center',
  },
  favProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  favHighlightBadge: {
    backgroundColor: '#E5A84B',
  },
  favHighlightPoster: {
    borderWidth: 2,
    borderColor: '#E5A84B',
  },
});
