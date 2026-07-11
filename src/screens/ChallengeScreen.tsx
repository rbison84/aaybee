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
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/useAppStore';
import { useAppDimensions } from '../contexts/DimensionsContext';
import { useHaptics } from '../hooks/useHaptics';
import { challengeService } from '../services/challengeService';
import { friendService, FriendWithProfile, FriendRequest, UserSearchResult } from '../services/friendService';
import { ContactInvite } from '../components/ContactInvite';
import { TasteRadar } from '../components/TasteRadar';
import { CinematicCard } from '../components/cinematic/CinematicCard';
import { OnboardingProgressBar } from '../components/onboarding/OnboardingProgressBar';
import { computeTasteAxes, generateComparisonSummary } from '../utils/tasteAxes';
import { shareToWhatsApp } from '../utils/crossPlatform';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { Movie } from '../types';
import { CURATED_PACKS, CuratedPack } from '../data/curatedPacks';
import { supabase } from '../services/supabase';

import { QRCode } from '../components/QRCode';
import { BracketPlay } from '../components/BracketPlay';
import { BracketResults } from '../components/BracketResults';
import {
  BracketMovie,
  BracketPick,
  createVsBracket,
  extractBracketComparisons,
} from '../utils/movieBracket';
import { knockoutService, KnockoutChallenge } from '../services/knockoutService';

// ============================================
// TYPES
// ============================================

type ChallengeStep =
  | 'home'
  | 'knockout-name'
  | 'knockout'
  | 'knockout-sent'
  | 'knockout-result';

interface ChallengeScreenProps {
  initialCode?: string;
  onOpenAuth?: () => void;
  autoStartKnockout?: boolean;
  challengedFriendId?: string;
  challengedFriendName?: string;
  onGoHome?: () => void;
  onChallengeFriend?: (friendId: string, friendName: string) => void;
}

// ============================================
// COMPONENT
// ============================================

