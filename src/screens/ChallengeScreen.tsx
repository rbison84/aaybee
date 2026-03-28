import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useAppDimensions } from '../contexts/DimensionsContext';
import { useHaptics } from '../hooks/useHaptics';
import { challengeService, getMatchTier, ChallengeMovie, FriendChallenge, ChallengeResults } from '../services/challengeService';
import { shareService } from '../services/shareService';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

// Only import QR on web
let QRCodeSVG: any = null;
if (Platform.OS === 'web') {
  try {
    QRCodeSVG = require('qrcode.react').QRCodeSVG;
  } catch {}
}

// ============================================
// TYPES
// ============================================

type ChallengeStep =
  | 'home'       // Create or join
  | 'select'     // Pick 10 movies from your list
  | 'share'      // Show link to share
  | 'name'       // Challenger enters their name
  | 'rank'       // Rank the 10 movies via pairwise comparison
  | 'results';   // Match results

interface ChallengeScreenProps {
  onClose: () => void;
  initialCode?: string;
}

// ============================================
// COMPONENT
// ============================================

export function ChallengeScreen({ onClose, initialCode }: ChallengeScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDesktop, isWeb } = useAppDimensions();
  const haptics = useHaptics();

  const [step, setStep] = useState<ChallengeStep>(initialCode ? 'name' : 'home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create flow
  const [availableMovies, setAvailableMovies] = useState<ChallengeMovie[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Active challenge
  const [challenge, setChallenge] = useState<FriendChallenge | null>(null);

  // Challenger name
  const [challengerName, setChallengerName] = useState('');

  // Ranking flow (Swiss pairwise)
  const [rankingPairs, setRankingPairs] = useState<[ChallengeMovie, ChallengeMovie][]>([]);
  const [currentPairIndex, setCurrentPairIndex] = useState(0);
  const [scores, setScores] = useState<Map<string, number>>(new Map());

  // Results
  const [results, setResults] = useState<ChallengeResults | null>(null);

  // Copied feedback
  const [copied, setCopied] = useState(false);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<{ name: string; matchPercent: number; code: string; date: string }[]>([]);

  // Active/pending challenges
  const [activeChallenges, setActiveChallenges] = useState<FriendChallenge[]>([]);

  // Prevent double tap
  const pickingRef = useRef(false);

  // ============================================
  // LOAD INITIAL CODE (deep link join)
  // ============================================

  useEffect(() => {
    if (!initialCode) return;
    (async () => {
      setLoading(true);
      const c = await challengeService.getChallengeByCode(initialCode);
      if (c) {
        setChallenge(c);
        if (c.status === 'complete' && c.results) {
          setResults(c.results as ChallengeResults);
          setStep('results');
        } else if (user?.id) {
          // Logged-in user: auto-set name and join directly
          const autoName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
          setChallengerName(autoName);
          const { challenge: updated, error: err } = await challengeService.joinChallenge(
            c.code,
            autoName,
            user.id,
          );
          if (err) {
            setError(err);
            setStep('home');
          } else if (updated?.status === 'complete' && updated.results) {
            setChallenge(updated);
            setResults(updated.results as ChallengeResults);
            setStep('results');
          } else {
            if (updated) setChallenge(updated);
            const movies = (updated || c).movies;
            const pairs = generateSwissPairs(movies);
            setRankingPairs(pairs);
            setCurrentPairIndex(0);
            setScores(new Map(movies.map(m => [m.id, 0])));
            setStep('rank');
          }
        } else {
          setStep('name');
        }
      } else {
        setError('Challenge not found or expired');
        setStep('home');
      }
      setLoading(false);
    })();
  }, [initialCode]);

  // Load leaderboard + active challenges
  useEffect(() => {
    if (!user?.id) return;
    challengeService.getMyActiveChallenges(user.id).then(setActiveChallenges);
    challengeService.getChallengeLeaderboard(user.id).then(setLeaderboard);
  }, [user?.id]);

  // ============================================
  // CREATE FLOW
  // ============================================

  const loadMoviesForSelection = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const movies = await challengeService.getTopMoviesForChallenge(user.id, 30);
    setAvailableMovies(movies);
    // Auto-select top 10
    const top10 = movies.slice(0, 10).map(m => m.id);
    setSelectedIds(new Set(top10));
    setLoading(false);
    setStep('select');
  }, [user?.id]);

  const toggleMovie = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 10) {
        next.add(id);
      }
      return next;
    });
    haptics.light();
  }, [haptics]);

  const createChallenge = useCallback(async () => {
    if (!user?.id || selectedIds.size < 3) return;
    setLoading(true);
    setError(null);

    const selectedMovies = availableMovies.filter(m => selectedIds.has(m.id));
    // Creator ranking is the order they appear in (by beta score, already sorted)
    const creatorRanking = selectedMovies.map(m => m.id);

    // Get display name
    const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';

    const { challenge: c, error: err } = await challengeService.createChallenge(
      user.id,
      displayName,
      selectedMovies,
      creatorRanking,
    );

    if (err || !c) {
      setError(err || 'Failed to create challenge');
      setLoading(false);
      return;
    }

    setChallenge(c);
    setStep('share');
    setLoading(false);
    haptics.success();
  }, [user, selectedIds, availableMovies, haptics]);

  // ============================================
  // JOIN + RANK FLOW
  // ============================================

  const joinChallenge = useCallback(async () => {
    const autoName = user?.id
      ? (user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan')
      : challengerName.trim();
    if (!challenge || !autoName) return;
    setLoading(true);
    setError(null);

    const { challenge: updated, error: err } = await challengeService.joinChallenge(
      challenge.code,
      autoName,
      user?.id,
    );

    if (err && err !== undefined) {
      setError(err);
      setLoading(false);
      return;
    }

    if (updated) setChallenge(updated);

    // If already complete, show results
    if (updated?.status === 'complete' && updated.results) {
      setResults(updated.results as ChallengeResults);
      setStep('results');
      setLoading(false);
      return;
    }

    // Generate Swiss pairwise comparisons for the movies
    const movies = (updated || challenge).movies;
    const pairs = generateSwissPairs(movies);
    setRankingPairs(pairs);
    setCurrentPairIndex(0);
    setScores(new Map(movies.map(m => [m.id, 0])));
    setStep('rank');
    setLoading(false);
  }, [challenge, challengerName, user?.id]);

  const handlePick = useCallback(async (winnerId: string) => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    haptics.light();

    const pair = rankingPairs[currentPairIndex];
    const loserId = pair[0].id === winnerId ? pair[1].id : pair[0].id;

    setScores(prev => {
      const next = new Map(prev);
      next.set(winnerId, (next.get(winnerId) || 0) + 1);
      return next;
    });

    const nextIndex = currentPairIndex + 1;

    if (nextIndex >= rankingPairs.length) {
      // Done — compute ranking from scores
      const finalScores = new Map(scores);
      finalScores.set(winnerId, (finalScores.get(winnerId) || 0) + 1);

      const challengerRanking = challenge!.movies
        .map(m => ({ id: m.id, score: finalScores.get(m.id) || 0 }))
        .sort((a, b) => b.score - a.score)
        .map(m => m.id);

      setLoading(true);
      const { results: r, error: err } = await challengeService.submitRanking(
        challenge!.code,
        challengerRanking,
      );

      if (r) {
        setResults(r);
        setStep('results');
        haptics.success();
      } else {
        setError(err || 'Failed to submit ranking');
      }
      setLoading(false);
    } else {
      setCurrentPairIndex(nextIndex);
    }

    setTimeout(() => { pickingRef.current = false; }, 300);
  }, [currentPairIndex, rankingPairs, scores, challenge, haptics]);

  // ============================================
  // SHARE
  // ============================================

  const handleShareLink = useCallback(async () => {
    if (!challenge) return;
    const url = shareService.getChallengeShareUrl(challenge.code);
    const message = `${challenge.creator_name} challenged you to rank ${challenge.movies.length} movies! can you match their taste?\n\n${url}`;

    try {
      if (Platform.OS === 'web' && navigator?.share) {
        await navigator.share({ text: message });
      } else if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(message);
      } else {
        await Share.share({ message });
      }
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }, [challenge, haptics]);

  const handleShareResults = useCallback(async () => {
    if (!challenge || !results) return;
    const url = shareService.getChallengeShareUrl(challenge.code);
    const message = `${challenge.creator_name} & ${challenge.challenger_name}: ${results.matchPercent}% movie taste match!\n\n${url}`;

    try {
      if (Platform.OS === 'web' && navigator?.share) {
        await navigator.share({ text: message });
      } else if (Platform.OS === 'web' && navigator?.clipboard) {
        await navigator.clipboard.writeText(message);
      } else {
        await Share.share({ message });
      }
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }, [challenge, results, haptics]);

  // ============================================
  // SWISS PAIR GENERATION
  // ============================================

  /**
   * Generate pairwise comparisons for n movies.
   * For 10 movies: ~20 comparisons (2x movie count).
   * Uses round-robin-style pairing ensuring each movie appears ~4 times.
   */
  function generateSwissPairs(movies: ChallengeMovie[]): [ChallengeMovie, ChallengeMovie][] {
    const n = movies.length;
    const targetComparisons = n * 2;
    const allPairs: [ChallengeMovie, ChallengeMovie][] = [];

    // Generate all possible pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        allPairs.push([movies[i], movies[j]]);
      }
    }

    // Shuffle
    for (let i = allPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPairs[i], allPairs[j]] = [allPairs[j], allPairs[i]];
    }

    // Greedily select pairs, balancing movie appearances
    const selected: [ChallengeMovie, ChallengeMovie][] = [];
    const count = new Map<string, number>();

    const maxAppearances = Math.ceil((targetComparisons * 2) / n) + 1;

    for (const pair of allPairs) {
      if (selected.length >= targetComparisons) break;
      const cA = count.get(pair[0].id) || 0;
      const cB = count.get(pair[1].id) || 0;
      if (cA >= maxAppearances || cB >= maxAppearances) continue;

      selected.push(pair);
      count.set(pair[0].id, cA + 1);
      count.set(pair[1].id, cB + 1);
    }

    return selected;
  }

  // ============================================
  // RENDER HELPERS
  // ============================================

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <Pressable onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
      <Text style={styles.headerTitle}>challenge</Text>
      <View style={styles.closeButton} />
    </View>
  );

  // HOME: create or join
  const renderHome = () => (
    <Animated.View entering={FadeIn} style={styles.centeredContent}>
      <Text style={styles.heroTitle}>challenge</Text>
      <Text style={styles.heroSubtitle}>rank the same movies as a friend{'\n'}and see how your taste compares</Text>

      {user?.id ? (
        <Pressable
          style={[styles.actionButton, styles.actionButtonPrimary, { marginTop: spacing.xxl }]}
          onPress={loadMoviesForSelection}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.actionButtonTextPrimary}>create challenge</Text>
          )}
        </Pressable>
      ) : (
        <Text style={[styles.heroSubtitle, { marginTop: spacing.xl }]}>
          sign in to create challenges
        </Text>
      )}

      <Text style={[styles.dividerText, { marginVertical: spacing.lg }]}>or join one</Text>

      <View style={styles.codeInputRow}>
        <TextInput
          style={styles.codeInput}
          placeholder="enter code"
          placeholderTextColor={colors.textMuted}
          value={challengerName ? '' : ''}
          onChangeText={(text) => {
            const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            if (code.length === 6) {
              (async () => {
                setLoading(true);
                const c = await challengeService.getChallengeByCode(code);
                if (c) {
                  setChallenge(c);
                  if (c.status === 'complete' && c.results) {
                    setResults(c.results as ChallengeResults);
                    setStep('results');
                  } else {
                    setStep('name');
                  }
                } else {
                  setError('Challenge not found or expired');
                }
                setLoading(false);
              })();
            }
          }}
          maxLength={6}
          autoCapitalize="characters"
        />
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Active/Pending Challenges */}
      {activeChallenges.filter(c => c.status !== 'complete').length > 0 && (
        <View style={styles.leaderboardSection}>
          <Text style={styles.leaderboardTitle}>active</Text>
          {activeChallenges
            .filter(c => c.status !== 'complete')
            .map((c) => {
              const isCreator = c.creator_id === user?.id;
              const isPending = c.status === 'pending';
              const opponentName = isCreator ? (c.challenger_name || 'waiting...') : c.creator_name;
              return (
                <Pressable
                  key={c.id}
                  style={styles.leaderboardRow}
                  onPress={() => {
                    setChallenge(c);
                    if (isPending && isCreator) {
                      setStep('share');
                    } else if (!isCreator && c.status === 'active') {
                      // Challenger can continue ranking
                      const movies = c.movies;
                      const pairs = generateSwissPairs(movies);
                      setRankingPairs(pairs);
                      setCurrentPairIndex(0);
                      setScores(new Map(movies.map(m => [m.id, 0])));
                      setStep('rank');
                    }
                  }}
                >
                  <Text style={styles.leaderboardName}>{opponentName}</Text>
                  <Text style={[styles.leaderboardPercent, { color: colors.textMuted }]}>
                    {isPending ? 'waiting...' : 'ranking...'}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      )}

      {/* Completed Challenges */}
      {leaderboard.length > 0 && (
        <View style={styles.leaderboardSection}>
          <Text style={styles.leaderboardTitle}>completed</Text>
          {leaderboard.map((entry, i) => {
            const tier = getMatchTier(entry.matchPercent);
            return (
              <Pressable key={`${entry.code}-${i}`} style={styles.leaderboardRow} onPress={() => {
                (async () => {
                  const c = await challengeService.getChallengeByCode(entry.code);
                  if (c && c.results) {
                    setChallenge(c);
                    setResults(c.results as ChallengeResults);
                    setStep('results');
                  }
                })();
              }}>
                <Text style={styles.leaderboardName}>{entry.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={styles.leaderboardPercent}>{entry.matchPercent}%</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Animated.View>
  );

  // SELECT: pick 10 movies
  const renderSelect = () => (
    <Animated.View entering={FadeIn} style={styles.fullContent}>
      <Text style={styles.sectionTitle}>pick your movies</Text>
      <Text style={styles.sectionSubtitle}>
        {selectedIds.size}/10 selected — your friend will rank these same movies
      </Text>

      <ScrollView style={styles.movieGrid} contentContainerStyle={styles.movieGridContent}>
        {availableMovies.map((movie) => {
          const isSelected = selectedIds.has(movie.id);
          return (
            <Pressable
              key={movie.id}
              style={[styles.movieItem, isSelected && styles.movieItemSelected]}
              onPress={() => toggleMovie(movie.id)}
            >
              {movie.posterUrl ? (
                <Image
                  source={{ uri: movie.posterUrl }}
                  style={styles.moviePoster}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.moviePoster, styles.moviePosterPlaceholder]}>
                  <Text style={styles.moviePosterText}>{movie.title[0]}</Text>
                </View>
              )}
              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>✓</Text>
                </View>
              )}
              <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
              <Text style={styles.movieYear}>{movie.year}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        style={[
          styles.actionButton,
          styles.actionButtonPrimary,
          selectedIds.size < 3 && styles.actionButtonDisabled,
        ]}
        onPress={createChallenge}
        disabled={selectedIds.size < 3 || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={styles.actionButtonTextPrimary}>
            create challenge ({selectedIds.size} movies)
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );

  // SHARE: show link
  const renderShare = () => (
    <Animated.View entering={FadeIn} style={styles.centeredContent}>
      <Text style={styles.heroTitle}>ready!</Text>
      <Text style={styles.heroSubtitle}>share this with your friend</Text>

      <View style={styles.codeDisplay}>
        <Text style={styles.codeDisplayText}>{challenge?.code}</Text>
      </View>

      {Platform.OS === 'web' && QRCodeSVG && (
        <View style={styles.qrContainer}>
          <QRCodeSVG
            value={`https://aaybee.netlify.app/challenge/${challenge?.code}`}
            size={160}
            bgColor="transparent"
            fgColor="#F5F3FF"
            level="M"
          />
        </View>
      )}

      <Pressable
        style={[styles.actionButton, styles.actionButtonPrimary, { marginTop: spacing.xl }]}
        onPress={handleShareLink}
      >
        <Text style={styles.actionButtonTextPrimary}>
          {copied ? 'copied!' : 'share challenge'}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.actionButton, { marginTop: spacing.md, backgroundColor: colors.surface }]}
        onPress={() => { setStep('home'); setChallenge(null); }}
      >
        <Text style={styles.actionButtonText}>done</Text>
      </Pressable>
    </Animated.View>
  );

  // NAME: challenger enters name
  const renderName = () => (
    <Animated.View entering={FadeIn} style={styles.centeredContent}>
      <Text style={styles.heroTitle}>
        {challenge?.creator_name} challenged you
      </Text>
      <Text style={styles.heroSubtitle}>
        rank {challenge?.movies.length || 10} movies and see if your taste matches
      </Text>

      <TextInput
        style={[styles.codeInput, { marginTop: spacing.xl, textAlign: 'center' }]}
        placeholder="your name"
        placeholderTextColor={colors.textMuted}
        value={challengerName}
        onChangeText={setChallengerName}
        maxLength={20}
        autoCapitalize="words"
      />

      <Pressable
        style={[
          styles.actionButton,
          styles.actionButtonPrimary,
          { marginTop: spacing.lg },
          !challengerName.trim() && styles.actionButtonDisabled,
        ]}
        onPress={joinChallenge}
        disabled={!challengerName.trim() || loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={styles.actionButtonTextPrimary}>start ranking</Text>
        )}
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </Animated.View>
  );

  // RANK: pairwise comparisons
  const renderRank = () => {
    if (currentPairIndex >= rankingPairs.length) return null;
    const [movieA, movieB] = rankingPairs[currentPairIndex];
    const progress = (currentPairIndex + 1) / rankingPairs.length;

    return (
      <Animated.View entering={FadeIn} style={styles.fullContent}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {currentPairIndex + 1} / {rankingPairs.length}
        </Text>

        <Text style={styles.rankPrompt}>which do you prefer?</Text>

        <View style={styles.pairContainer}>
          <Pressable
            style={styles.pairCard}
            onPress={() => handlePick(movieA.id)}
          >
            {movieA.posterUrl ? (
              <Image
                source={{ uri: movieA.posterUrl }}
                style={styles.pairPoster}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.pairPoster, styles.moviePosterPlaceholder]}>
                <Text style={styles.moviePosterText}>{movieA.title[0]}</Text>
              </View>
            )}
            <Text style={styles.pairTitle} numberOfLines={2}>{movieA.title}</Text>
            <Text style={styles.pairYear}>{movieA.year}</Text>
          </Pressable>

          <Text style={styles.vsText}>vs</Text>

          <Pressable
            style={styles.pairCard}
            onPress={() => handlePick(movieB.id)}
          >
            {movieB.posterUrl ? (
              <Image
                source={{ uri: movieB.posterUrl }}
                style={styles.pairPoster}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.pairPoster, styles.moviePosterPlaceholder]}>
                <Text style={styles.moviePosterText}>{movieB.title[0]}</Text>
              </View>
            )}
            <Text style={styles.pairTitle} numberOfLines={2}>{movieB.title}</Text>
            <Text style={styles.pairYear}>{movieB.year}</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  // RESULTS
  const renderResults = () => {
    if (!results || !challenge) return null;

    return (
      <Animated.View entering={FadeIn} style={styles.fullContent}>
        <ScrollView contentContainerStyle={styles.resultsContent}>
          <Animated.Text entering={FadeInDown.delay(200)} style={styles.matchPercent}>
            {results.matchPercent}%
          </Animated.Text>
          <Text style={styles.matchLabel}>taste match</Text>
          <Text style={styles.matchTierName}>{getMatchTier(results.matchPercent).name}</Text>
          <Text style={styles.matchTierSubtitle}>{getMatchTier(results.matchPercent).subtitle}</Text>
          <Text style={styles.matchNames}>
            {challenge.creator_name} & {challenge.challenger_name}
          </Text>

          {results.agreements.length > 0 && (
            <Animated.View entering={FadeInUp.delay(400)} style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>agreed on</Text>
              {results.agreements.map((a, i) => (
                <View key={i} style={styles.resultRow}>
                  <Text style={styles.resultRank}>#{a.rank}</Text>
                  <Text style={styles.resultMovie}>{a.movie.title}</Text>
                </View>
              ))}
            </Animated.View>
          )}

          {results.disagreements.length > 0 && (
            <Animated.View entering={FadeInUp.delay(600)} style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>biggest disagreements</Text>
              {results.disagreements.slice(0, 5).map((d, i) => (
                <View key={i} style={styles.resultRow}>
                  <Text style={styles.resultMovie}>{d.movie.title}</Text>
                  <Text style={styles.resultDisagreement}>
                    #{d.creatorRank} vs #{d.challengerRank}
                  </Text>
                </View>
              ))}
            </Animated.View>
          )}
        </ScrollView>

        <Pressable
          style={[styles.actionButton, styles.actionButtonPrimary]}
          onPress={handleShareResults}
        >
          <Text style={styles.actionButtonTextPrimary}>
            {copied ? 'copied!' : 'share result'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, { marginTop: spacing.sm, backgroundColor: colors.surface }]}
          onPress={onClose}
        >
          <Text style={styles.actionButtonText}>done</Text>
        </Pressable>
      </Animated.View>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {renderHeader()}

      {loading && step === 'home' ? (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <>
          {step === 'home' && renderHome()}
          {step === 'select' && renderSelect()}
          {step === 'share' && renderShare()}
          {step === 'name' && renderName()}
          {step === 'rank' && renderRank()}
          {step === 'results' && renderResults()}
        </>
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  headerTitle: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  fullContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  heroTitle: {
    ...typography.displayMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Buttons
  actionButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonTextPrimary: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  actionButtonText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },

  // Code input
  codeInputRow: {
    width: '100%',
    maxWidth: 280,
  },
  codeInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    letterSpacing: 4,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  // Code display
  codeDisplay: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  qrContainer: {
    alignItems: 'center' as const,
    marginVertical: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  codeDisplayText: {
    ...typography.displayMedium,
    color: colors.accent,
    letterSpacing: 6,
    textAlign: 'center',
  },

  // Movie selection grid
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  movieGrid: {
    flex: 1,
  },
  movieGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  movieItem: {
    width: '30%',
    alignItems: 'center',
    opacity: 0.5,
  },
  movieItemSelected: {
    opacity: 1,
  },
  moviePoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  moviePosterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  moviePosterText: {
    ...typography.displayMedium,
    color: colors.textMuted,
  },
  selectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '700',
  },
  movieTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  movieYear: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Pairwise ranking
  progressBar: {
    height: 3,
    backgroundColor: colors.surface,
    borderRadius: 2,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  progressText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  rankPrompt: {
    ...typography.h3,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pairContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  pairCard: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 200,
  },
  pairPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  pairTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  pairYear: {
    ...typography.caption,
    color: colors.textMuted,
  },
  vsText: {
    ...typography.h3,
    color: colors.textMuted,
  },

  // Results
  resultsContent: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  matchPercent: {
    fontSize: 72,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
  },
  matchLabel: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  matchTierName: {
    ...typography.h3,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  matchTierSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  matchNames: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
  resultsSection: {
    width: '100%',
    maxWidth: 400,
    marginBottom: spacing.lg,
  },
  resultsSectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  resultRank: {
    ...typography.bodyMedium,
    color: colors.accent,
    width: 40,
  },
  resultMovie: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  resultDisagreement: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },

  // Leaderboard
  leaderboardSection: {
    width: '100%',
    maxWidth: 320,
    marginTop: spacing.xl,
  },
  leaderboardTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  leaderboardName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  leaderboardPercent: {
    ...typography.bodyMedium,
    color: colors.accent,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
});
