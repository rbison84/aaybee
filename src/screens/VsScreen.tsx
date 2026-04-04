import React, { useState, useEffect, useCallback, useRef } from 'react';
import ViewShot from 'react-native-view-shot';
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
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QRCode } from '../components/QRCode';
import { useAuth } from '../contexts/AuthContext';
import { useAppDimensions } from '../contexts/DimensionsContext';
import { friendService, FriendWithProfile } from '../services/friendService';
import { shareService, storeLastDisagreement } from '../services/shareService';
import { ShareableVsResult } from '../components/ShareableImages';
import { vsService, VsChallenge, VsMovie, VsPair, VsResults } from '../services/vsService';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

// ============================================
// TYPES
// ============================================

type VsStep =
  | 'home'                  // list of challenges + create new
  | 'friend-select'         // pick a friend or enter code
  | 'waiting'               // waiting for challenged (manual async)
  | 'selecting'             // challenged picks 10 from 16
  | 'challenged_comparing'  // challenged does A/B picks
  | 'challenger_comparing'  // challenger does A/B picks
  | 'waiting_for_challenger' // challenged done, waiting for challenger
  | 'reveal'                // dramatic round-by-round reveal
  | 'result';               // final score + share

interface VsScreenProps {
  onClose: () => void;
  initialCode?: string; // Deep link: auto-join this challenge code
}

// ============================================
// COMPONENT
// ============================================