export function ChallengeScreen({ initialCode, onOpenAuth, autoStartKnockout, challengedFriendId, challengedFriendName, onGoHome, onChallengeFriend }: ChallengeScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDesktop, isWeb } = useAppDimensions();
  const haptics = useHaptics();
  const { recordComparison, movies: storeMovies, markMovieAsKnown } = useAppStore();

  const [step, setStep] = useState<ChallengeStep>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Challenger name
  const [challengerName, setChallengerName] = useState('');

  // Directed challenge target (from props or a friend-row tap)
  const [targetFriendId, setTargetFriendId] = useState<string | undefined>(challengedFriendId);
  const [targetFriendName, setTargetFriendName] = useState<string | undefined>(challengedFriendName);

  // Friends
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [friendTopMovies, setFriendTopMovies] = useState<Map<string, { title: string }[]>>(new Map());

  // Knockout bracket state
  const [bracketMovies, setBracketMovies] = useState<BracketMovie[]>([]);
  const [bracketPicks, setBracketPicks] = useState<BracketPick[]>([]);
  const [bracketWinner, setBracketWinner] = useState<BracketMovie | null>(null);
  const [knockoutGuestName, setKnockoutGuestName] = useState('');
  const [knockoutChallenge, setKnockoutChallenge] = useState<KnockoutChallenge | null>(null);
  const [knockoutSeed, setKnockoutSeed] = useState(0);

  // Inline code input for home screen
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // ============================================
  // LOAD INITIAL CODE (deep link join)
  // ============================================

  useEffect(() => {
    if (!initialCode) return;
    (async () => {
      setLoading(true);

      // Knockout challenge (the only head-to-head format)
      const kc = await knockoutService.getChallengeByCode(initialCode);
      if (kc) {
        setKnockoutChallenge(kc);
        setBracketMovies(kc.movies);
        if (kc.status === 'complete') {
          // Already complete — show results
          setBracketPicks(kc.challenger_picks || kc.creator_picks || []);
          setBracketWinner(kc.challenger_winner || kc.creator_winner || null);
          setStep('knockout-result');
        } else {
          // Waiting for challenger — play the same bracket
          setBracketPicks([]);
          setBracketWinner(null);
          if (user?.id) {
            const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
            setChallengerName(displayName);
            setStep('knockout');
          } else {
            setStep('knockout-name');
          }
        }
        setLoading(false);
        return;
      }

      setError('Challenge not found or expired');
      setStep('home');
      setLoading(false);
    })();
  }, [initialCode]);

  // Load friends on mount
  useEffect(() => {
    if (!user?.id) {
      setFriends([]);
      setFriendRequests([]);
      return;
    }
    (async () => {
      const [friendsData, requestsData] = await Promise.all([
        friendService.getFriends(user.id),
        friendService.getPendingRequests(user.id),
      ]);
      setFriends(friendsData);
      setFriendRequests(requestsData);
    })();
  }, [user?.id]);

  // ============================================
  // KNOCKOUT BRACKET
  // ============================================

  const handleStartKnockout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let pool: BracketMovie[] = [];

      if (user?.id) {
        // Signed in: use their ranked movies
        const movies = await challengeService.getTopMoviesForChallenge(user.id, 50);
        pool = movies.map(m => ({
          id: m.id,
          title: m.title,
          posterUrl: m.posterUrl || '',
          year: m.year,
        }));
      }

      if (pool.length < 16) {
        // Not enough ranked movies (or guest) — fetch random highly rated movies
        const { data: randomMovies } = await supabase
          .from('movies')
          .select('id, title, year, poster_url')
          .lte('tier', 2)
          .limit(80);

        if (randomMovies && randomMovies.length >= 16) {
          // Shuffle and take 16
          const shuffled = [...randomMovies].sort(() => Math.random() - 0.5);
          pool = shuffled.slice(0, 40).map(m => ({
            id: m.id,
            title: m.title,
            posterUrl: m.poster_url || '',
            year: m.year,
          }));
        }
      }

      if (pool.length < 16) {
        setError('Not enough movies available');
        setLoading(false);
        return;
      }

      const seed = Date.now();
      setKnockoutSeed(seed);
      const bracket = createVsBracket(pool, seed);
      setBracketMovies(bracket);
      setBracketPicks([]);
      setBracketWinner(null);
      setKnockoutChallenge(null);
      setStep('knockout');
    } catch (err) {
      setError('Failed to create bracket');
    }

    setLoading(false);
  }, [user?.id]);

  // Record knockout bracket results into the taste graph
  // Uses a ref to track pending recordings, and a delayed execution
  // to ensure markMovieAsKnown state updates have propagated
  const pendingBracketRef = useRef<{ movies: BracketMovie[]; picks: BracketPick[] } | null>(null);

  const recordBracketInTasteGraph = useCallback((bMovies: BracketMovie[], picks: BracketPick[]) => {
    // Add all bracket movies to the store first
    for (const movie of bMovies) {
      if (!storeMovies.has(movie.id)) {
        markMovieAsKnown(movie.id, {
          title: movie.title,
          year: movie.year || 2000,
          posterUrl: movie.posterUrl,
        });
      }
    }
    // Store pending — will be recorded on next render when store has updated
    pendingBracketRef.current = { movies: bMovies, picks };
  }, [storeMovies, markMovieAsKnown]);

  // Process pending bracket comparisons after store updates
  useEffect(() => {
    if (!pendingBracketRef.current) return;
    const { movies: bMovies, picks } = pendingBracketRef.current;

    // Check if movies are now in store
    const allInStore = bMovies.every(m => storeMovies.has(m.id));
    if (!allInStore) return; // Wait for next render

    const comparisons = extractBracketComparisons(bMovies, picks);
    for (const { winnerId, loserId } of comparisons) {
      recordComparison(winnerId, loserId, false, 'vs');
    }
    pendingBracketRef.current = null;
  }, [storeMovies, recordComparison]);

  // Auto-start knockout when entering VS directly
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStartKnockout && !autoStarted.current && !initialCode) {
      autoStarted.current = true;
      if (user?.id) {
        // Signed in → straight to knockout
        handleStartKnockout();
      } else {
        // Guest → name entry first
        setStep('knockout-name');
      }
    }
  }, [autoStartKnockout, initialCode, handleStartKnockout, user?.id]);

  // Guest enters name → straight to knockout with random highly rated movies
  const handleGuestKnockoutStart = useCallback(() => {
    if (!knockoutGuestName.trim()) return;
    setChallengerName(knockoutGuestName.trim());
    handleStartKnockout();
  }, [knockoutGuestName, handleStartKnockout]);

  const handleKnockoutComplete = useCallback(async (picks: BracketPick[], winner: BracketMovie) => {
    setBracketPicks(picks);
    setBracketWinner(winner);

    // Record bracket comparisons into the taste graph (VS only, not Decide)
    recordBracketInTasteGraph(bracketMovies, picks);

    // If this is a challenger completing a shared bracket, submit picks
    if (knockoutChallenge && knockoutChallenge.creator_picks) {
      const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || challengerName || 'Guest';
      const { challenge: updated } = await knockoutService.submitChallengerPicks(
        knockoutChallenge.id,
        picks,
        winner,
        user?.id || null,
        displayName,
        knockoutChallenge.creator_picks,
        bracketMovies.length,
      );
      if (updated) setKnockoutChallenge(updated);
      setStep('knockout-result');
      return;
    }

    // Creator finishing — save to DB to generate share code
    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || challengerName || 'Guest';
    const { challenge: created } = await knockoutService.createChallenge(
      bracketMovies,
      knockoutSeed,
      picks,
      winner,
      user?.id || null,
      displayName,
      targetFriendId || null,
    );
    if (created) setKnockoutChallenge(created);

    // If directed challenge, show "challenge sent" confirmation first
    if (targetFriendId) {
      setStep('knockout-sent');
    } else {
      setStep('knockout-result');
    }
  }, [knockoutChallenge, bracketMovies, knockoutSeed, user, challengerName, targetFriendId, recordBracketInTasteGraph]);

  const handleKnockoutPackSelect = useCallback(async (pack: CuratedPack) => {
    setLoading(true);

    const { data: movieData } = await supabase
      .from('movies')
      .select('id, title, year, poster_url')
      .in('id', pack.movieIds);

    if (movieData && movieData.length >= 16) {
      const pool: BracketMovie[] = movieData.map(m => ({
        id: m.id,
        title: m.title,
        posterUrl: m.poster_url || '',
        year: m.year,
      }));

      const bracket = createVsBracket(pool);
      setBracketMovies(bracket);
      setBracketPicks([]);
      setBracketWinner(null);
      setShowPacks(false);
      setStep('knockout');
    } else {
      setError('Not enough movies in this pack for a knockout bracket');
    }

    setLoading(false);
  }, []);

  // ============================================
  // JOIN CODE FROM HOME SCREEN INPUT
  // ============================================

  const handleJoinCodeInput = useCallback(async (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setJoinCodeInput(cleaned);
    if (cleaned.length === 6) {
      setLoading(true);

      // Knockout challenge lookup (previously this box only checked the
      // retired pool-VS table, so typed knockout codes failed)
      const kc = await knockoutService.getChallengeByCode(cleaned);
      if (kc) {
        setKnockoutChallenge(kc);
        setBracketMovies(kc.movies);
        if (kc.status === 'complete') {
          setBracketPicks(kc.challenger_picks || kc.creator_picks || []);
          setBracketWinner(kc.challenger_winner || kc.creator_winner || null);
          setStep('knockout-result');
        } else {
          setBracketPicks([]);
          setBracketWinner(null);
          if (user?.id) {
            const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
            setChallengerName(displayName);
            setStep('knockout');
          } else {
            setStep('knockout-name');
          }
        }
        setLoading(false);
        setJoinCodeInput('');
        return;
      }

      setError('Challenge not found');
      setLoading(false);
      setJoinCodeInput('');
    }
  }, [user]);

  // ============================================
  // FRIEND SEARCH + ACTIONS
  // ============================================

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!user?.id || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const results = await friendService.searchUsers(query, user.id);
    setSearchResults(results);
    setSearching(false);
  }, [user?.id]);

  const handleSendRequest = useCallback(async (targetUserId: string) => {
    if (!user?.id) return;
    await friendService.sendFriendRequest(targetUserId);
    // Refresh search to update status
    handleSearch(searchQuery);
  }, [user?.id, searchQuery, handleSearch]);

  const handleAcceptRequest = useCallback(async (requestId: string) => {
    await friendService.acceptFriendRequest(requestId);
    if (user?.id) {
      const [friendsData, requestsData] = await Promise.all([
        friendService.getFriends(user.id),
        friendService.getPendingRequests(user.id),
      ]);
      setFriends(friendsData);
      setFriendRequests(requestsData);
    }
  }, [user?.id]);

  const handleRejectRequest = useCallback(async (requestId: string) => {
    await friendService.rejectFriendRequest(requestId);
    setFriendRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  // ============================================
  // QUICK CHALLENGE FROM FRIEND ROW
  // ============================================
  // Plays a knockout targeted at the friend — on completion the bracket is
  // sent to them directly (same bracket, taste match on their finish).

  const handleQuickChallenge = useCallback(async (friend: FriendWithProfile) => {
    if (!user?.id) return;
    setTargetFriendId(friend.friend_id);
    setTargetFriendName(friend.friend?.display_name || undefined);
    haptics.light();
    await handleStartKnockout();
  }, [user?.id, haptics, handleStartKnockout]);

  // ============================================
  // FRIEND ACCORDION
  // ============================================

  const handleFriendTap = useCallback(async (friend: FriendWithProfile) => {
    if (expandedFriendId === friend.friend_id) {
      setExpandedFriendId(null);
      return;
    }
    setExpandedFriendId(friend.friend_id);
    // Load friend's top movies if not cached
    if (!friendTopMovies.has(friend.friend_id)) {
      const rankings = await friendService.getFriendRankings(friend.friend_id, user?.id || '');
      setFriendTopMovies(prev => new Map(prev).set(
        friend.friend_id,
        rankings.slice(0, 5).map(r => ({ title: r.title }))
      ));
    }
  }, [expandedFriendId, friendTopMovies, user?.id]);

  // ============================================
  // RENDER HELPERS
  // ============================================

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <Text style={styles.headerTitle}>challenge</Text>
    </View>
  );

  // HOME: unified VS flow
  const renderHome = () => {
    const isGuestUser = !user?.id;
    const hasContent = friends.length > 0;

    // Guest or signed-in user with no challenges/friends: focused empty state
    if (!hasContent && !showSearch && !showPacks) {
      return (
        <View style={[styles.homeScroll, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
          <Text style={styles.vsTitle}>VS</Text>
          <Text style={[styles.emptyPrompt, { textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl, fontSize: 13, lineHeight: 20, letterSpacing: 0.5, textTransform: 'uppercase' }]}>
            {isGuestUser
              ? 'SOMEONE CHALLENGED YOU?\nENTER THEIR CODE TO PLAY.'
              : '16 MOVIES. 4 ROUNDS.\nONE LAST MOVIE STANDING.'}
          </Text>

          {/* Primary: Knockout bracket — guests get pack picker, signed-in users get their movies */}
          <Pressable
            style={[styles.primaryCta, { width: '100%', maxWidth: 320 }, loading && styles.actionButtonDisabled]}
            onPress={isGuestUser ? () => setShowPacks(true) : handleStartKnockout}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={styles.primaryCtaText}>KNOCKOUT</Text>
            )}
          </Pressable>

          <TextInput
            style={[styles.codeInputInline, { maxWidth: 320, width: '100%' }]}
            placeholder={isGuestUser ? 'ENTER YOUR CODE' : 'HAVE A CODE? ENTER IT HERE'}
            placeholderTextColor={colors.textMuted}
            value={joinCodeInput}
            onChangeText={handleJoinCodeInput}
            maxLength={6}
            autoCapitalize="characters"
          />

          {isGuestUser && onOpenAuth && (
            <Pressable
              style={[styles.primaryCta, { width: '100%', maxWidth: 320, marginTop: spacing.md }]}
              onPress={onOpenAuth}
            >
              <Text style={styles.primaryCtaText}>JOIN AAYBEE TO PLAY</Text>
            </Pressable>
          )}

          {error && (
            <Text style={[styles.errorText, { marginTop: spacing.md }]}>{error}</Text>
          )}
        </View>
      );
    }

    return (
    <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeScrollContent}>
      <Text style={styles.vsTitle}>VS</Text>

      {/* Primary CTA: Knockout bracket */}
      <Pressable
        style={[styles.primaryCta, loading && styles.actionButtonDisabled]}
        onPress={handleStartKnockout}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={styles.primaryCtaText}>KNOCKOUT</Text>
        )}
      </Pressable>

      {/* Always-visible code input */}
      <TextInput
        style={styles.codeInputInline}
        placeholder="ENTER A CODE"
        placeholderTextColor={colors.textMuted}
        value={joinCodeInput}
        onChangeText={handleJoinCodeInput}
        maxLength={6}
        autoCapitalize="characters"
      />

      {/* Curated Pack Selection */}
      {showPacks && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.packsSection}>
          <Text style={styles.sectionLabel}>pick a category to challenge with</Text>
          {CURATED_PACKS.map(pack => (
            <Pressable
              key={pack.id}
              style={styles.packCard}
              onPress={() => handleKnockoutPackSelect(pack)}
            >
              <Text style={styles.packTitle}>{pack.title}</Text>
              <Text style={styles.packSubtitle}>{pack.subtitle}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setShowPacks(false)}>
            <Text style={styles.packCancel}>cancel</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* YOUR PEOPLE - friends leaderboard (only if friends exist) */}
      {(friends.length > 0 || (user?.id && showSearch)) && (
        <Animated.View entering={FadeInDown.delay(100)} style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>your people</Text>
            {user?.id && (
              <View style={styles.headerActions}>
                {Platform.OS !== 'web' && (
                  <Pressable onPress={() => setShowContacts(!showContacts)} style={styles.subtleAction}>
                    <Text style={styles.subtleActionText}>contacts</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setShowQr(!showQr)} style={styles.subtleAction}>
                  <Text style={styles.subtleActionText}>QR</Text>
                </Pressable>
                <Pressable onPress={() => setShowSearch(!showSearch)} style={styles.subtleAction}>
                  <Text style={styles.subtleActionText}>+ add</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* QR expansion */}
          {showQr && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.qrSection}>
              {user?.id && (
                <QRCode
                  value={`https://aaybee.netlify.app/?ref=${user.id}`}
                  size={140}
                  backgroundColor="transparent"
                  color="#F5F5F5"
                />
              )}
              <Text style={styles.qrHint}>friends can scan to add you</Text>
            </Animated.View>
          )}

          {/* Contact book invite (shown on native when contacts tapped) */}
          {showContacts && (
            <Animated.View entering={FadeIn.duration(200)} style={{ maxHeight: 320 }}>
              <ContactInvite onClose={() => setShowContacts(false)} />
            </Animated.View>
          )}

          {/* Inline search (shown when + add tapped) */}
          {showSearch && (
            <Animated.View entering={FadeIn.duration(200)}>
              <TextInput
                style={styles.searchInput}
                placeholder="search people..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  handleSearch(text);
                }}
                autoFocus
                autoCapitalize="none"
              />
              {/* Search results */}
              {searchResults.map(result => (
                <View key={result.id} style={styles.searchResultRow}>
                  <Text style={styles.searchResultName}>{result.display_name}</Text>
                  {result.is_friend ? (
                    <Text style={styles.searchResultStatus}>friends</Text>
                  ) : result.request_pending ? (
                    <Text style={styles.searchResultStatus}>pending</Text>
                  ) : (
                    <Pressable onPress={() => handleSendRequest(result.id)} style={styles.addButton}>
                      <Text style={styles.addButtonText}>add</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {/* Pending requests inline */}
              {friendRequests.length > 0 && (
                <View style={{ marginTop: spacing.sm }}>
                  <Text style={[styles.sectionLabel, { marginBottom: spacing.xs }]}>{friendRequests.length} pending</Text>
                  {friendRequests.map(req => (
                    <View key={req.id} style={styles.requestRow}>
                      <Text style={styles.requestName}>{req.from_user.display_name}</Text>
                      <View style={styles.requestActions}>
                        <Pressable style={styles.acceptButton} onPress={() => handleAcceptRequest(req.id)}>
                          <Text style={styles.acceptText}>accept</Text>
                        </Pressable>
                        <Pressable onPress={() => handleRejectRequest(req.id)}>
                          <Text style={styles.rejectText}>decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          )}

          {/* Friend leaderboard */}
          {friends.length > 0 ? (
            friends
              .map(friend => {
                const name = friend.friend?.display_name || 'Anonymous';
                const avgMatch = friend.taste_match ? Math.round(friend.taste_match) : null;
                const gameCount = (friend as any).games_played || 0;
                return { friend, name, avgMatch, gameCount };
              })
              .sort((a, b) => (b.avgMatch ?? -1) - (a.avgMatch ?? -1))
              .map(({ friend, name, avgMatch, gameCount }, rank) => {
                const isExpanded = expandedFriendId === friend.friend_id;
                const topMovies = friendTopMovies.get(friend.friend_id);
                const rankLabel = avgMatch !== null && rank < 3 ? `#${rank + 1}` : '';
                return (
                  <Animated.View key={friend.friend_id} entering={FadeInDown.delay(150 + rank * 50)}>
                    <View style={styles.friendRow}>
                      {rankLabel ? (
                        <Text style={styles.rankBadge}>{rankLabel}</Text>
                      ) : (
                        <View style={styles.rankSpacer} />
                      )}
                      <Pressable style={styles.friendInfo} onPress={() => handleFriendTap(friend)}>
                        <Text style={styles.friendName}>{name}</Text>
                        <Text style={styles.friendMatch}>
                          {avgMatch !== null ? `${avgMatch}% match` : '\u2014'}
                          {gameCount > 0 ? `  ${gameCount} game${gameCount !== 1 ? 's' : ''}` : ''}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.challengeButton} onPress={() => handleQuickChallenge(friend)}>
                        <Text style={styles.challengeButtonLabel}>challenge</Text>
                      </Pressable>
                    </View>
                    {isExpanded && (
                      <Animated.View entering={FadeIn.duration(200)} style={styles.friendExpanded}>
                        {topMovies && topMovies.length > 0 && (
                          <Text style={styles.friendMovies}>
                            top 5: {topMovies.map(m => m.title).join(', ')}
                          </Text>
                        )}
                        <Text style={styles.friendStat}>
                          {gameCount > 0 ? `${gameCount} game${gameCount !== 1 ? 's' : ''} played` : 'no challenges yet'}
                        </Text>
                      </Animated.View>
                    )}
                  </Animated.View>
                );
              })
          ) : null}
        </Animated.View>
      )}

      {/* +add prompt when no friends and search not open */}
      {friends.length === 0 && !showSearch && user?.id && (
        <View style={styles.sectionBlock}>
          <Pressable onPress={() => setShowSearch(true)}>
            <Text style={styles.emptyPrompt}>add friends to challenge them +</Text>
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable onPress={() => setShowContacts(true)} style={{ marginTop: spacing.sm }}>
              <Text style={[styles.emptyPrompt, { color: colors.accent }]}>find from contacts</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Pending requests badge (when search is closed) */}
      {!showSearch && friendRequests.length > 0 && (
        <Pressable onPress={() => setShowSearch(true)}>
          <Text style={styles.pendingBadge}>{friendRequests.length} pending request{friendRequests.length !== 1 ? 's' : ''} ›</Text>
        </Pressable>
      )}


      {error && <Text style={styles.errorText}>{error}</Text>}
    </ScrollView>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>

      {loading && step === 'home' ? (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <>
          {step === 'home' && renderHome()}
          {step === 'knockout-name' && (
            <View style={styles.centeredContent}>
              <Text style={styles.vsTitle}>VS</Text>
              <Text style={[styles.emptyPrompt, { textAlign: 'center', marginBottom: spacing.xl, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                WHAT'S YOUR NAME?
              </Text>
              <TextInput
                style={[styles.codeInputInline, { maxWidth: 320, width: '100%' }]}
                placeholder="ENTER NAME"
                placeholderTextColor={colors.textMuted}
                value={knockoutGuestName}
                onChangeText={setKnockoutGuestName}
                maxLength={20}
                autoFocus
                autoCapitalize="words"
                onSubmitEditing={handleGuestKnockoutStart}
              />
              <Pressable
                style={[styles.primaryCta, { width: '100%', maxWidth: 320, marginTop: spacing.md }, !knockoutGuestName.trim() && styles.actionButtonDisabled]}
                onPress={handleGuestKnockoutStart}
                disabled={!knockoutGuestName.trim()}
              >
                <Text style={styles.primaryCtaText}>START</Text>
              </Pressable>
              {onOpenAuth && (
                <View style={{ marginTop: spacing.xxl, alignItems: 'center', width: '100%', maxWidth: 320 }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.md }}>OR</Text>
                  <Pressable
                    style={[styles.secondaryCta, { width: '100%' }]}
                    onPress={onOpenAuth}
                  >
                    <Text style={styles.secondaryCtaText}>SIGN IN</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          {step === 'knockout-sent' && knockoutChallenge && (
            <View style={styles.centeredContent}>
              <Text style={styles.vsTitle}>CHALLENGE SENT</Text>
              <Text style={[styles.emptyPrompt, { textAlign: 'center', marginBottom: spacing.xl, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                {targetFriendName ? `${targetFriendName.toUpperCase()} WILL SEE IT NEXT TIME THEY OPEN THE APP` : 'YOUR FRIEND WILL SEE THE CHALLENGE'}
              </Text>
              <Pressable
                style={[styles.primaryCta, { width: '100%', maxWidth: 320 }]}
                onPress={() => setStep('knockout-result')}
              >
                <Text style={styles.primaryCtaText}>SEE YOUR BRACKET</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryCta, { width: '100%', maxWidth: 320, marginTop: spacing.md }]}
                onPress={() => setStep('home')}
              >
                <Text style={styles.secondaryCtaText}>DONE</Text>
              </Pressable>
            </View>
          )}
          {step === 'knockout' && (
            <BracketPlay
              movies={bracketMovies}
              initialPicks={bracketPicks}
              onPick={(picks) => setBracketPicks(picks)}
              onComplete={handleKnockoutComplete}
              onBack={() => setStep('home')}
            />
          )}
          {step === 'knockout-result' && bracketWinner && (
            <BracketResults
              movies={bracketMovies}
              picks={bracketPicks}
              winnerMovie={bracketWinner}
              playerName={challengerName || undefined}
              shareUrl={knockoutChallenge ? `https://aaybee.netlify.app/vs/${knockoutChallenge.code}` : undefined}
              matchPercent={knockoutChallenge?.match_percent ?? undefined}
              sameWinner={knockoutChallenge?.same_winner ?? undefined}
              creatorName={knockoutChallenge?.creator_name}
              challengerName={knockoutChallenge?.challenger_name ?? undefined}
              knockoutChallenge={knockoutChallenge}
              isGuest={!user?.id}
              onSignUp={onOpenAuth}
              onPlayAgain={handleStartKnockout}
              onChallengeFriend={onChallengeFriend}
              onHome={() => onGoHome ? onGoHome() : setStep('home')}
            />
          )}
        </>
      )}

    </View>
  );
}

// ============================================
// HELPERS
// ============================================

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
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

  // Primary CTA
  primaryCta: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryCtaText: {
    fontSize: 14,
    color: colors.background,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  // Secondary CTA
  secondaryCta: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  secondaryCtaText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Inline code input
  codeInputInline: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: spacing.lg,
  },

  // Buttons
  actionButton: {
    backgroundColor: colors.accent,
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
    alignSelf: 'center',
    marginTop: spacing.md,
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
    alignItems: 'center',
  },
  codeLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
    marginBottom: spacing.xs,
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

  // Pairwise ranking (matches DailyScreen comparison layout)
  rankContainer: {
    flexGrow: 1,
  },
  comparisonContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  rankPrompt: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
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
  guestPrompt: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },

  // Leaderboard (kept for compatibility)
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

  // Home scroll
  homeScroll: { flex: 1 },
  homeScrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },

  // Search
  searchInput: {
    ...typography.body, color: colors.textPrimary,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  // Section header row
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
  vsTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  qrSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  qrHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  shareLinkButton: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  shareLinkText: {
    ...typography.caption,
    color: colors.accent,
  },
  emptyPrompt: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  pendingBadge: {
    ...typography.caption,
    color: colors.accent,
    paddingVertical: spacing.sm,
  },
  searchResultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  searchResultName: { ...typography.body, color: colors.textPrimary },
  searchResultStatus: { ...typography.caption, color: colors.textMuted },
  addButton: {
    paddingVertical: 4, paddingHorizontal: spacing.md,
    backgroundColor: colors.accentSubtle, borderRadius: borderRadius.md,
  },
  addButtonText: { ...typography.caption, color: colors.accent, fontWeight: '600' },

  // Section blocks
  sectionBlock: { marginTop: spacing.lg },
  sectionLabel: {
    ...typography.captionMedium, color: colors.textMuted,
    textTransform: 'uppercase' as any, letterSpacing: 1.5, marginBottom: spacing.sm,
    fontSize: 11,
  },

  // Friend rows
  friendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs,
  },
  friendInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  friendName: { ...typography.bodyMedium, color: colors.textPrimary },
  friendMatch: { ...typography.caption, color: colors.textMuted },
  challengeButton: {
    paddingVertical: 4, paddingHorizontal: spacing.sm,
    backgroundColor: colors.accentSubtle, borderRadius: borderRadius.sm,
  },
  challengeButtonLabel: { ...typography.caption, color: colors.accent, fontWeight: '600', fontSize: 11 },
  rankBadge: {
    ...typography.caption, color: colors.accent, fontWeight: '700',
    width: 24, textAlign: 'center',
  },
  rankSpacer: { width: 24 },
  friendExpanded: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  friendMovies: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  friendStat: { ...typography.caption, color: colors.textMuted },

  // Requests
  requestRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  requestName: { ...typography.body, color: colors.textPrimary },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  acceptButton: {
    paddingVertical: 4, paddingHorizontal: spacing.md,
    backgroundColor: colors.accent, borderRadius: borderRadius.sm,
  },
  acceptText: { ...typography.caption, color: colors.background, fontWeight: '600' },
  rejectText: { ...typography.caption, color: colors.textMuted },

  // Challenge rows
  challengeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: borderRadius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs,
  },
  challengeRowName: { ...typography.body, color: colors.textPrimary },
  challengeRowStatus: { ...typography.caption, color: colors.textMuted },

  // Curated packs
  packsSection: {
    marginBottom: spacing.lg,
  },
  packCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  packTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  packSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  packCancel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center' as const,
    paddingVertical: spacing.sm,
  },
  circlePrompt: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center' as const,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
});
