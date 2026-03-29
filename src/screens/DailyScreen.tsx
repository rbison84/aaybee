import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, Image, Share, ScrollView, Platform, TextInput } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';
import { useHaptics } from '../hooks/useHaptics';
import { Movie } from '../types';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { CinematicCard } from '../components/cinematic';
import { OnboardingProgressBar } from '../components/onboarding/OnboardingProgressBar';
import {
  getTodaysDailyCategory,
  getDailyNumber,
  DAILY_CATEGORIES,
} from '../data/dailyCategories';
import {
  dailyStreakService,
  DailyStreakData,
  DailyStep,
  DailySessionData,
  DailyCollectionEntry,
} from '../services/dailyStreakService';
import {
  createDailySwiss,
  recordDailyChoice,
  undoDailyChoice,
  computeFullRanking,
  computeDeviationGrid,
  computeHotTake,
  generateShareText,
  DailySwissState,
  DeviationCell,
} from '../utils/dailySwiss';
import { shareService } from '../services/shareService';
import { crewService, Crew, CrewMember, CrewDailyResult } from '../services/crewService';
import { useAuth } from '../contexts/AuthContext';

interface DailyScreenProps {
  onNavigateToCompare?: () => void;
}

// Simple event for debug reset to trigger data reload
let _dailyRefreshListeners: Array<() => void> = [];
export function triggerDailyRefresh() {
  _dailyRefreshListeners.forEach(fn => fn());
}