export function VsScreen({ onClose, initialCode }: VsScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;

  const [step, setStep] = useState<VsStep>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Home state
  const [challenges, setChallenges] = useState<VsChallenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(true);

  // Friend select state
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [joinCode, setJoinCode] = useState(initialCode || '');

  // Active challenge state
  const [activeChallenge, setActiveChallenge] = useState<VsChallenge | null>(null);

  // Selecting state
  const [selectedMovieIds, setSelectedMovieIds] = useState<Set<string>>(new Set());

  // Guest name
  const [guestName, setGuestName] = useState('');

  // Comparing state
  const [currentPairIndex, setCurrentPairIndex] = useState(0);

  // Result state
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Reveal state
  const [revealIndex, setRevealIndex] = useState(-1);
  const [runningScore, setRunningScore] = useState(0);
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Share card ref
  const shareCardRef = useRef<ViewShot>(null);

  // Subscription channel ref
  const subscriptionRef = useRef<any>(null);

  // Prevent double-tap on picks
  const pickingRef = useRef(false);

  // Guest mode — playing without an account
  const isGuest = !user?.id;

  // ============================================
  // DATA LOADING
  // ============================================

  const loadChallenges = useCallback(async () => {
    if (!user?.id) { setLoadingChallenges(false); return; }
    setLoadingChallenges(true);
    const data = await vsService.getMyChallenges(user.id);
    setChallenges(data);
    setLoadingChallenges(false);
  }, [user?.id]);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  // Auto-open when given a code: join if needed, or resume existing challenge
  const autoJoinAttempted = useRef(false);
  useEffect(() => {
    if (initialCode && !autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      if (!user?.id) {
        handleGuestJoin();
        return;
      }
      // Try loading the challenge first to see if we're already part of it
      (async () => {
        try {
          const existing = await vsService.getChallengeByCode(initialCode.trim());
          if (existing && (existing.challenger_id === user.id || existing.challenged_id === user.id)) {
            // Already part of this challenge — open it directly
            handleOpenChallenge(existing);
          } else {
            // Not yet joined — join it
            handleJoinByCode();
          }
        } catch (err) {
          console.error('[VsScreen] Auto-join failed:', err);
          setError('Failed to load challenge');
        }
      })();
    }
  }, [initialCode, user?.id]);

  const loadFriends = useCallback(async () => {
    if (!user?.id) return;
    const data = await friendService.getFriends(user.id);
    setFriends(data);
  }, [user?.id]);

  // ============================================
  // ACTIONS
  // ============================================

  const handleCreateChallenge = useCallback(async (friendId: string | null, friendName?: string) => {
    if (!user?.id) {
      setError('Sign in to create a challenge');
      return;
    }
    setLoading(true);
    setError(null);

    const { challenge, error: err } = await vsService.createChallenge(user.id, friendId, friendName);
    setLoading(false);

    if (err || !challenge) {
      setError(err || 'Failed to create challenge');
      return;
    }

    setActiveChallenge(challenge);
    setStep('waiting');
  }, [user?.id]);

  const handleJoinByCode = useCallback(async () => {
    if (!user?.id || !joinCode.trim()) return;
    setLoading(true);
    setError(null);

    // Get user display name
    const { data: profile } = await (await import('../services/supabase')).supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const { challenge, error: err } = await vsService.joinChallenge(
      joinCode.trim(),
      user.id,
      profile?.display_name || 'Anonymous'
    );
    setLoading(false);

    if (err || !challenge) {
      setError(err || 'Failed to join challenge');
      return;
    }

    setActiveChallenge(challenge);
    setStep('selecting');
  }, [user?.id, joinCode]);

  const clearRevealTimers = useCallback(() => {
    revealTimersRef.current.forEach(t => clearTimeout(t));
    revealTimersRef.current = [];
  }, []);

  const startReveal = useCallback((challenge: VsChallenge) => {
    // Clear any existing reveal timers first
    clearRevealTimers();
    setRevealIndex(-1);
    setRunningScore(0);

    // Reveal one pair every 2 seconds
    let index = 0;
    let score = 0;

    const revealNext = () => {
      if (index >= challenge.pairs.length) return;
      const pair = challenge.pairs[index];
      if (pair.match) score++;
      setRevealIndex(index);
      setRunningScore(score);
      index++;

      if (index < challenge.pairs.length) {
        const t = setTimeout(revealNext, 2000);
        revealTimersRef.current.push(t);
      } else {
        // After last pair, show final result after delay
        const t = setTimeout(() => {
          setStep('result');
        }, 2500);
        revealTimersRef.current.push(t);
      }
    };

    // Start after initial delay
    const t = setTimeout(revealNext, 1000);
    revealTimersRef.current.push(t);
  }, [clearRevealTimers]);

  // Subscribe to real-time updates on the active challenge.
  // Only needed on passive waiting steps — not during active comparing, reveal, or result.
  const needsSubscription = step === 'waiting' || step === 'waiting_for_challenger';
  useEffect(() => {
    if (!activeChallenge?.id || !needsSubscription) return;

    subscriptionRef.current = vsService.subscribeToChallenge(
      activeChallenge.id,
      (updated) => {
        setActiveChallenge(updated);

        if (updated.status === 'challenger_comparing' && step === 'waiting') {
          // Challenged user finished — it's now the challenger's turn
          setCurrentPairIndex(updated.challenger_current_pair || 0);
          setStep('challenger_comparing');
        }
        if (updated.status === 'complete' && step === 'waiting_for_challenger') {
          // Challenger finished — go to reveal
          setStep('reveal');
          startReveal(updated);
        }
      }
    );

    return () => {
      if (subscriptionRef.current) {
        vsService.unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [activeChallenge?.id, needsSubscription, step, startReveal]);

  // Guest join: join the challenge as an anonymous user, writes to DB
  const handleGuestJoin = useCallback(async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);

    // Try to load challenge first — if already joined, open it
    const existing = await vsService.getChallengeByCode(joinCode.trim());
    if (existing && existing.status === 'complete') {
      setLoading(false);
      setActiveChallenge(existing);
      setStep('reveal');
      startReveal(existing);
      return;
    }

    // Join as guest — update challenge name and status without setting challenged_id
    const { challenge, error: err } = await vsService.joinChallengeAsGuest(
      joinCode.trim(),
      guestName.trim() || 'Guest'
    );
    setLoading(false);

    if (err || !challenge) {
      setError(err || 'Challenge not found or expired');
      return;
    }

    setActiveChallenge(challenge);
    setStep('selecting');
  }, [joinCode, startReveal]);

  const handleSelectMovie = useCallback((movieId: string) => {
    setSelectedMovieIds(prev => {
      const next = new Set(prev);
      if (next.has(movieId)) {
        next.delete(movieId);
      } else if (next.size < 10) {
        next.add(movieId);
      }
      return next;
    });
  }, []);

  const handleConfirmSelection = useCallback(async () => {
    if (!activeChallenge || selectedMovieIds.size < 4) return;
    setLoading(true);

    const selectedMovies = activeChallenge.pool.filter(m => selectedMovieIds.has(m.id));

    const { pairs, error: err } = await vsService.selectMovies(activeChallenge.id, selectedMovies);
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    setActiveChallenge(prev => prev ? { ...prev, pairs, status: 'challenged_comparing', current_pair: 0 } : null);
    setCurrentPairIndex(0);
    setStep('challenged_comparing');
  }, [activeChallenge, selectedMovieIds]);

  const handlePick = useCallback(async (pick: 'A' | 'B') => {
    if (!activeChallenge || pickingRef.current) return;
    pickingRef.current = true;

    // Determine role by user ID, not step name
    const role: 'challenged' | 'challenger' =
      activeChallenge.challenger_id === user?.id ? 'challenger' : 'challenged';

    // Update local pairs
    const updatedPairs = [...activeChallenge.pairs];
    if (role === 'challenged') {
      updatedPairs[currentPairIndex] = { ...updatedPairs[currentPairIndex], challengedPick: pick };
    } else {
      updatedPairs[currentPairIndex] = { ...updatedPairs[currentPairIndex], challengerPick: pick };
    }

    setLoading(true);
    const { isComplete, score, error: err } = await vsService.submitPick(
      activeChallenge.id,
      currentPairIndex,
      pick,
      role
    );
    setLoading(false);
    pickingRef.current = false;

    if (err) {
      setError(err);
      return;
    }

    if (isComplete && role === 'challenged') {
      // Challenged done — show waiting screen for challenger
      setActiveChallenge(prev => prev ? { ...prev, pairs: updatedPairs, status: 'challenger_comparing' as const } : null);
      setStep('waiting_for_challenger');
    } else if (isComplete && role === 'challenger') {
      // Challenger done — compute matches locally and show reveal
      const finalPairs = updatedPairs.map(p => ({
        ...p,
        match: p.challengerPick === p.challengedPick,
      }));
      const finalChallenge = {
        ...activeChallenge,
        pairs: finalPairs,
        status: 'complete' as const,
        score: score!,
      };
      setActiveChallenge(finalChallenge);
      setStep('reveal');
      startReveal(finalChallenge);
    } else {
      setActiveChallenge(prev => prev ? { ...prev, pairs: updatedPairs } : null);
      setCurrentPairIndex(currentPairIndex + 1);
    }
  }, [activeChallenge, currentPairIndex, user?.id, startReveal]);



  // Cleanup reveal timers and subscription on unmount
  useEffect(() => {
    return () => {
      clearRevealTimers();
      if (subscriptionRef.current) {
        vsService.unsubscribe(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [clearRevealTimers]);

  const handleShare = useCallback(async () => {
    if (!activeChallenge) return;
    const score = activeChallenge.score || 0;
    const results = activeChallenge.results;
    const url = shareService.getVsShareUrl(activeChallenge.code, user?.id);
    let message: string;

    if (results?.biggestDisagreement) {
      const d = results.biggestDisagreement;
      // Determine perspective: current user is challenger or challenged
      const isChallenger = user?.id === activeChallenge.challenger_id;
      const myPick = isChallenger ? d.challengerPick : d.challengedPick;
      const theirPick = isChallenger ? d.challengedPick : d.challengerPick;
      const theirName = isChallenger ? results.challengedName : results.challengerName;
      message = `i think ${myPick} beats ${theirPick}. ${theirName} disagrees. who's right? ${url}`;
      storeLastDisagreement(`i think ${myPick} beats ${theirPick}. my friend disagrees. who's right?`);
    } else {
      const total = activeChallenge.pairs?.length || 10;
      message = `we scored ${score}/${total} on aaybee vs! how similar are your movie tastes? try it: ${url}`;
    }

    try {
      // Try to share as image on native
      if (Platform.OS !== 'web' && shareCardRef.current) {
        try {
          const uri = await (shareCardRef.current as any).capture();
          if (uri) {
            await Share.share(Platform.OS === 'ios' ? { url: uri, message } : { message });
            return;
          }
        } catch {}
      }
      await Share.share({ message });
    } catch (e) {
      // Ignore
    }
  }, [activeChallenge, user?.id]);

  const handleShareCode = useCallback(async () => {
    if (!activeChallenge) return;
    const url = shareService.getVsShareUrl(activeChallenge.code, user?.id);
    const message = `i challenged you on aaybee vs! join with code: ${activeChallenge.code}\n\n${url}`;
    try {
      await Share.share({ message });
    } catch (e) {
      // Ignore
    }
  }, [activeChallenge, user?.id]);

  const handleOpenChallenge = useCallback((challenge: VsChallenge) => {
    setActiveChallenge(challenge);

    if (challenge.status === 'complete') {
      if (challenge.results) {
        setStep('result');
      } else {
        setStep('reveal');
        startReveal(challenge);
      }
    } else if (challenge.status === 'selecting' && challenge.challenged_id === user?.id) {
      setStep('selecting');
    } else if (challenge.status === 'challenged_comparing' && challenge.challenged_id === user?.id) {
      setCurrentPairIndex(challenge.current_pair);
      setStep('challenged_comparing');
    } else if (challenge.status === 'challenger_comparing' && challenge.challenger_id === user?.id) {
      // It's the challenger's turn to pick
      setCurrentPairIndex(challenge.challenger_current_pair || 0);
      setStep('challenger_comparing');
    } else if (challenge.status === 'challenger_comparing' && challenge.challenged_id === user?.id) {
      // Challenged is done, waiting for challenger
      setStep('waiting_for_challenger');
    } else if (challenge.challenger_id === user?.id) {
      setStep('waiting');
    }
  }, [user?.id, startReveal]);

  const handleBack = useCallback(() => {
    clearRevealTimers();
    setError(null);

    switch (step) {
      case 'friend-select':
      case 'waiting':
      case 'waiting_for_challenger':
      case 'result':
        setStep('home');
        setActiveChallenge(null);
        setSelectedMovieIds(new Set());
        loadChallenges();
        break;
      case 'selecting':
        setStep('home');
        setActiveChallenge(null);
        setSelectedMovieIds(new Set());
        break;
      case 'reveal':
        setStep('result');
        break;
      default:
        onClose();
    }
  }, [step, onClose, loadChallenges, clearRevealTimers]);

  // ============================================
  // RENDERS
  // ============================================

  const renderHeader = (title: string, showBack = true) => (
    <View style={[headerStyles.container, { paddingTop: insets.top + spacing.xs }]}>
      <View style={headerStyles.content}>
        {showBack ? (
          <Pressable style={headerStyles.backButton} onPress={handleBack}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M15 18l-6-6 6-6" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ) : <View style={{ width: 40 }} />}
        <Text style={headerStyles.title}>{title}</Text>
        <Pressable style={headerStyles.closeButton} onPress={onClose}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
    </View>
  );

  // ---------- HOME ----------
  const renderHome = () => {
    const hasNoChallenges = !loadingChallenges && challenges.length === 0;

    // Empty state: focused get-started prompt (both guest and signed-in new users)
    if (hasNoChallenges) {
      return (
        <View style={styles.container}>
          {renderHeader('aaybee vs', false)}
          <View style={[styles.centeredContent, { paddingHorizontal: spacing.xl }]}>
            <Text style={styles.heroTitle}>vs</Text>
            <Text style={[styles.heroSubtitle, { marginTop: spacing.sm, marginBottom: spacing.xl }]}>
              {isGuest
                ? 'compare your movie taste with friends.\njoin aaybee to start challenging.'
                : 'find out who has better taste.\nchallenge a friend — it takes 30 seconds.'}
            </Text>

            {isGuest ? (
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary, { width: '100%', maxWidth: 320 }]}
                onPress={onClose}
              >
                <Text style={styles.actionButtonTextPrimary}>join aaybee</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary, { width: '100%', maxWidth: 320 }]}
                onPress={() => { setStep('friend-select'); loadFriends(); }}
              >
                <Text style={styles.actionButtonTextPrimary}>challenge a friend</Text>
              </Pressable>
            )}

            <View style={[styles.codeRow, { marginTop: spacing.xxl, maxWidth: 320, width: '100%' }]}>
              <TextInput
                style={styles.codeInput}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="have a code? enter it here"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={6}
              />
              {joinCode.trim().length > 0 && (
                <Pressable
                  style={[styles.actionButton, styles.actionButtonSmall]}
                  onPress={isGuest ? handleGuestJoin : handleJoinByCode}
                  disabled={loading}
                >
                  <Text style={styles.actionButtonTextPrimary}>{loading ? '...' : 'join'}</Text>
                </Pressable>
              )}
            </View>

            {error && (
              <Animated.View entering={FadeIn} style={[styles.errorContainer, { marginTop: spacing.md }]}>
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}
          </View>
        </View>
      );
    }

    // Normal home with challenges
    return (
    <View style={styles.container}>
      {renderHeader('aaybee vs', false)}
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>vs</Text>
          <Text style={styles.heroSubtitle}>challenge a friend to compare movies{'\n'}and see how your taste stacks up</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={() => { setStep('friend-select'); loadFriends(); }}
          >
            <Text style={styles.actionButtonTextPrimary}>new challenge</Text>
          </Pressable>
        </View>

        {/* Challenge list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>your challenges</Text>
          {loadingChallenges ? (
            <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xl }} />
          ) : (
            challenges.map(c => (
              <Pressable
                key={c.id}
                style={styles.challengeCard}
                onPress={() => handleOpenChallenge(c)}
              >
                <View style={styles.challengeCardLeft}>
                  <Text style={styles.challengeTitle}>
                    {c.challenger_id === user?.id
                      ? `vs ${c.challenged_name || 'waiting...'}`
                      : `from ${c.results?.challengerName || 'someone'}`}
                  </Text>
                  <Text style={styles.challengeStatus}>
                    {c.status === 'complete'
                      ? `${c.score}/${c.pairs?.length || 10}`
                      : c.status === 'pending'
                        ? 'waiting for response'
                        : c.status === 'selecting'
                          ? 'selecting movies'
                          : c.status === 'challenged_comparing'
                            ? (c.challenged_id === user?.id ? 'your turn to pick' : 'they\'re picking')
                            : c.status === 'challenger_comparing'
                              ? (c.challenger_id === user?.id ? 'your turn to pick' : 'waiting for them')
                              : 'in progress'}
                  </Text>
                </View>
                {c.status === 'complete' && (
                  <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(c.score || 0) }]}>
                    <Text style={styles.scoreBadgeText}>{c.score}/{c.pairs?.length || 10}</Text>
                  </View>
                )}
                {c.status !== 'complete' && (
                  <View style={[styles.scoreBadge, {
                    backgroundColor: (c.status === 'challenger_comparing' && c.challenger_id === user?.id) ||
                                     (c.status === 'challenged_comparing' && c.challenged_id === user?.id)
                      ? colors.accent : colors.surface
                  }]}>
                    <Text style={[styles.scoreBadgeText, {
                      color: (c.status === 'challenger_comparing' && c.challenger_id === user?.id) ||
                             (c.status === 'challenged_comparing' && c.challenged_id === user?.id)
                        ? colors.background : colors.textMuted
                    }]}>
                      {(c.status === 'challenger_comparing' && c.challenger_id === user?.id) ||
                       (c.status === 'challenged_comparing' && c.challenged_id === user?.id)
                        ? 'your turn' : 'pending'}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </View>

        {/* Join by code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>join a challenge</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="enter code"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              maxLength={6}
            />
            <Pressable
              style={[styles.actionButton, styles.actionButtonSmall, !joinCode.trim() && styles.actionButtonDisabled]}
              onPress={handleJoinByCode}
              disabled={!joinCode.trim() || loading}
            >
              <Text style={styles.actionButtonTextPrimary}>
                {loading ? '...' : 'join'}
              </Text>
            </Pressable>
          </View>
        </View>

        {error && (
          <Animated.View entering={FadeIn} style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
    );
  };

  // ---------- FRIEND SELECT ----------
  const renderFriendSelect = () => (
    <View style={styles.container}>
      {renderHeader('choose opponent')}
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        <Text style={styles.sectionSubtitle}>
          pick a friend to challenge — compare 10 movie pairs and see how your taste stacks up
        </Text>

        {friends.length === 0 ? (
          <Text style={styles.emptyText}>no friends yet — add some in your profile!</Text>
        ) : (
          friends.map(f => (
            <Pressable
              key={f.friend.id}
              style={styles.friendCard}
              onPress={() => handleCreateChallenge(f.friend.id, f.friend.display_name)}
              disabled={loading}
            >
              <View style={styles.friendAvatar}>
                <Text style={styles.friendAvatarText}>
                  {f.friend.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{f.friend.display_name}</Text>
                <Text style={styles.friendMeta}>
                  {f.friend.total_comparisons} comparisons
                </Text>
              </View>
            </Pressable>
          ))
        )}

        {/* Non-aaybee option */}
        <View style={styles.divider} />
        <Pressable
          style={styles.friendCard}
          onPress={() => handleCreateChallenge(null, undefined)}
          disabled={loading}
        >
          <View style={[styles.friendAvatar, { backgroundColor: colors.surface }]}>
            <Text style={styles.friendAvatarText}>?</Text>
          </View>
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>someone not on aaybee</Text>
            <Text style={styles.friendMeta}>share a code for them to join</Text>
          </View>
        </Pressable>

        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}
        {error && (
          <Animated.View entering={FadeIn} style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );

  // ---------- WAITING ----------
  const renderWaiting = () => (
    <View style={styles.container}>
      {renderHeader('challenge sent')}
      <View style={styles.centeredContent}>
        <Text style={styles.heroTitle}>vs</Text>
        <Text style={styles.waitingCode}>{activeChallenge?.code}</Text>
        <Text style={styles.waitingHint}>share this code with your friend</Text>

        {activeChallenge?.code && (
          <View style={{ marginTop: spacing.lg, borderRadius: 8, overflow: 'hidden' }}>
            <QRCode
              value={`https://aaybee.netlify.app/vs/${activeChallenge.code}`}
              size={140}
            />
          </View>
        )}

        <Pressable style={[styles.actionButton, styles.actionButtonPrimary, { marginTop: spacing.xxl }]} onPress={handleShareCode}>
          <Text style={styles.actionButtonTextPrimary}>share challenge</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, { marginTop: spacing.md, backgroundColor: colors.surface }]}
          onPress={() => { setStep('home'); setActiveChallenge(null); loadChallenges(); }}
        >
          <Text style={[styles.actionButtonTextPrimary, { color: colors.textSecondary }]}>back to challenges</Text>
        </Pressable>
      </View>
    </View>
  );

  // ---------- WAITING FOR CHALLENGER ----------
  const renderWaitingForChallenger = () => (
    <View style={styles.container}>
      {renderHeader('picks submitted')}
      <View style={styles.centeredContent}>
        <Text style={styles.heroTitle}>vs</Text>
        <Text style={styles.waitingHint}>
          {isGuest
            ? 'your picks are in! the challenger needs to make their picks too. sign up to get notified when results are ready.'
            : 'your picks are in! waiting for the challenger to make their picks.'}
        </Text>

        {isGuest ? (
          <Pressable
            style={[styles.actionButton, styles.actionButtonPrimary, { marginTop: spacing.xxl }]}
            onPress={onClose}
          >
            <Text style={styles.actionButtonTextPrimary}>join aaybee</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.actionButton, { marginTop: spacing.xxl, backgroundColor: colors.surface }]}
            onPress={() => { setStep('home'); setActiveChallenge(null); loadChallenges(); }}
          >
            <Text style={[styles.actionButtonTextPrimary, { color: colors.textSecondary }]}>back to challenges</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // ---------- SELECTING (4-10 from 16) ----------
  const renderSelecting = () => {
    const pool = activeChallenge?.pool || [];
    const count = selectedMovieIds.size;
    const canProceed = count >= 4 && (isGuest ? guestName.trim().length > 0 : true);

    return (
      <View style={styles.container}>
        {renderHeader(`${count} selected`)}
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
          {/* Guest name input */}
          {isGuest && (
            <TextInput
              style={[styles.codeInput, { marginBottom: spacing.md }]}
              placeholder="your name"
              placeholderTextColor={colors.textMuted}
              value={guestName}
              onChangeText={setGuestName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          )}

          <Text style={styles.sectionSubtitle}>
            tap the movies you've seen (at least 4)
          </Text>

          <View style={styles.movieGrid}>
            {pool.map(movie => {
              const isSelected = selectedMovieIds.has(movie.id);
              return (
                <Pressable
                  key={movie.id}
                  style={[
                    styles.movieGridItem,
                    isSelected && styles.movieGridItemSelected,
                    !isSelected && count >= 10 && styles.movieGridItemDisabled,
                  ]}
                  onPress={() => handleSelectMovie(movie.id)}
                >
                  {movie.posterUrl ? (
                    <Image source={{ uri: movie.posterUrl }} style={styles.movieGridPoster} resizeMode="cover" />
                  ) : (
                    <View style={[styles.movieGridPoster, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 28 }}>🎬</Text>
                    </View>
                  )}
                  <Text style={styles.movieGridTitle} numberOfLines={2}>{movie.title}</Text>
                  <Text style={styles.movieGridYear}>{movie.year}</Text>
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                        <Path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {canProceed && (
            <Animated.View entering={FadeInUp}>
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary, { marginTop: spacing.xxl }]}
                onPress={handleConfirmSelection}
                disabled={loading}
              >
                <Text style={styles.actionButtonTextPrimary}>
                  {loading ? 'setting up...' : `compare ${count} movies`}
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {count > 0 && count < 4 && (
            <Text style={[styles.sectionSubtitle, { marginTop: spacing.md, color: colors.textMuted }]}>
              select {4 - count} more to start
            </Text>
          )}
        </ScrollView>
      </View>
    );
  };

  // ---------- COMPARING (A/B picks) ----------
  const renderComparing = () => {
    const pairs = activeChallenge?.pairs || [];
    const pair = pairs[currentPairIndex];
    if (!pair) {
      return (
        <View style={styles.container}>
          {renderHeader('vs')}
          <View style={styles.centeredContent}>
            <Text style={styles.errorText}>Something went wrong loading this pair.</Text>
            <Pressable
              style={[styles.actionButton, { marginTop: spacing.lg, backgroundColor: colors.surface }]}
              onPress={() => { setStep('home'); setActiveChallenge(null); loadChallenges(); }}
            >
              <Text style={[styles.actionButtonTextPrimary, { color: colors.textSecondary }]}>back to challenges</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {renderHeader(`${currentPairIndex + 1} of ${pairs.length}`)}
        <View style={styles.centeredContent}>
          <Text style={styles.comparingPrompt}>which do you prefer?</Text>

          <View style={styles.vsPairContainer}>
            {/* Movie A */}
            <Pressable
              style={styles.vsCard}
              onPress={() => handlePick('A')}
              disabled={loading}
            >
              {pair.movieA.posterUrl ? (
                <Image source={{ uri: pair.movieA.posterUrl }} style={styles.vsCardPoster} resizeMode="cover" />
              ) : (
                <View style={[styles.vsCardPoster, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 36 }}>🎬</Text>
                </View>
              )}
              <Text style={styles.vsCardTitle} numberOfLines={2}>{pair.movieA.title}</Text>
              <Text style={styles.vsCardYear}>{pair.movieA.year}</Text>
            </Pressable>

            {/* VS Badge */}
            <View style={styles.vsBadge}>
              <Text style={styles.vsBadgeText}>vs</Text>
            </View>

            {/* Movie B */}
            <Pressable
              style={styles.vsCard}
              onPress={() => handlePick('B')}
              disabled={loading}
            >
              {pair.movieB.posterUrl ? (
                <Image source={{ uri: pair.movieB.posterUrl }} style={styles.vsCardPoster} resizeMode="cover" />
              ) : (
                <View style={[styles.vsCardPoster, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 36 }}>🎬</Text>
                </View>
              )}
              <Text style={styles.vsCardTitle} numberOfLines={2}>{pair.movieB.title}</Text>
              <Text style={styles.vsCardYear}>{pair.movieB.year}</Text>
            </Pressable>
          </View>

          {/* Progress dots */}
          <View style={styles.progressDots}>
            {pairs.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i < currentPairIndex && styles.progressDotDone,
                  i === currentPairIndex && styles.progressDotActive,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    );
  };

  // ---------- REVEAL ----------
  const renderReveal = () => {
    const pairs = activeChallenge?.pairs || [];

    return (
      <View style={styles.container}>
        {renderHeader('the reveal')}
        <ScrollView style={styles.scrollContent} contentContainerStyle={[styles.scrollInner, { alignItems: 'center' }]}>
          {/* Running score */}
          <Animated.View entering={FadeIn} style={styles.revealScoreContainer}>
            <Text style={styles.revealScoreLabel}>score</Text>
            <Text style={styles.revealScore}>{revealIndex >= 0 ? `${runningScore}/${revealIndex + 1}` : '—'}</Text>
          </Animated.View>

          {/* Revealed pairs */}
          {pairs.map((pair, i) => {
            if (i > revealIndex) return null;
            return (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(100).duration(400)}
                style={[
                  styles.revealPair,
                  pair.match ? styles.revealPairMatch : styles.revealPairMiss,
                ]}
              >
                <View style={styles.revealPairMovies}>
                  <View style={styles.revealPairMovie}>
                    {pair.movieA.posterUrl ? (
                      <Image source={{ uri: pair.movieA.posterUrl }} style={styles.revealPosterSmall} resizeMode="cover" />
                    ) : (
                      <View style={[styles.revealPosterSmall, { backgroundColor: colors.surface }]} />
                    )}
                    <Text style={styles.revealMovieTitle} numberOfLines={1}>{pair.movieA.title}</Text>
                  </View>
                  <Text style={styles.revealVs}>vs</Text>
                  <View style={styles.revealPairMovie}>
                    {pair.movieB.posterUrl ? (
                      <Image source={{ uri: pair.movieB.posterUrl }} style={styles.revealPosterSmall} resizeMode="cover" />
                    ) : (
                      <View style={[styles.revealPosterSmall, { backgroundColor: colors.surface }]} />
                    )}
                    <Text style={styles.revealMovieTitle} numberOfLines={1}>{pair.movieB.title}</Text>
                  </View>
                </View>
                <View style={styles.revealPairResult}>
                  <Text style={styles.revealResultIcon}>{pair.match ? '✓' : '✗'}</Text>
                  <Text style={[styles.revealResultText, pair.match ? styles.revealResultMatch : styles.revealResultMiss]}>
                    {pair.match ? 'agree' : 'disagree'}
                  </Text>
                </View>
              </Animated.View>
            );
          })}

          {revealIndex < pairs.length - 1 && (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
          )}
        </ScrollView>
      </View>
    );
  };

  // ---------- RESULT ----------
  const renderResult = () => {
    const score = activeChallenge?.score || 0;
    const pairs = activeChallenge?.pairs || [];
    const results = activeChallenge?.results;

    return (
      <View style={styles.container}>
        {renderHeader('results')}
        <ScrollView style={styles.scrollContent} contentContainerStyle={[styles.scrollInner, { alignItems: 'center' }]}>
          {/* Big score */}
          <Animated.View entering={FadeIn.delay(200)} style={styles.resultScoreContainer}>
            <Text style={styles.resultScoreNumber}>{score}</Text>
            <Text style={styles.resultScoreOf}>/{pairs.length}</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400)}>
            <Text style={styles.resultLabel}>{getScoreLabel(score, pairs.length)}</Text>
          </Animated.View>

          {results && (
            <Animated.View entering={FadeInUp.delay(500)}>
              <Text style={[styles.resultNames, { marginTop: spacing.sm }]}>
                {results.challengerName} vs {results.challengedName}
              </Text>
            </Animated.View>
          )}

          {/* CTAs at emotional peak */}
          <Animated.View entering={FadeInUp.delay(600)} style={[styles.actionRow, { marginTop: spacing.lg }]}>
            {isGuest ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: spacing.md }}>
                  join aaybee to challenge your friends and discover your movie taste
                </Text>
                <Pressable
                  style={[styles.actionButton, styles.actionButtonPrimary]}
                  onPress={onClose}
                >
                  <Text style={styles.actionButtonTextPrimary}>join aaybee</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={[styles.actionButton, styles.actionButtonPrimary]} onPress={() => { setStep('friend-select'); setActiveChallenge(null); }}>
                  <Text style={styles.actionButtonTextPrimary}>challenge a friend</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: colors.surface, marginTop: spacing.sm }]}
                  onPress={handleShare}
                >
                  <Text style={[styles.actionButtonTextPrimary, { color: colors.textSecondary }]}>share result</Text>
                </Pressable>
              </>
            )}
          </Animated.View>

          {/* Insights */}
          {results && (
            <Animated.View entering={FadeInUp.delay(700)} style={styles.resultDetails}>
              {results.biggestAgreement && (
                <View style={styles.resultInsight}>
                  <Text style={styles.resultInsightLabel}>biggest agreement</Text>
                  <Text style={styles.resultInsightText}>
                    {results.biggestAgreement.movieA} over {results.biggestAgreement.movieB}
                  </Text>
                </View>
              )}

              {results.biggestDisagreement && (
                <View style={styles.resultInsight}>
                  <Text style={styles.resultInsightLabel}>biggest disagreement</Text>
                  <Text style={styles.resultInsightText}>
                    you picked {results.biggestDisagreement.challengedPick},{' '}
                    they picked {results.biggestDisagreement.challengerPick}
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Pair breakdown — toggled */}
          <Pressable
            style={[styles.actionButton, { backgroundColor: colors.surface, marginTop: spacing.lg }]}
            onPress={() => setShowBreakdown(prev => !prev)}
          >
            <Text style={[styles.actionButtonTextPrimary, { color: colors.textSecondary }]}>
              {showBreakdown ? 'hide breakdown' : 'see full breakdown'}
            </Text>
          </Pressable>

          {showBreakdown && (
            <View style={styles.breakdownSection}>
              <Text style={styles.sectionTitle}>pair breakdown</Text>
              {pairs.map((pair, i) => (
                <View key={i} style={[styles.breakdownRow, pair.match ? styles.breakdownMatch : styles.breakdownMiss]}>
                  <Text style={styles.breakdownIndex}>{i + 1}</Text>
                  <Text style={styles.breakdownMovieA} numberOfLines={1}>
                    {pair.movieA.title}
                  </Text>
                  <Text style={styles.breakdownVs}>vs</Text>
                  <Text style={styles.breakdownMovieB} numberOfLines={1}>
                    {pair.movieB.title}
                  </Text>
                  <Text style={[styles.breakdownResult, pair.match ? styles.breakdownResultMatch : styles.breakdownResultMiss]}>
                    {pair.match ? '✓' : '✗'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Back */}
          <View style={[styles.actionRow, { marginTop: spacing.xl, marginBottom: spacing.xxxl }]}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: colors.surface }]}
              onPress={() => { setStep('home'); setActiveChallenge(null); setShowBreakdown(false); loadChallenges(); }}
            >
              <Text style={[styles.actionButtonTextPrimary, { color: colors.textSecondary }]}>back to challenges</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {step === 'home' && renderHome()}
      {step === 'friend-select' && renderFriendSelect()}
      {step === 'waiting' && renderWaiting()}
      {step === 'waiting_for_challenger' && renderWaitingForChallenger()}
      {step === 'selecting' && renderSelecting()}
      {(step === 'challenged_comparing' || step === 'challenger_comparing') && renderComparing()}
      {step === 'reveal' && renderReveal()}
      {step === 'result' && renderResult()}

      {/* Offscreen share card for image capture */}
      {step === 'result' && activeChallenge?.results && (
        <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }} style={{ position: 'absolute', left: -9999 }}>
          <ShareableVsResult
            score={activeChallenge.score || 0}
            scoreLabel={getScoreLabel(activeChallenge.score || 0, activeChallenge.pairs?.length || 10)}
            challengerName={activeChallenge.results.challengerName}
            challengedName={activeChallenge.results.challengedName}
            pairs={activeChallenge.pairs || []}
          />
        </ViewShot>
      )}
    </View>
  );
}

// ============================================
// HELPERS
// ============================================

function getScoreColor(score: number): string {
  if (score >= 8) return '#22C55E';
  if (score >= 6) return '#86EFAC';
  if (score >= 4) return colors.warning;
  return colors.error;
}

function getScoreLabel(score: number, total: number = 10): string {
  const pct = total > 0 ? score / total : 0;
  if (pct === 1) return 'perfect match — you are the same person';
  if (pct >= 0.8) return 'cinema soulmates';
  if (pct >= 0.6) return 'solid taste overlap';
  if (pct >= 0.4) return 'some common ground';
  if (pct >= 0.2) return 'agree to disagree';
  return 'polar opposites';
}

// ============================================
// STYLES
// ============================================

const headerStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.tabBarBorder,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: spacing.md,
  },
  backButton: {
    padding: spacing.sm,
    width: 40,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  closeButton: {
    padding: spacing.sm,
    width: 40,
    alignItems: 'flex-end',
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    marginTop: spacing.xl,
  },
  heroTitle: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.accent,
    letterSpacing: -3,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Actions
  actionRow: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  actionButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    minWidth: 160,
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
  },
  actionButtonSmall: {
    minWidth: 80,
    paddingHorizontal: spacing.lg,
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

  // Sections
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    ...typography.captionMedium,
    color: colors.textMuted,
    marginBottom: spacing.md,
    textTransform: 'uppercase' as any,
    letterSpacing: 1,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  // Challenge cards
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  challengeCardLeft: {
    flex: 1,
  },
  challengeTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  challengeStatus: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  scoreBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
  },
  scoreBadgeText: {
    ...typography.captionMedium,
    color: '#fff',
    fontWeight: '700',
  },

  // Code input
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    letterSpacing: 3,
    textAlign: 'center',
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Error
  errorContainer: {
    backgroundColor: colors.errorSubtle,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },

  // Friend cards
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  friendAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.background,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  friendMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },

  // Waiting
  waitingCode: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 8,
    marginTop: spacing.lg,
  },
  waitingHint: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },

  // Movie grid (selecting)
  movieGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  movieGridItem: {
    width: '22%' as any,
    minWidth: 75,
    maxWidth: 100,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  movieGridItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  movieGridItemDisabled: {
    opacity: 0.3,
  },
  movieGridPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  movieGridTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: 11,
  },
  movieGridYear: {
    fontSize: 10,
    color: colors.textMuted,
  },
  selectedBadge: {
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

  // Comparing
  comparingPrompt: {
    ...typography.h3,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  vsPairContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    width: '100%',
    maxWidth: 500,
  },
  vsCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer' } as any
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }),
  },
  vsCardPoster: {
    width: 100,
    height: 150,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  vsCardTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  vsCardYear: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  vsBadge: {
    position: 'absolute',
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.background,
  },
  progressDots: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xxl,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotDone: {
    backgroundColor: colors.accent,
  },
  progressDotActive: {
    backgroundColor: colors.textPrimary,
    width: 20,
  },

  // Reveal
  revealScoreContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  revealScoreLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase' as any,
    letterSpacing: 2,
  },
  revealScore: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.accent,
  },
  revealPair: {
    width: '100%',
    maxWidth: 500,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  revealPairMatch: {
    backgroundColor: 'rgba(134, 239, 172, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(134, 239, 172, 0.3)',
  },
  revealPairMiss: {
    backgroundColor: 'rgba(252, 165, 165, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(252, 165, 165, 0.3)',
  },
  revealPairMovies: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  revealPairMovie: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  revealPosterSmall: {
    width: 32,
    height: 48,
    borderRadius: 4,
    overflow: 'hidden',
  },
  revealMovieTitle: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    fontSize: 12,
  },
  revealVs: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  revealPairResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  revealResultIcon: {
    fontSize: 18,
  },
  revealResultText: {
    ...typography.caption,
    fontWeight: '700',
  },
  revealResultMatch: {
    color: colors.success,
  },
  revealResultMiss: {
    color: colors.error,
  },

  // Result
  resultScoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.xxxl,
    marginBottom: spacing.lg,
  },
  resultScoreNumber: {
    fontSize: 96,
    fontWeight: '900',
    color: colors.accent,
    letterSpacing: -5,
  },
  resultScoreOf: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textMuted,
  },
  resultLabel: {
    ...typography.h3,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  resultDetails: {
    width: '100%',
    maxWidth: 400,
    marginBottom: spacing.xxl,
  },
  resultNames: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  resultInsight: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  resultInsightLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase' as any,
    letterSpacing: 1,
    fontSize: 11,
  },
  resultInsightText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },

  // Breakdown
  breakdownSection: {
    width: '100%',
    maxWidth: 500,
    marginTop: spacing.xxl,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: 4,
  },
  breakdownMatch: {
    backgroundColor: 'rgba(134, 239, 172, 0.06)',
  },
  breakdownMiss: {
    backgroundColor: 'rgba(252, 165, 165, 0.06)',
  },
  breakdownIndex: {
    width: 24,
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  breakdownMovieA: {
    flex: 1,
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
  },
  breakdownVs: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
    fontSize: 11,
  },
  breakdownMovieB: {
    flex: 1,
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
  },
  breakdownResult: {
    width: 24,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  breakdownResultMatch: {
    color: colors.success,
  },
  breakdownResultMiss: {
    color: colors.error,
  },
});
