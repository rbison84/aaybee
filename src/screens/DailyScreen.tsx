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
import ViewShot from 'react-native-view-shot';
import { useAppStore } from '../store/useAppStore';
import { useHaptics } from '../hooks/useHaptics';
import { Movie } from '../types';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { CinematicCard } from '../components/cinematic';
import { OnboardingProgressBar } from '../components/onboarding/OnboardingProgressBar';
import { UnderlineTabs } from '../components/UnderlineTabs';
import { ShareableCollectionsGrid } from '../components/ShareableImages';
import {
  getTodaysDailyCategory,
  getDailyNumber,
  DAILY_CATEGORIES,
  DailyCategory,
} from '../data/dailyCategories';
import {
  dailyStreakService,
  DailyStreakData,
  DailyStep,
  DailySessionData,
  DailyCollectionEntry,
} from '../services/dailyStreakService';
import { CategoryCellEmpty } from '../components/daily/CategoryCellEmpty';
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

type DailyTab = 'today' | 'collection';

interface DailyScreenProps {
  onNavigateToCompare?: () => void;
}

// Simple event for debug reset to trigger data reload
let _dailyRefreshListeners: Array<() => void> = [];
export function triggerDailyRefresh() {
  _dailyRefreshListeners.forEach(fn => fn());
}