export function DailyScreen({ onNavigateToCompare }: DailyScreenProps) {
  // Crew navigation
  const [crewView, setCrewView] = useState<'home' | 'detail'>('home');
  const [selectedCrew, setSelectedCrew] = useState<Crew | null>(null);
  const [crewDetailTab, setCrewDetailTab] = useState<'today' | 'collection'>('today');
  const [crewCollections, setCrewCollections] = useState<number[]>([]);

  // Today sub-state
  const [step, setStep] = useState<DailyStep>('intro');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [swissState, setSwissState] = useState<DailySwissState | null>(null);
  const [seenSelection, setSeenSelection] = useState<Set<string>>(new Set());
  const [fullRanking, setFullRanking] = useState<string[] | null>(null);
  const startedRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for debug reset
  useEffect(() => {
    const listener = () => {
      setRefreshKey(k => k + 1);
      setStep('intro');
      setActiveCategoryId(null);
      setSwissState(null);
      setSeenSelection(new Set());
      setFullRanking(null);
    };
    _dailyRefreshListeners.push(listener);
    return () => {
      _dailyRefreshListeners = _dailyRefreshListeners.filter(fn => fn !== listener);
    };
  }, []);

  // Data
  const [streakData, setStreakData] = useState<DailyStreakData | null>(null);
  const [completedCategoryIds, setCompletedCategoryIds] = useState<string[]>([]);
  const [collections, setCollections] = useState<DailyCollectionEntry[]>([]);

  const { movies, recordComparison, undoLastComparison } = useAppStore();
  const haptics = useHaptics();
  const { user } = useAuth();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewResults, setCrewResults] = useState<Map<string, CrewDailyResult>>(new Map());
  const [crewMembers, setCrewMembers] = useState<Map<string, CrewMember[]>>(new Map());
  const [crewCreateMode, setCrewCreateMode] = useState(false);
  const [crewJoinMode, setCrewJoinMode] = useState(false);
  const [crewName, setCrewName] = useState('');
  const [crewJoinCode, setCrewJoinCode] = useState('');
  const [crewLoading, setCrewLoading] = useState(false);
  const [crewError, setCrewError] = useState<string | null>(null);

  const dailyNumber = useMemo(() => getDailyNumber(), []);
  const featuredCategory = useMemo(() => getTodaysDailyCategory(), []);

  const activeCategory = useMemo(() => {
    if (!activeCategoryId) return null;
    return DAILY_CATEGORIES.find(c => c.id === activeCategoryId) || null;
  }, [activeCategoryId]);

  // Load/reload data whenever we're back at the intro with no active category
  useEffect(() => {
    if (step !== 'intro' || activeCategoryId) return;
    const init = async () => {
      const streak = await dailyStreakService.getStreakData();
      setStreakData(streak);

      const completed = await dailyStreakService.getTodayCompletedCategories();
      setCompletedCategoryIds(completed);

      const cols = await dailyStreakService.getCollections();
      setCollections(cols);
    };
    init();
  }, [step, activeCategoryId, refreshKey]);

  // Load crews and members on mount
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const myCrews = await crewService.getMyCrews(user.id);
      setCrews(myCrews);
      for (const crew of myCrews) {
        const members = await crewService.getCrewMembers(crew.id, dailyNumber);
        setCrewMembers(prev => new Map(prev).set(crew.id, members));
      }
    })();
  }, [user?.id, dailyNumber]);

  // Filter category movieIds to only those present in the movies store
  const getAvailableMovieIds = useCallback((categoryId: string): string[] => {
    const category = DAILY_CATEGORIES.find(c => c.id === categoryId);
    if (!category) return [];
    return category.movieIds;
  }, [movies]);

  // Load crew collection (distinct daily numbers)
  const loadCrewCollection = useCallback(async (crewId: string) => {
    const numbers = await crewService.getCrewDailyNumbers(crewId);
    setCrewCollections(numbers);
  }, []);

  // Try to restore session when a category is activated
  useEffect(() => {
    if (!activeCategoryId) return;
    if (startedRef.current) {
      startedRef.current = false;
      return;
    }
    const restore = async () => {
      const session = await dailyStreakService.loadSession(activeCategoryId);
      if (session && session.dailyNumber === dailyNumber && session.step === 'playing' && session.swissState) {
        setSwissState(session.swissState);
        if (session.seenIds) {
          setSeenSelection(new Set(session.seenIds));
        }
        setStep('playing');
      }
    };
    restore();
  }, [activeCategoryId, dailyNumber]);

  // Save session on each state change during play
  useEffect(() => {
    if (step !== 'playing' || !activeCategoryId || !swissState) return;
    const session: DailySessionData = {
      dailyNumber,
      categoryId: activeCategoryId,
      step,
      tournamentState: null,
      swissState,
      seenIds: Array.from(seenSelection),
    };
    dailyStreakService.saveSession(session);
  }, [step, swissState, activeCategoryId, dailyNumber, seenSelection]);

  // Start playing a category (transition from intro → playing)
  const startCategory = useCallback((categoryId: string) => {
    const available = getAvailableMovieIds(categoryId);
    console.log('[Daily] startCategory', categoryId, 'available:', available.length);

    // Initialize seen selection: all movies selected by default (deselect mode)
    startedRef.current = true;
    setActiveCategoryId(categoryId);
    setSeenSelection(new Set(available));
    setSwissState(null);
    setFullRanking(null);
    setStep('intro');
  }, [getAvailableMovieIds]);

  // Begin ranking after seen selection
  const beginRanking = useCallback(() => {
    if (!activeCategoryId) return;
    const available = getAvailableMovieIds(activeCategoryId);
    const seenIds = Array.from(seenSelection).filter(id => available.includes(id));

    if (seenIds.length < 3) return;

    try {
      const swiss = createDailySwiss(available, seenIds);
      setSwissState(swiss);
      setStep('playing');
    } catch (e) {
      console.error('[Daily] Failed to create Swiss state:', e);
    }
  }, [activeCategoryId, seenSelection, getAvailableMovieIds]);

  // Finish category
  const finishCategory = useCallback(async (ranking: string[], seenIds: string[]) => {
    if (!activeCategoryId || !activeCategory) return;

    setStep('results');
    setFullRanking(ranking);

    const globalRanking = activeCategory.movieIds;
    const grid = computeDeviationGrid(ranking, globalRanking, seenIds);
    // Compute match percent for collection entry (cells within ±2 positions = amber)
    const seenCells = grid.filter(c => c.color !== 'gray');
    const agreeCount = seenCells.filter(c => c.color === 'amber').length;
    const matchPercent = seenCells.length > 0 ? Math.round((agreeCount / seenCells.length) * 100) : 0;

    // Champion = user's #1 seen movie (first seen movie in ranking)
    const seenSet = new Set(seenIds);
    const championId = ranking.find(id => seenSet.has(id)) || ranking[0];

    const entry: DailyCollectionEntry = {
      categoryId: activeCategoryId,
      championId,
      dailyNumber,
      completedDate: new Date().toISOString().split('T')[0],
      userRanking: ranking,
      globalMatchPercent: matchPercent,
      seenCount: seenIds.length,
    };

    await dailyStreakService.addCollectionEntry(entry);
    await dailyStreakService.clearSession(activeCategoryId);
    const updatedStreak = await dailyStreakService.completeToday();
    setStreakData(updatedStreak);

    const updatedCompleted = await dailyStreakService.getTodayCompletedCategories();
    setCompletedCategoryIds(updatedCompleted);

    const updatedCollections = await dailyStreakService.getCollections();
    setCollections(updatedCollections);

    // Submit to crews
    if (user?.id && crews.length > 0 && ranking) {
      for (const crew of crews) {
        crewService.submitDailyPick(crew.id, user.id, dailyNumber, ranking);
        // Load results
        crewService.getCrewDailyResults(crew.id, dailyNumber).then(result => {
          if (result) {
            setCrewResults(prev => new Map(prev).set(crew.id, result));
          }
        });
        crewService.getCrewMembers(crew.id, dailyNumber).then(members => {
          setCrewMembers(prev => new Map(prev).set(crew.id, members));
        });
      }
    }
  }, [activeCategoryId, activeCategory, dailyNumber, user?.id, crews]);

  // Handle comparison selection
  const handleSelect = useCallback((winnerId: string, loserId: string) => {
    if (!swissState) return;
    recordComparison(winnerId, loserId);
    haptics.success();

    const newState = recordDailyChoice(swissState, winnerId);
    setSwissState(newState);

    if (newState.isComplete) {
      const ranking = computeFullRanking(newState);
      finishCategory(ranking, newState.seenIds);
    }
  }, [swissState, recordComparison, haptics, finishCategory]);

  // Handle go back during play
  const handleGoBack = useCallback(() => {
    if (!swissState) return;

    if (swissState.comparisons.length <= 0) {
      // Go back to intro (seen selection)
      setStep('intro');
      setSwissState(null);
      return;
    }

    const undone = undoLastComparison();
    if (!undone) return;

    const newState = undoDailyChoice(swissState);
    setSwissState(newState);
  }, [swissState, undoLastComparison]);

  // Handle copy from results
  const handleShareResult = useCallback(async () => {
    if (!activeCategory || !fullRanking || !swissState) return;

    const globalRanking = activeCategory.movieIds;
    const grid = computeDeviationGrid(fullRanking, globalRanking, swissState.seenIds);

    const seenSet = new Set(swissState.seenIds);
    const seenInRanking = fullRanking.filter(id => seenSet.has(id));
    const topMovie = seenInRanking.length > 0 ? movies.get(seenInRanking[0]) : null;
    const lastMovie = seenInRanking.length > 1 ? movies.get(seenInRanking[seenInRanking.length - 1]) : null;

    // Blindspot: highest globally-ranked unseen movie
    const blindspotId = globalRanking.find(id => !seenSet.has(id));
    const blindspotMovie = blindspotId ? movies.get(blindspotId) : null;

    // Hot take
    const movieTitles = new Map<string, string>();
    for (const id of globalRanking) {
      const m = movies.get(id);
      if (m) movieTitles.set(id, m.title);
    }
    const hotTake = computeHotTake(grid, globalRanking, movieTitles);

    // Create a share code for OG-rich link
    const shareUrl = await shareService.createDailyShare(
      null, // no user ID needed
      dailyNumber,
      activeCategory.title,
      swissState.seenIds.length,
      topMovie?.title || '???',
      grid,
    );

    let shareText = generateShareText(
      dailyNumber,
      activeCategory.title,
      grid,
      swissState.seenIds.length,
      topMovie?.title || '???',
      lastMovie?.title || null,
      blindspotMovie?.title || null,
      hotTake,
      shareUrl,
    );

    // Add crew context if in crews
    if (crews.length > 0) {
      const firstCrew = crews[0];
      const result = crewResults.get(firstCrew.id);
      const myResult = result?.memberResults.find(m => m.userId === user?.id);
      if (myResult) {
        shareText = shareText.replace(
          shareUrl || 'https://aaybee.netlify.app/daily',
          `my crew "${firstCrew.name}": ${myResult.alignmentPercent}% aligned\n${shareUrl || 'https://aaybee.netlify.app/daily'}`
        );
      }
    }

    try {
      if (Platform.OS === 'web' && navigator?.share) {
        await navigator.share({ text: shareText });
      } else if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(shareText);
      } else {
        await Share.share({ message: shareText });
      }
      haptics.success();
    } catch (err) {
      // User cancelled share — not an error
      if ((err as any)?.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }, [activeCategory, fullRanking, swissState, dailyNumber, movies, haptics, crews, crewResults, user?.id]);

  // Back to intro from results
  const handleBackToIntro = useCallback(() => {
    setStep('intro');
    setActiveCategoryId(null);
    setSwissState(null);
    setSeenSelection(new Set());
    setFullRanking(null);
  }, []);

  // Toggle seen/unseen for a movie
  const toggleSeen = useCallback((movieId: string) => {
    setSeenSelection(prev => {
      const next = new Set(prev);
      if (next.has(movieId)) {
        next.delete(movieId);
      } else {
        next.add(movieId);
      }
      return next;
    });
    haptics.success();
  }, [haptics]);

  // ---- RENDER: INTRO (Seen/Unseen Selection) ----

  const renderIntro = () => {
    if (!activeCategoryId) return null;
    const category = activeCategory || featuredCategory;
    const categoryMovieIds = category.movieIds;
    const missing = categoryMovieIds.filter(id => !movies.has(id));
    if (missing.length > 0) console.log('[Daily] Missing movie IDs for', category.id, ':', missing.join(', '));
    const gridMovies = categoryMovieIds.slice(0, 9).map(id => movies.get(id) || { id, title: id, posterUrl: null } as any) as Movie[];
    const seenCount = Array.from(seenSelection).filter(id => categoryMovieIds.includes(id)).length;

    return (
      <ScrollView contentContainerStyle={styles.centerContainer}>
        <Animated.View style={styles.introInner} entering={FadeIn.duration(300)}>
          <Text style={styles.dailyLabel}>Daily #{dailyNumber}</Text>
          <Text style={styles.introTitle}>{category.title}</Text>

          {/* 3x3 poster grid */}
          <View style={styles.posterGrid}>
            {gridMovies.map((movie, i) => {
              const isSeen = seenSelection.has(movie.id);
              return (
                <Animated.View key={movie.id} style={styles.posterGridCell} entering={FadeInDown.delay(i * 50).duration(300)}>
                  <Pressable
                    onPress={() => toggleSeen(movie.id)}
                    style={styles.posterPressable}
                  >
                    {movie.posterUrl ? (
                      <Image
                        source={{ uri: movie.posterUrl }}
                        style={[
                          styles.posterGridImage,
                          !isSeen && styles.posterDimmed,
                        ]}
                      />
                    ) : (
                      <View style={styles.posterGridPlaceholder}>
                        <Text style={styles.posterGridPlaceholderText}>?</Text>
                      </View>
                    )}
                    {!isSeen && (
                      <View style={styles.posterGrayOverlay} />
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          <Text style={styles.introSubtitle}>Deselect movies you haven't seen</Text>
          <Text style={styles.seenCounter}>{seenCount} of {gridMovies.length} seen</Text>

          <Pressable
            style={[styles.startButton, seenCount < 3 && styles.startButtonDisabled]}
            onPress={seenCount >= 3 ? beginRanking : undefined}
            disabled={seenCount < 3}
          >
            <Text style={[styles.startButtonText, seenCount < 3 && styles.startButtonTextDisabled]}>
              Rank {seenCount} Movies
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    );
  };

  // ---- RENDER: CREWS HOME ----

  const renderCrewsHome = () => (
    <ScrollView style={styles.flexOne} contentContainerStyle={styles.homeContent}>
      {/* Title */}
      <Text style={styles.crewsTitle}>CREWS</Text>

      {/* Today's Daily - compact card */}
      <Animated.View entering={FadeInDown.delay(50)} style={styles.todayCard}>
        <View style={styles.todayInfo}>
          <Text style={styles.todayLabel}>Daily #{dailyNumber}</Text>
          <Text style={styles.todayCategory}>{featuredCategory.title}</Text>
        </View>
        <Pressable
          style={styles.playButton}
          onPress={() => {
            setActiveCategoryId(featuredCategory.id);
            // The existing useEffect will restore session or start fresh
          }}
        >
          <Text style={styles.playButtonText}>
            {completedCategoryIds.includes(featuredCategory.id) ? 'done' : 'play'}
          </Text>
        </Pressable>
      </Animated.View>

      {/* Crews List */}
      {crews.length > 0 && (
        <Animated.View entering={FadeInDown.delay(100)}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>your crews</Text>
            <Pressable onPress={() => setCrewCreateMode(!crewCreateMode && !crewJoinMode)} style={styles.subtleAction}>
              <Text style={styles.subtleActionText}>+</Text>
            </Pressable>
          </View>

          {crews.map(crew => {
            const members = crewMembers.get(crew.id) || [];
            const playedCount = members.filter(m => m.played_today).length;
            const allPlayed = playedCount === members.length && members.length > 0;
            return (
              <Pressable
                key={crew.id}
                style={styles.crewListCard}
                onPress={() => {
                  setSelectedCrew(crew);
                  setCrewView('detail');
                  setCrewDetailTab('today');
                  // Load crew results for today
                  crewService.getCrewDailyResults(crew.id, dailyNumber).then(result => {
                    if (result) setCrewResults(prev => new Map(prev).set(crew.id, result));
                  });
                  // Load collection (distinct daily numbers for this crew)
                  loadCrewCollection(crew.id);
                }}
              >
                <Text style={styles.crewListName}>{crew.name}</Text>
                <Text style={styles.crewListStatus}>{playedCount}/{members.length}</Text>
                <Text style={[styles.crewListAction, allPlayed && styles.crewListActionReady]}>
                  {allPlayed ? 'view' : 'waiting'}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      {/* Create/Join crew inline */}
      {crewCreateMode && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.crewInlineForm}>
          <TextInput style={styles.crewFormInput} placeholder="crew name" placeholderTextColor={colors.textMuted}
            value={crewName} onChangeText={setCrewName} maxLength={30} autoFocus />
          <View style={styles.crewFormButtons}>
            <Pressable style={[styles.crewFormButton, !crewName.trim() && { opacity: 0.4 }]}
              onPress={async () => {
                if (!user?.id || !crewName.trim()) return;
                setCrewLoading(true);
                const { crew, error } = await crewService.createCrew(user.id, crewName.trim());
                if (crew) { setCrews(prev => [...prev, crew]); setCrewName(''); setCrewCreateMode(false); }
                if (error) setCrewError(error);
                setCrewLoading(false);
              }} disabled={!crewName.trim() || crewLoading}>
              <Text style={styles.crewFormButtonText}>create</Text>
            </Pressable>
            <Pressable onPress={() => setCrewJoinMode(true)}>
              <Text style={styles.crewFormCancel}>join instead</Text>
            </Pressable>
            <Pressable onPress={() => { setCrewCreateMode(false); setCrewName(''); }}>
              <Text style={styles.crewFormCancel}>cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {crewJoinMode && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.crewInlineForm}>
          <TextInput style={styles.crewFormInput} placeholder="enter code" placeholderTextColor={colors.textMuted}
            value={crewJoinCode} onChangeText={t => setCrewJoinCode(t.toUpperCase())} maxLength={6} autoCapitalize="characters" autoFocus />
          <View style={styles.crewFormButtons}>
            <Pressable style={[styles.crewFormButton, crewJoinCode.length < 6 && { opacity: 0.4 }]}
              onPress={async () => {
                if (!user?.id || crewJoinCode.length < 6) return;
                setCrewLoading(true);
                const { crew, error } = await crewService.joinCrew(user.id, crewJoinCode);
                if (crew) { setCrews(prev => [...prev, crew]); setCrewJoinCode(''); setCrewJoinMode(false); setCrewCreateMode(false); }
                if (error) setCrewError(error);
                setCrewLoading(false);
              }} disabled={crewJoinCode.length < 6 || crewLoading}>
              <Text style={styles.crewFormButtonText}>join</Text>
            </Pressable>
            <Pressable onPress={() => { setCrewJoinMode(false); setCrewJoinCode(''); setCrewCreateMode(true); }}>
              <Text style={styles.crewFormCancel}>create instead</Text>
            </Pressable>
            <Pressable onPress={() => { setCrewJoinMode(false); setCrewCreateMode(false); setCrewJoinCode(''); }}>
              <Text style={styles.crewFormCancel}>cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {crewError && <Text style={styles.crewErrorText}>{crewError}</Text>}

      {/* Whisper prompt for no crews */}
      {user?.id && crews.length === 0 && !crewCreateMode && !crewJoinMode && (
        <Pressable onPress={() => setCrewCreateMode(true)}>
          <Text style={styles.crewWhisper}>play daily with friends +</Text>
        </Pressable>
      )}

      {/* Streak */}
      {streakData && streakData.currentStreak > 0 && (
        <Animated.View entering={FadeInDown.delay(150)} style={styles.streakRow}>
          <Text style={styles.streakText}>{streakData.currentStreak} day streak</Text>
        </Animated.View>
      )}
    </ScrollView>
  );

  // ---- RENDER: CREW DETAIL ----

  const renderCrewDetail = () => {
    if (!selectedCrew) return null;
    const members = crewMembers.get(selectedCrew.id) || [];
    const result = crewResults.get(selectedCrew.id);

    return (
      <View style={styles.flexOne}>
        {/* Back button + crew name */}
        <View style={styles.crewDetailHeader}>
          <Pressable onPress={() => { setCrewView('home'); setSelectedCrew(null); }} style={styles.backButton}>
            <Text style={styles.backText}>{'\u2039'} back</Text>
          </Pressable>
        </View>

        <View style={styles.crewDetailTitleRow}>
          <Text style={styles.crewDetailName}>{selectedCrew.name.toUpperCase()}</Text>
          <Pressable
            onPress={async () => {
              const msg = `join my crew "${selectedCrew.name}" on aaybee! code: ${selectedCrew.code}`;
              if (Platform.OS === 'web' && navigator?.clipboard) {
                await navigator.clipboard.writeText(msg);
              } else {
                await Share.share({ message: msg });
              }
            }}
            style={styles.subtleAction}
          >
            <Text style={styles.subtleActionText}>+</Text>
          </Pressable>
        </View>

        {/* Today / Collection tabs */}
        <View style={styles.crewTabs}>
          <Pressable onPress={() => setCrewDetailTab('today')} style={styles.crewTab}>
            <Text style={[styles.crewTabText, crewDetailTab === 'today' && styles.crewTabActive]}>Today</Text>
            {crewDetailTab === 'today' && <View style={styles.crewTabIndicator} />}
          </Pressable>
          <Pressable onPress={() => setCrewDetailTab('collection')} style={styles.crewTab}>
            <Text style={[styles.crewTabText, crewDetailTab === 'collection' && styles.crewTabActive]}>Collection</Text>
            {crewDetailTab === 'collection' && <View style={styles.crewTabIndicator} />}
          </Pressable>
        </View>

        {crewDetailTab === 'today' ? (
          <ScrollView style={styles.flexOne} contentContainerStyle={styles.crewDetailContent}>
            <Text style={styles.crewDailyLabel}>Daily #{dailyNumber} {'\u00B7'} {featuredCategory.title}</Text>

            {result && result.memberResults.length > 0 ? (
              result.memberResults
                .sort((a, b) => b.alignmentPercent - a.alignmentPercent)
                .map((member, i) => (
                  <View key={member.userId} style={styles.memberRankRow}>
                    <Text style={styles.memberRankPosition}>#{i + 1}</Text>
                    <Text style={styles.memberRankName}>
                      {member.userId === user?.id ? 'You' : member.displayName}
                    </Text>
                    <Text style={styles.memberRankPercent}>{member.alignmentPercent}%</Text>
                  </View>
                ))
            ) : (
              <View style={styles.emptyCrewState}>
                {members.filter(m => m.played_today).length === 0 ? (
                  <Text style={styles.emptyCrewText}>no one has played today yet</Text>
                ) : members.filter(m => m.played_today).length < 2 ? (
                  <Text style={styles.emptyCrewText}>waiting for more members to play...</Text>
                ) : (
                  <Text style={styles.emptyCrewText}>play today's daily to see crew results</Text>
                )}
              </View>
            )}

            {/* Members list */}
            <View style={styles.memberListSection}>
              <Text style={styles.sectionLabel}>members</Text>
              {members.map(m => (
                <View key={m.id} style={styles.memberRow}>
                  <Text style={styles.memberName}>{m.display_name}</Text>
                  <Text style={[styles.memberStatus, m.played_today && styles.memberPlayed]}>
                    {m.played_today ? 'played' : '\u2014'}
                  </Text>
                </View>
              ))}
            </View>

            {/* Crew code */}
            <View style={styles.crewCodeSection}>
              <Text style={styles.sectionLabel}>invite code</Text>
              <Text style={styles.crewCodeDisplay}>{selectedCrew.code}</Text>
            </View>

            {/* Leave */}
            <Pressable
              style={styles.leaveButton}
              onPress={async () => {
                if (!user?.id) return;
                await crewService.leaveCrew(user.id, selectedCrew.id);
                setCrews(prev => prev.filter(c => c.id !== selectedCrew.id));
                setCrewView('home');
                setSelectedCrew(null);
              }}
            >
              <Text style={styles.leaveText}>leave crew</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView style={styles.flexOne} contentContainerStyle={styles.crewDetailContent}>
            {crewCollections.length > 0 ? (
              crewCollections.map(num => {
                const catIndex = (num - 1) % DAILY_CATEGORIES.length;
                const cat = DAILY_CATEGORIES[catIndex];
                const hasPlayed = completedCategoryIds.includes(cat?.id || '');
                return (
                  <Pressable
                    key={num}
                    style={styles.collectionRow}
                    onPress={() => {
                      if (!hasPlayed && cat) {
                        setActiveCategoryId(cat.id);
                        setCrewView('home'); // go back to play flow
                      }
                    }}
                  >
                    <Text style={styles.collectionNumber}>#{num}</Text>
                    <Text style={styles.collectionCategory}>{cat?.title || 'Unknown'}</Text>
                    <Text style={[styles.collectionAction, hasPlayed && styles.collectionDone]}>
                      {hasPlayed ? 'view' : 'play'}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptyCrewText}>no dailies played yet</Text>
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  // ---- RENDER: PLAYING (Comparisons) ----

  const renderPlaying = () => {
    if (!activeCategory || !swissState || !swissState.currentPair) return null;

    const [idA, idB] = swissState.currentPair;
    const movieA = movies.get(idA);
    const movieB = movies.get(idB);
    if (!movieA || !movieB) return null;

    const progress = swissState.totalRequired > 0
      ? swissState.comparisons.length / swissState.totalRequired
      : 0;

    return (
      <ScrollView contentContainerStyle={styles.playingContainer}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryHeaderText}>{activeCategory.title}</Text>
        </View>
        <View style={styles.comparisonContent}>
          <Text style={styles.promptText}>Which do you prefer?</Text>
          <ComparisonPair
            movieA={movieA}
            movieB={movieB}
            pairKey={`${idA}-${idB}-${swissState.comparisons.length}`}
            onSelectA={() => handleSelect(movieA.id, movieB.id)}
            onSelectB={() => handleSelect(movieB.id, movieA.id)}
          />
          <View style={styles.goBackRow}>
            <Pressable style={styles.goBackButton} onPress={handleGoBack}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                  fill={colors.textMuted}
                />
              </Svg>
            </Pressable>
          </View>
        </View>
        <OnboardingProgressBar
          progress={progress}
          current={swissState.comparisons.length}
          total={swissState.totalRequired}
          label=""
        />
      </ScrollView>
    );
  };

  // ---- RENDER: RESULTS (3x3 Flip Grid) ----

  const renderResults = () => {
    if (!activeCategory || !fullRanking || !swissState) return null;

    const globalRanking = activeCategory.movieIds;
    const grid = computeDeviationGrid(fullRanking, globalRanking, swissState.seenIds);
    const currentStreak = streakData?.currentStreak || 0;

    const seenSet = new Set(swissState.seenIds);
    const seenInRanking = fullRanking.filter(id => seenSet.has(id));
    const topMovie = seenInRanking.length > 0 ? movies.get(seenInRanking[0]) : null;
    const bottomMovie = seenInRanking.length > 1 ? movies.get(seenInRanking[seenInRanking.length - 1]) : null;

    // Find blindspot: highest globally-ranked unseen movie
    const blindspotId = globalRanking.find(id => !seenSet.has(id));
    const blindspotMovie = blindspotId ? movies.get(blindspotId) : null;

    // Hot take
    const movieTitles = new Map<string, string>();
    for (const id of globalRanking) {
      const m = movies.get(id);
      if (m) movieTitles.set(id, m.title);
    }
    const hotTake = computeHotTake(grid, globalRanking, movieTitles);

    return (
      <ScrollView contentContainerStyle={styles.resultsScrollContent}>
        <Animated.View style={styles.resultsContainer} entering={FadeIn.duration(300)}>
          <Text style={styles.resultsTitle}>Aaybee Daily #{dailyNumber}</Text>
          <Text style={styles.resultsCategoryTitle}>{activeCategory.title}</Text>

          {/* 3x3 flip-reveal grid */}
          <View style={styles.resultsGrid}>
            {grid.map((cell, i) => (
              <FlipCard
                key={cell.movieId}
                movieId={cell.movieId}
                color={cell.color}
                index={i}
                movie={movies.get(cell.movieId)}
                userRank={cell.userRank}
              />
            ))}
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Rect x="3" y="8" width="18" height="12" rx="2" stroke={colors.textSecondary} strokeWidth={1.75} />
                  <Path d="M4 8L8 4h8l4 4" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M7 4l2 4M12 4l2 4" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinecap="round" />
                </Svg>
              </View>
              <Text style={styles.statLabel}>seen</Text>
              <Text style={styles.statValue}>{swissState.seenIds.length}/9</Text>
            </View>
            {topMovie && (
              <View style={styles.statRow}>
                <View style={styles.statIcon}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M6 9V6a6 6 0 0 1 12 0v3" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinecap="round" />
                    <Path d="M5 9h14l-1.5 10H6.5L5 9z" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinejoin="round" />
                    <Path d="M12 19v3M8 22h8" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinecap="round" />
                  </Svg>
                </View>
                <Text style={styles.statLabel}>#1</Text>
                <Text style={styles.statValue} numberOfLines={1}>{topMovie.title}</Text>
              </View>
            )}
            {bottomMovie && (
              <View style={styles.statRow}>
                <View style={styles.statIcon}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M4 4l16 16M20 4v8h-8" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
                <Text style={styles.statLabel}>last</Text>
                <Text style={styles.statValue} numberOfLines={1}>{bottomMovie.title}</Text>
              </View>
            )}
            {blindspotMovie && (
              <View style={styles.statRow}>
                <View style={styles.statIcon}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Circle cx="12" cy="12" r="8" stroke={colors.textSecondary} strokeWidth={1.75} />
                    <Circle cx="12" cy="12" r="3" stroke={colors.textSecondary} strokeWidth={1.75} />
                    <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinecap="round" />
                  </Svg>
                </View>
                <Text style={styles.statLabel}>blindspot</Text>
                <Text style={styles.statValue} numberOfLines={1}>{blindspotMovie.title}</Text>
              </View>
            )}
            {hotTake && (
              <View style={styles.statRow}>
                <View style={styles.statIcon}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" stroke={colors.textSecondary} strokeWidth={1.75} strokeLinejoin="round" />
                  </Svg>
                </View>
                <Text style={styles.statLabel}>hot take</Text>
                <Text style={styles.statValue} numberOfLines={1}>{hotTake}</Text>
              </View>
            )}
          </View>

          {/* World context — per movie comparison */}
          {fullRanking && activeCategory && (
            <View style={styles.worldStatsSection}>
              <Text style={styles.worldStatsTitle}>vs the world</Text>
              {fullRanking.map((movieId, idx) => {
                const globalPos = activeCategory.movieIds.indexOf(movieId);
                const movie = movies.get(movieId);
                if (!movie || globalPos === -1) return null;
                const diff = globalPos - idx;
                const agrees = diff === 0;
                const seenSet = new Set(swissState?.seenIds || []);
                if (!seenSet.has(movieId)) return null; // skip unseen
                return (
                  <View key={movieId} style={styles.worldStatRow}>
                    <Text style={styles.worldStatRank}>#{idx + 1}</Text>
                    <Text style={styles.worldStatMovie} numberOfLines={1}>{movie.title}</Text>
                    {agrees ? (
                      <Text style={[styles.worldStatLabel, styles.worldStatAgree]}>consensus</Text>
                    ) : (
                      <Text style={[styles.worldStatLabel, diff > 0 ? styles.worldStatAgree : styles.worldStatDisagree]}>
                        {diff > 0 ? `↑${diff} above` : `↓${Math.abs(diff)} below`}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {currentStreak > 0 && (
            <View style={styles.streakBadgeResults}>
              <View style={styles.streakBadgeContent}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" stroke={colors.accent} strokeWidth={1.75} strokeLinejoin="round" />
                  <Path d="M12 12c0 2-1.5 3-1.5 4.5a1.5 1.5 0 0 0 3 0c0-1.5-1.5-2.5-1.5-4.5z" stroke={colors.accent} strokeWidth={1.25} strokeLinejoin="round" />
                </Svg>
                <Text style={styles.streakBadgeText}>{currentStreak} day streak!</Text>
              </View>
            </View>
          )}

          <View style={styles.resultsButtons}>
            <Pressable style={styles.copyButton} onPress={handleShareResult}>
              <Text style={styles.copyButtonText}>Share My Result</Text>
            </Pressable>
            <Pressable style={styles.backToTodayButton} onPress={handleBackToIntro}>
              <Text style={styles.backToTodayText}>Back to Crews</Text>
            </Pressable>
          </View>

          {/* Crew Results */}
          {crews.length > 0 && (
            <View style={styles.crewResultsSection}>
              <Text style={styles.crewSectionTitle}>your crews</Text>
              {crews.map(crew => {
                const result = crewResults.get(crew.id);
                const members = crewMembers.get(crew.id) || [];
                const playedCount = members.filter(m => m.played_today).length;
                return (
                  <View key={crew.id} style={styles.crewCard}>
                    <Text style={styles.crewName}>{crew.name}</Text>
                    <Text style={styles.crewPlayCount}>{playedCount}/{members.length} played</Text>
                    {result ? (
                      <View style={styles.crewResultDetail}>
                        {result.hottestTaker && (
                          <Text style={styles.crewHotTake}>
                            {result.hottestTaker.displayName} ranked #{result.hottestTaker.userRank} what the crew ranked #{result.hottestTaker.consensusRank}
                          </Text>
                        )}
                        {result.mostMainstream && (
                          <Text style={styles.crewMainstream}>
                            {result.mostMainstream.displayName} — {result.mostMainstream.alignmentPercent}% aligned
                          </Text>
                        )}
                        {result.memberResults.find(m => m.userId === user?.id) && (
                          <Text style={styles.crewYourAlignment}>
                            you: {result.memberResults.find(m => m.userId === user?.id)?.alignmentPercent}% aligned with crew
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.crewWaiting}>waiting for more members to play...</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

        </Animated.View>
      </ScrollView>
    );
  };

  // ---- MAIN RENDER ----

  // If playing or viewing results, show the game flow
  if (step === 'playing') {
    return (
      <View style={styles.container}>
        {renderPlaying()}
      </View>
    );
  }

  if (step === 'results') {
    return (
      <View style={styles.container}>
        {renderResults()}
      </View>
    );
  }

  // If in seen/unseen selection mode (activeCategoryId set but step is intro)
  if (activeCategoryId) {
    return (
      <View style={styles.container}>
        {renderIntro()}
      </View>
    );
  }

  // If viewing crew detail
  if (crewView === 'detail' && selectedCrew) {
    return (
      <View style={styles.container}>
        {renderCrewDetail()}
      </View>
    );
  }

  // Crews home
  return (
    <View style={styles.container}>
      {renderCrewsHome()}
    </View>
  );
}

// ---- Comparison Pair Component ----

function ComparisonPair({
  movieA,
  movieB,
  pairKey,
  onSelectA,
  onSelectB,
}: {
  movieA: Movie;
  movieB: Movie;
  pairKey: string;
  onSelectA: () => void;
  onSelectB: () => void;
}) {
  const [selected, setSelected] = useState<'a' | 'b' | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [pairKey]);

  const handleSelect = (choice: 'a' | 'b') => {
    if (selected) return;
    setSelected(choice);
    setTimeout(() => {
      if (choice === 'a') onSelectA();
      else onSelectB();
    }, 300);
  };

  return (
    <View style={styles.cardsRow}>
      <CinematicCard
        movie={movieA}
        onSelect={() => handleSelect('a')}
        disabled={selected !== null}
        isWinner={selected === 'a'}
        isLoser={selected === 'b'}
      />
      <CinematicCard
        movie={movieB}
        onSelect={() => handleSelect('b')}
        disabled={selected !== null}
        isWinner={selected === 'b'}
        isLoser={selected === 'a'}
      />
    </View>
  );
}

// ---- Flip Card Component (for 3x3 results grid) ----

const BORDER_COLORS: Record<DeviationCell['color'], string> = {
  gray: '#6B7280',
  green: '#4ADE80',   // you ranked higher than consensus
  amber: '#FBBF24',   // you agree with consensus
  red: '#F87171',     // you ranked lower than consensus
};

function FlipCard({
  movieId,
  color,
  index,
  movie,
  userRank,
}: {
  movieId: string;
  color: DeviationCell['color'];
  index: number;
  movie: Movie | undefined;
  userRank: number | null;
}) {
  const flipProgress = useSharedValue(0);

  useEffect(() => {
    flipProgress.value = withDelay(
      index * 200,
      withTiming(1, { duration: 400 }),
    );
  }, [index]);

  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: flipProgress.value < 0.5 ? 1 : 0,
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
      opacity: flipProgress.value >= 0.5 ? 1 : 0,
    };
  });

  const borderColor = BORDER_COLORS[color];

  return (
    <View style={styles.flipCardContainer}>
      {/* Front (face-down) */}
      <Animated.View style={[styles.flipCardFace, frontStyle]}>
        <View style={[styles.flipCardBack, { borderColor: colors.border }]}>
          <Text style={styles.flipCardBackText}>?</Text>
        </View>
      </Animated.View>
      {/* Back (revealed) */}
      <Animated.View style={[styles.flipCardFace, styles.flipCardFaceAbsolute, backStyle]}>
        <View style={[styles.flipCardRevealed, { borderColor }]}>
          {movie?.posterUrl ? (
            <Image source={{ uri: movie.posterUrl }} style={styles.flipCardImage} />
          ) : (
            <View style={styles.flipCardPlaceholder}>
              <Text style={styles.flipCardPlaceholderText}>{movie?.title?.[0] || '?'}</Text>
            </View>
          )}
          {userRank !== null && (
            <View style={[styles.rankBadge, { backgroundColor: borderColor }]}>
              <Text style={styles.rankBadgeText}>{userRank}</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// ---- STYLES ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  flexOne: {
    flex: 1,
  },

  // Intro
  centerContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  introInner: {
    alignItems: 'center',
  },
  dailyLabel: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  introTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  posterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 5,
    marginBottom: spacing.md,
    maxWidth: 220,
  },
  posterGridCell: {
    width: 66,
    height: 99,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  posterPressable: {
    width: '100%',
    height: '100%',
  },
  posterGridImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  posterDimmed: {
    opacity: 0.4,
  },
  posterGrayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
    borderRadius: borderRadius.sm,
  },
  posterGridPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterGridPlaceholderText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  introSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  seenCounter: {
    ...typography.captionMedium,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  streakBadge: {
    backgroundColor: colors.accentSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    alignSelf: 'center',
  },
  streakBadgeAtRisk: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  streakBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  streakBadgeText: {
    ...typography.captionMedium,
    color: colors.accent,
  },
  startButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    width: '100%',
  },
  startButtonDisabled: {
    backgroundColor: colors.surface,
  },
  startButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  startButtonTextDisabled: {
    color: colors.textMuted,
  },
  completedBadge: {
    backgroundColor: colors.accentSubtle,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  completedBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  completedBadgeText: {
    ...typography.bodyMedium,
    color: colors.accent,
    fontWeight: '600',
  },

  // Playing
  playingContainer: {
    flexGrow: 1,
  },
  categoryHeader: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  categoryHeaderText: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  comparisonContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  promptText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  goBackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
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
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },

  // Results
  resultsScrollContent: {
    paddingBottom: spacing.xxl,
  },
  resultsContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  resultsTitle: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  resultsCategoryTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },

  // 3x3 flip grid
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.lg,
    maxWidth: 300,
  },
  flipCardContainer: {
    width: 90,
    height: 135,
  },
  flipCardFace: {
    width: '100%',
    height: '100%',
  },
  flipCardFaceAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  flipCardBack: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipCardBackText: {
    ...typography.h2,
    color: colors.textMuted,
  },
  flipCardRevealed: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
    borderWidth: 3,
    overflow: 'hidden',
  },
  flipCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md - 2,
  },
  flipCardPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipCardPlaceholderText: {
    ...typography.h2,
    color: colors.textMuted,
  },

  rankBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
  },
  statsContainer: {
    width: '100%',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    width: 80,
  },
  statValue: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  streakBadgeResults: {
    backgroundColor: colors.accentSubtle,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  resultsButtons: {
    width: '100%',
    gap: spacing.sm,
  },
  copyButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  copyButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  backToTodayButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  backToTodayText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },

  // Crews Home
  homeContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  crewsTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  todayInfo: {
    flex: 1,
  },
  todayLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  todayCategory: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginTop: 2,
  },
  playButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  playButtonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
  sectionLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  crewListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  crewListName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  crewListStatus: {
    ...typography.caption,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  crewListAction: {
    ...typography.caption,
    color: colors.textMuted,
  },
  crewListActionReady: {
    color: colors.accent,
  },
  streakRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  streakText: {
    ...typography.caption,
    color: colors.accent,
  },
  crewErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },

  // Crew Detail
  crewDetailHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backButton: {
    paddingVertical: spacing.sm,
  },
  backText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  crewDetailTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  crewDetailName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  crewTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  crewTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginRight: spacing.lg,
    position: 'relative',
  },
  crewTabText: {
    ...typography.captionMedium,
    color: colors.textMuted,
  },
  crewTabActive: {
    color: colors.textPrimary,
  },
  crewTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  crewDetailContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  crewDailyLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  memberRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  memberRankPosition: {
    ...typography.bodyMedium,
    color: colors.accent,
    width: 32,
  },
  memberRankName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  memberRankPercent: {
    ...typography.caption,
    color: colors.textMuted,
  },
  emptyCrewState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyCrewText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  memberListSection: {
    marginTop: spacing.xl,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  memberName: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  memberStatus: {
    ...typography.caption,
    color: colors.textMuted,
  },
  memberPlayed: {
    color: colors.success,
  },
  crewCodeSection: {
    marginTop: spacing.lg,
  },
  crewCodeDisplay: {
    ...typography.bodyMedium,
    color: colors.accent,
    letterSpacing: 3,
    marginTop: spacing.xs,
  },
  leaveButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
  },
  leaveText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  collectionNumber: {
    ...typography.caption,
    color: colors.textMuted,
    width: 40,
  },
  collectionCategory: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  collectionAction: {
    ...typography.caption,
    color: colors.accent,
  },
  collectionDone: {
    color: colors.textMuted,
  },

  // Crew Results (in results view)
  crewResultsSection: {
    width: '100%',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subtleAction: {
    padding: spacing.xs,
  },
  subtleActionText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 13,
  },
  crewWhisper: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  crewInlineForm: { marginTop: spacing.sm },
  crewFormInput: {
    ...typography.body, color: colors.textPrimary, backgroundColor: colors.card,
    borderRadius: borderRadius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  crewFormButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  crewFormButton: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent, borderRadius: borderRadius.md,
  },
  crewFormButtonText: { ...typography.caption, color: colors.background, fontWeight: '700' },
  crewFormCancel: { ...typography.caption, color: colors.textMuted },
  crewSectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    fontSize: 11,
  },
  crewCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  crewName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  crewPlayCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  crewResultDetail: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  crewHotTake: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  crewMainstream: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  crewYourAlignment: {
    ...typography.captionMedium,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  crewWaiting: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic' as const,
  },

  // World stats
  worldStatsSection: {
    width: '100%',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  worldStatsTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  worldStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  worldStatRank: {
    ...typography.bodyMedium,
    color: colors.accent,
    width: 32,
    fontWeight: '700',
  },
  worldStatMovie: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  worldStatLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  worldStatAgree: {
    color: colors.accent,
  },
  worldStatDisagree: {
    color: colors.textSecondary,
  },
});