export function DailyScreen({ onNavigateToCompare }: DailyScreenProps) {
  const [activeTab, setActiveTab] = useState<DailyTab>('today');

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

  // Capture state for collection sharing
  const [isCapturing, setIsCapturing] = useState(false);
  const collectionViewRef = useRef<ViewShot>(null);

  const { movies, recordComparison, undoLastComparison } = useAppStore();
  const haptics = useHaptics();
  const { user } = useAuth();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewResults, setCrewResults] = useState<Map<string, CrewDailyResult>>(new Map());
  const [crewMembers, setCrewMembers] = useState<Map<string, CrewMember[]>>(new Map());
  const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null);
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

  // Handle share collection
  const handleShareCollection = useCallback(async () => {
    if (collections.length === 0) return;

    if (Platform.OS !== 'web') {
      try {
        setIsCapturing(true);
        await new Promise(resolve => setTimeout(resolve, 100));
        if (collectionViewRef.current) {
          const uri = await (collectionViewRef.current as any).capture();
          if (uri) {
            if (Platform.OS === 'ios') {
              await Share.share({ url: uri, message: 'my aaybee collection \u2192 aaybee.netlify.app' });
            } else {
              await Share.share({ message: 'my aaybee collection \u2192 aaybee.netlify.app' });
            }
            setIsCapturing(false);
            return;
          }
        }
      } catch (e) {
        console.error('ViewShot capture error:', e);
      } finally {
        setIsCapturing(false);
      }
    }

    const filledEntries = collections.map(entry => {
      const cat = DAILY_CATEGORIES.find(c => c.id === entry.categoryId);
      const movie = movies.get(entry.championId);
      return cat && movie ? `${cat.emoji} ${cat.title}: ${movie.title}` : null;
    }).filter(Boolean);

    const shareText = `my aaybee collection\n\n${filledEntries.join('\n')}\n\naaybee.netlify.app`;
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(shareText);
      } else {
        await Share.share({ message: shareText });
      }
    } catch (e) {
      console.error('Fallback share error:', e);
    }
  }, [collections, movies]);

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
    // If no active category, show the featured category intro
    const category = activeCategory || featuredCategory;
    const isSelectingMode = !!activeCategoryId;
    const currentStreak = streakData?.currentStreak || 0;
    const streakAtRisk = streakData?.lastCompletedDate === new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const isCompleted = completedCategoryIds.includes(category.id);

    const categoryMovieIds = category.movieIds;
    const missing = categoryMovieIds.filter(id => !movies.has(id));
    if (missing.length > 0) console.log('[Daily] Missing movie IDs for', category.id, ':', missing.join(', '));
    const gridMovies = categoryMovieIds.slice(0, 9).map(id => movies.get(id) || { id, title: id, posterUrl: null } as any) as Movie[];
    const seenCount = isSelectingMode
      ? Array.from(seenSelection).filter(id => categoryMovieIds.includes(id)).length
      : 0;

    return (
      <ScrollView contentContainerStyle={styles.centerContainer}>
        <Animated.View style={styles.introInner} entering={FadeIn.duration(300)}>

          {isSelectingMode ? (
            <>
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
            </>
          ) : (
            <>
              {/* YOUR CREWS - at top */}
              {user?.id && crews.length > 0 && (
                <Animated.View entering={FadeInDown.delay(50)} style={styles.crewSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.crewSectionTitle}>your crews</Text>
                    <Pressable onPress={() => setCrewCreateMode(!crewCreateMode && !crewJoinMode)} style={styles.subtleAction}>
                      <Text style={styles.subtleActionText}>+</Text>
                    </Pressable>
                  </View>
                  {crews.map(crew => {
                    const members = crewMembers.get(crew.id) || [];
                    const playedCount = members.filter(m => m.played_today).length;
                    const isExpanded = expandedCrewId === crew.id;
                    return (
                      <View key={crew.id}>
                        <Pressable
                          style={styles.crewCardInline}
                          onPress={() => setExpandedCrewId(isExpanded ? null : crew.id)}
                        >
                          <Text style={styles.crewCardName}>{crew.name}</Text>
                          <Text style={styles.crewCardStatus}>{playedCount}/{members.length} played</Text>
                        </Pressable>
                        {isExpanded && (
                          <View style={styles.crewExpanded}>
                            <View style={styles.crewCodeRow}>
                              <Text style={styles.crewCodeLabel}>code: </Text>
                              <Text style={styles.crewCodeValue}>{crew.code}</Text>
                              <Pressable
                                style={styles.crewShareButton}
                                onPress={async () => {
                                  const msg = `join my crew "${crew.name}" on aaybee! code: ${crew.code}`;
                                  if (Platform.OS === 'web' && navigator?.clipboard) {
                                    await navigator.clipboard.writeText(msg);
                                  } else {
                                    await Share.share({ message: msg });
                                  }
                                }}
                              >
                                <Text style={styles.crewShareText}>share</Text>
                              </Pressable>
                            </View>
                            {members.map(m => (
                              <View key={m.id} style={styles.crewMemberRow}>
                                <Text style={styles.crewMemberName}>{m.display_name}</Text>
                                <Text style={[styles.crewMemberStatus, m.played_today && styles.crewMemberPlayed]}>
                                  {m.played_today ? 'played' : '\u2014'}
                                </Text>
                              </View>
                            ))}
                            <Pressable
                              style={styles.crewLeaveButton}
                              onPress={async () => {
                                if (!user?.id) return;
                                await crewService.leaveCrew(user.id, crew.id);
                                setCrews(prev => prev.filter(c => c.id !== crew.id));
                                setExpandedCrewId(null);
                              }}
                            >
                              <Text style={styles.crewLeaveText}>leave crew</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {crewCreateMode && (
                    <View style={styles.crewInlineForm}>
                      <TextInput
                        style={styles.crewFormInput}
                        placeholder="crew name"
                        placeholderTextColor={colors.textMuted}
                        value={crewName}
                        onChangeText={setCrewName}
                        maxLength={30}
                        autoFocus
                      />
                      <View style={styles.crewFormButtons}>
                        <Pressable
                          style={[styles.crewFormButton, !crewName.trim() && { opacity: 0.4 }]}
                          onPress={async () => {
                            if (!user?.id || !crewName.trim()) return;
                            setCrewLoading(true);
                            const { crew, error } = await crewService.createCrew(user.id, crewName.trim());
                            if (crew) {
                              setCrews(prev => [...prev, crew]);
                              setCrewName('');
                              setCrewCreateMode(false);
                            }
                            if (error) setCrewError(error);
                            setCrewLoading(false);
                          }}
                          disabled={!crewName.trim() || crewLoading}
                        >
                          <Text style={styles.crewFormButtonText}>create</Text>
                        </Pressable>
                        <Pressable onPress={() => { setCrewCreateMode(false); setCrewJoinMode(true); }}>
                          <Text style={styles.crewFormCancel}>join instead</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {crewJoinMode && (
                    <View style={styles.crewInlineForm}>
                      <TextInput
                        style={styles.crewFormInput}
                        placeholder="enter code"
                        placeholderTextColor={colors.textMuted}
                        value={crewJoinCode}
                        onChangeText={t => setCrewJoinCode(t.toUpperCase())}
                        maxLength={6}
                        autoCapitalize="characters"
                        autoFocus
                      />
                      <View style={styles.crewFormButtons}>
                        <Pressable
                          style={[styles.crewFormButton, crewJoinCode.length < 6 && { opacity: 0.4 }]}
                          onPress={async () => {
                            if (!user?.id || crewJoinCode.length < 6) return;
                            setCrewLoading(true);
                            const { crew, error } = await crewService.joinCrew(user.id, crewJoinCode);
                            if (crew) {
                              setCrews(prev => [...prev, crew]);
                              setCrewJoinCode('');
                              setCrewJoinMode(false);
                            }
                            if (error) setCrewError(error);
                            setCrewLoading(false);
                          }}
                          disabled={crewJoinCode.length < 6 || crewLoading}
                        >
                          <Text style={styles.crewFormButtonText}>join</Text>
                        </Pressable>
                        <Pressable onPress={() => { setCrewJoinMode(false); setCrewJoinCode(''); }}>
                          <Text style={styles.crewFormCancel}>cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {crewError && <Text style={styles.crewErrorInline}>{crewError}</Text>}
                </Animated.View>
              )}

              {/* Whisper for users without crews */}
              {user?.id && crews.length === 0 && !crewCreateMode && !crewJoinMode && (
                <Pressable onPress={() => setCrewCreateMode(true)}>
                  <Text style={styles.crewWhisper}>play daily with friends +</Text>
                </Pressable>
              )}

              {/* Inline create/join for users without crews */}
              {user?.id && crews.length === 0 && crewCreateMode && (
                <View style={styles.crewInlineForm}>
                  <TextInput
                    style={styles.crewFormInput}
                    placeholder="crew name"
                    placeholderTextColor={colors.textMuted}
                    value={crewName}
                    onChangeText={setCrewName}
                    maxLength={30}
                    autoFocus
                  />
                  <View style={styles.crewFormButtons}>
                    <Pressable
                      style={[styles.crewFormButton, !crewName.trim() && { opacity: 0.4 }]}
                      onPress={async () => {
                        if (!user?.id || !crewName.trim()) return;
                        setCrewLoading(true);
                        const { crew, error } = await crewService.createCrew(user.id, crewName.trim());
                        if (crew) {
                          setCrews(prev => [...prev, crew]);
                          setCrewName('');
                          setCrewCreateMode(false);
                        }
                        if (error) setCrewError(error);
                        setCrewLoading(false);
                      }}
                      disabled={!crewName.trim() || crewLoading}
                    >
                      <Text style={styles.crewFormButtonText}>create</Text>
                    </Pressable>
                    <Pressable onPress={() => { setCrewCreateMode(false); setCrewJoinMode(true); }}>
                      <Text style={styles.crewFormCancel}>join instead</Text>
                    </Pressable>
                  </View>
                  {crewError && <Text style={styles.crewErrorInline}>{crewError}</Text>}
                </View>
              )}

              {user?.id && crews.length === 0 && crewJoinMode && (
                <View style={styles.crewInlineForm}>
                  <TextInput
                    style={styles.crewFormInput}
                    placeholder="enter code"
                    placeholderTextColor={colors.textMuted}
                    value={crewJoinCode}
                    onChangeText={t => setCrewJoinCode(t.toUpperCase())}
                    maxLength={6}
                    autoCapitalize="characters"
                    autoFocus
                  />
                  <View style={styles.crewFormButtons}>
                    <Pressable
                      style={[styles.crewFormButton, crewJoinCode.length < 6 && { opacity: 0.4 }]}
                      onPress={async () => {
                        if (!user?.id || crewJoinCode.length < 6) return;
                        setCrewLoading(true);
                        const { crew, error } = await crewService.joinCrew(user.id, crewJoinCode);
                        if (crew) {
                          setCrews(prev => [...prev, crew]);
                          setCrewJoinCode('');
                          setCrewJoinMode(false);
                        }
                        if (error) setCrewError(error);
                        setCrewLoading(false);
                      }}
                      disabled={crewJoinCode.length < 6 || crewLoading}
                    >
                      <Text style={styles.crewFormButtonText}>join</Text>
                    </Pressable>
                    <Pressable onPress={() => { setCrewJoinMode(false); setCrewJoinCode(''); }}>
                      <Text style={styles.crewFormCancel}>cancel</Text>
                    </Pressable>
                  </View>
                  {crewError && <Text style={styles.crewErrorInline}>{crewError}</Text>}
                </View>
              )}

              {/* Category info */}
              <Text style={styles.dailyLabel}>Daily #{dailyNumber}</Text>
              <Text style={styles.introTitle}>{category.title}</Text>

              {/* 3x3 poster grid */}
              <View style={styles.posterGrid}>
                {gridMovies.map((movie, i) => {
                  return (
                    <Animated.View key={movie.id} style={styles.posterGridCell} entering={FadeInDown.delay(i * 50).duration(300)}>
                      <View style={styles.posterPressable}>
                        {movie.posterUrl ? (
                          <Image
                            source={{ uri: movie.posterUrl }}
                            style={styles.posterGridImage}
                          />
                        ) : (
                          <View style={styles.posterGridPlaceholder}>
                            <Text style={styles.posterGridPlaceholderText}>?</Text>
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>

              <Text style={styles.introSubtitle}>{category.subtitle}</Text>

              {currentStreak > 0 && (
                <View style={[styles.streakBadge, streakAtRisk && styles.streakBadgeAtRisk]}>
                  <View style={styles.streakBadgeContent}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" stroke={colors.accent} strokeWidth={1.75} strokeLinejoin="round" />
                      <Path d="M12 12c0 2-1.5 3-1.5 4.5a1.5 1.5 0 0 0 3 0c0-1.5-1.5-2.5-1.5-4.5z" stroke={colors.accent} strokeWidth={1.25} strokeLinejoin="round" />
                    </Svg>
                    <Text style={styles.streakBadgeText}>
                      {streakAtRisk ? `${currentStreak} day streak at risk!` : `${currentStreak} day streak`}
                    </Text>
                  </View>
                </View>
              )}

              {isCompleted ? (
                <View style={styles.completedBadge}>
                  <View style={styles.completedBadgeContent}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Path d="M5 13l4 4L19 7" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                    <Text style={styles.completedBadgeText}>Completed today</Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.startButton}
                  onPress={() => startCategory(featuredCategory.id)}
                >
                  <Text style={styles.startButtonText}>Begin Aaybee Daily</Text>
                </Pressable>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
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
            <Pressable style={styles.viewCollectionButton} onPress={() => {
              handleBackToIntro();
              setActiveTab('collection');
            }}>
              <Text style={styles.viewCollectionText}>View Collection</Text>
            </Pressable>
            <Pressable style={styles.backToTodayButton} onPress={handleBackToIntro}>
              <Text style={styles.backToTodayText}>Back to Today</Text>
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

  // ---- RENDER: COLLECTION TAB ----

  const renderCollection = () => {
    const collectionMap = new Map<string, DailyCollectionEntry>();
    for (const entry of collections) {
      const existing = collectionMap.get(entry.categoryId);
      if (!existing || entry.dailyNumber > existing.dailyNumber) {
        collectionMap.set(entry.categoryId, entry);
      }
    }

    const filledCount = collectionMap.size;
    const columns = filledCount <= 9 ? 3 : filledCount <= 16 ? 4 : 5;

    return (
      <ScrollView contentContainerStyle={styles.collectionScrollContent}>
        <Animated.View entering={FadeIn.duration(300)}>
          <Text style={styles.collectionTitle}>Your Collection</Text>
          <Text style={styles.collectionSubtitle}>{filledCount} / {DAILY_CATEGORIES.length} categories</Text>

          <View style={[styles.collectionGrid, { gap: spacing.sm }]}>
            {DAILY_CATEGORIES.map((category) => {
              const entry = collectionMap.get(category.id);
              const championMovie = entry ? movies.get(entry.championId) : null;

              return (
                <View
                  key={category.id}
                  style={[
                    styles.collectionCell,
                    { width: `${Math.floor(100 / columns) - 2}%` as any },
                  ]}
                >
                  {championMovie?.posterUrl ? (
                    <View style={styles.filledCell}>
                      <Image
                        source={{ uri: championMovie.posterUrl }}
                        style={styles.collectionPoster}
                      />
                    </View>
                  ) : (
                    <Pressable
                      style={styles.emptyCellPressable}
                      onPress={() => {
                        startCategory(category.id);
                        setActiveTab('today');
                      }}
                    >
                      <CategoryCellEmpty category={category} movies={movies} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>

          {filledCount > 0 && (
            <Pressable style={styles.shareCollectionButton} onPress={handleShareCollection}>
              <Text style={styles.shareCollectionText}>Share Collection</Text>
            </Pressable>
          )}
        </Animated.View>

        {Platform.OS !== 'web' && isCapturing && (
          <View style={styles.captureWrapper}>
            <ViewShot
              ref={collectionViewRef}
              options={{ format: 'png', quality: 1, width: 1080, height: 1080 }}
            >
              <ShareableCollectionsGrid
                categories={DAILY_CATEGORIES}
                collections={collections}
                movies={movies}
              />
            </ViewShot>
          </View>
        )}
      </ScrollView>
    );
  };

  // ---- MAIN RENDER ----

  const tabs = useMemo(() => [
    { key: 'today' as DailyTab, label: 'Today' },
    { key: 'collection' as DailyTab, label: 'Collection', badge: collections.length > 0 ? collections.length : undefined },
  ], [collections.length]);

  if (step === 'playing' && activeTab === 'today') {
    return (
      <View style={styles.container}>
        {renderPlaying()}
      </View>
    );
  }

  if (step === 'results' && activeTab === 'today') {
    return (
      <View style={styles.container}>
        {renderResults()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!activeCategoryId && (
        <UnderlineTabs tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />
      )}
      {activeTab === 'today' && renderIntro()}
      {activeTab === 'collection' && !activeCategoryId && renderCollection()}
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
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  copyButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  viewCollectionButton: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  viewCollectionText: {
    ...typography.bodyMedium,
    color: colors.accent,
  },
  backToTodayButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  backToTodayText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },

  // Collection
  collectionScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  collectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  collectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  collectionCell: {
    aspectRatio: 2 / 3,
    marginBottom: spacing.sm,
  },
  filledCell: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  emptyCellPressable: {
    flex: 1,
  },
  collectionPoster: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  shareCollectionButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  shareCollectionText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  captureWrapper: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },

  // Crew Results
  crewResultsSection: {
    width: '100%',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  crewSection: { marginTop: spacing.lg, marginBottom: spacing.lg, width: '100%' },
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
  crewCardInline: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  crewCardName: { ...typography.bodyMedium, color: colors.textPrimary },
  crewCardStatus: { ...typography.caption, color: colors.textMuted },
  crewExpanded: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderTopWidth: 0,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    marginTop: -spacing.xs,
  },
  crewCodeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  crewCodeLabel: { ...typography.caption, color: colors.textMuted },
  crewCodeValue: { ...typography.bodyMedium, color: colors.accent, letterSpacing: 2, marginRight: spacing.sm },
  crewShareButton: {
    paddingVertical: 2, paddingHorizontal: spacing.sm,
    backgroundColor: colors.accentSubtle, borderRadius: borderRadius.sm,
  },
  crewShareText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  crewMemberRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  crewMemberName: { ...typography.caption, color: colors.textPrimary },
  crewMemberStatus: { ...typography.caption, color: colors.textMuted },
  crewMemberPlayed: { color: colors.success },
  crewLeaveButton: { marginTop: spacing.sm },
  crewLeaveText: { ...typography.caption, color: colors.textMuted },
  crewActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  crewActionButton: {
    flex: 1, paddingVertical: spacing.sm, alignItems: 'center',
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  crewActionText: { ...typography.caption, color: colors.textSecondary },
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
  crewErrorInline: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
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
    fontWeight: '600',
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
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
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
