import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { shareService, storeLastDisagreement } from '../services/shareService';
import { vsService, VsChallenge, VsMovie, VsPair, VsResults } from '../services/vsService';
import { friendService, FriendWithProfile, FriendRequest, UserSearchResult } from '../services/friendService';
import { ContactInvite } from '../components/ContactInvite';
import { ShareableChallengeResult } from '../components/ShareableImages';
import { TasteRadar } from '../components/TasteRadar';
import { CinematicCard } from '../components/cinematic/CinematicCard';
import { OnboardingProgressBar } from '../components/onboarding/OnboardingProgressBar';
import { computeTasteAxes, generateComparisonSummary } from '../utils/tasteAxes';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { Movie } from '../types';
import { CURATED_PACKS, CuratedPack } from '../data/curatedPacks';
import { supabase } from '../services/supabase';

import { QRCode } from '../components/QRCode';

// ============================================
// TYPES
// ============================================

type ChallengeStep =
  | 'home'       // Create or join
  | 'select'     // Pick 9 movies from your list
  | 'share'      // Show link to share
  | 'name'       // Challenger enters their name
  | 'rank'       // Rank the 9 movies via pairwise comparison
  | 'results'    // Match results (friend challenge)
  // VS flow (pool-based, for non-users)
  | 'vs-name'       // Guest enters name before selecting
  | 'vs-selecting'  // Pick 4-10 movies from pool
  | 'vs-comparing'  // A/B pair picks
  | 'vs-waiting'    // Waiting for other player
  | 'vs-result';    // Score/N result

interface ChallengeScreenProps {
  initialCode?: string;
  onOpenAuth?: () => void;
}

// ============================================
// COMPONENT
// ============================================

export function ChallengeScreen({ initialCode, onOpenAuth }: ChallengeScreenProps) {
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
  const [rankSelected, setRankSelected] = useState<'a' | 'b' | null>(null);

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

  const shareCardRef = useRef<ViewShot>(null);

  // VS challenge state (pool-based flow)
  const [vsChallenge, setVsChallenge] = useState<VsChallenge | null>(null);
  const [vsSelectedIds, setVsSelectedIds] = useState<Set<string>>(new Set());
  const [vsPairIndex, setVsPairIndex] = useState(0);
  const [vsGuestName, setVsGuestName] = useState('');
  const vsPickingRef = useRef(false);
  const vsSubscriptionRef = useRef<any>(null);

  // Inline code input for home screen
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // ============================================
  // LOAD INITIAL CODE (deep link join)
  // ============================================

  useEffect(() => {
    if (!initialCode) return;
    (async () => {
      setLoading(true);

      // Try friend challenge first
      const c = await challengeService.getChallengeByCode(initialCode);
      if (c) {
        setChallenge(c);
        if (c.status === 'complete' && c.results) {
          setResults(c.results as ChallengeResults);
          setStep('results');
        } else if (user?.id) {
          const autoName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
          setChallengerName(autoName);
          const { challenge: updated, error: err } = await challengeService.joinChallenge(c.code, autoName, user.id);
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
        setLoading(false);
        return;
      }

      // Try VS challenge
      const vc = await vsService.getChallengeByCode(initialCode);
      if (vc) {
        setVsChallenge(vc);
        if (vc.status === 'complete' && vc.results) {
          setStep('vs-result');
        } else if (user?.id) {
          const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
          const { challenge: joined } = await vsService.joinChallenge(initialCode, user.id, displayName);
          if (joined) setVsChallenge(joined);
          setStep('vs-selecting');
        } else {
          setStep('vs-name');
        }
        setLoading(false);
        return;
      }

      setError('Challenge not found or expired');
      setStep('home');
      setLoading(false);
    })();
  }, [initialCode]);

  // Load leaderboard + active challenges
  useEffect(() => {
    if (!user?.id) return;
    challengeService.getMyActiveChallenges(user.id).then(setActiveChallenges);
    challengeService.getChallengeLeaderboard(user.id).then(setLeaderboard);
  }, [user?.id]);

  // Load friends on mount
  useEffect(() => {
    if (!user?.id) return;
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
  // CREATE FLOW
  // ============================================

  const loadMoviesForSelection = useCallback(async () => {
    if (!user?.id) {
      // No user — show curated packs
      setShowPacks(true);
      return;
    }
    setLoading(true);
    const movies = await challengeService.getTopMoviesForChallenge(user.id, 30);
    if (movies.length < 9) {
      // Not enough ranked movies — show curated packs
      setShowPacks(false);
      setLoading(false);
      setShowPacks(true);
      return;
    }
    setAvailableMovies(movies);
    const top9 = movies.slice(0, 9).map(m => m.id);
    setSelectedIds(new Set(top9));
    setLoading(false);
    setStep('select');
  }, [user?.id]);

  const toggleMovie = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 9) {
        next.add(id);
      }
      return next;
    });
    haptics.light();
  }, [haptics]);

  const createChallenge = useCallback(async () => {
    if (selectedIds.size < 3) return;
    setLoading(true);
    setError(null);

    const selectedMovies = availableMovies.filter(m => selectedIds.has(m.id));
    // Creator ranking is the order they appear in (by beta score, already sorted)
    const creatorRanking = selectedMovies.map(m => m.id);

    // Get display name — guests use challengerName or 'Guest'
    const displayName = user?.id
      ? (user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan')
      : (challengerName || 'Guest');

    const { challenge: c, error: err } = await challengeService.createChallenge(
      user?.id || null,
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
  }, [user, selectedIds, availableMovies, haptics, challengerName]);

  // ============================================
  // PRIMARY CTA: "challenge a friend"
  // ============================================

  const handleCreateChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (user?.id) {
      // Logged-in: create VS challenge (pool-based, works for anyone)
      const { challenge: vc, error: err } = await vsService.createChallenge(user.id, null);
      if (vc) {
        setVsChallenge(vc);
        setStep('share');
        haptics.success();
        setLoading(false);
        return;
      }
      // Fallback: not enough ranked movies → show pack picker
      if (err) {
        setShowPacks(true);
        setLoading(false);
        return;
      }
    }
    // Guest → show pack picker
    setShowPacks(true);
    setLoading(false);
  }, [user, haptics]);

  // ============================================
  // REMATCH
  // ============================================

  const handleRematch = useCallback(async () => {
    if (!challenge || !user?.id) return;
    setLoading(true);
    const movies = await challengeService.getTopMoviesForChallenge(user.id, 9);
    if (movies.length >= 9) {
      const selectedMovies = movies.slice(0, 9);
      const creatorRanking = selectedMovies.map(m => m.id);
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
      const { challenge: c } = await challengeService.createChallenge(user.id, displayName, selectedMovies, creatorRanking);
      if (c) {
        setChallenge(c);
        setResults(null);
        setStep('share');
      }
    } else {
      setShowPacks(true);
      setResults(null);
      setStep('home');
    }
    setLoading(false);
  }, [challenge, user]);

  // ============================================
  // JOIN CODE FROM HOME SCREEN INPUT
  // ============================================

  const handleJoinCodeInput = useCallback(async (text: string) => {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setJoinCodeInput(cleaned);
    if (cleaned.length === 6) {
      setLoading(true);

      // Try friend challenge first
      const c = await challengeService.getChallengeByCode(cleaned);
      if (c) {
        setChallenge(c);
        if (c.status === 'complete' && c.results) {
          setResults(c.results as ChallengeResults);
          setStep('results');
        } else if (user?.id) {
          const autoName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
          setChallengerName(autoName);
          const { challenge: updated } = await challengeService.joinChallenge(c.code, autoName, user.id);
          if (updated) {
            setChallenge(updated);
            if (updated.status === 'complete' && updated.results) {
              setResults(updated.results as ChallengeResults);
              setStep('results');
            } else {
              const pairs = generateSwissPairs((updated || c).movies);
              setRankingPairs(pairs);
              setCurrentPairIndex(0);
              setScores(new Map((updated || c).movies.map(m => [m.id, 0])));
              setStep('rank');
            }
          }
        } else {
          setStep('name');
        }
        setLoading(false);
        setJoinCodeInput('');
        return;
      }

      // Try VS challenge
      const vc = await vsService.getChallengeByCode(cleaned);
      if (vc) {
        setVsChallenge(vc);
        if (vc.status === 'complete' && vc.results) {
          setStep('vs-result');
        } else if (user?.id) {
          // Signed-in: auto-join and go to selecting
          const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
          const { challenge: joined } = await vsService.joinChallenge(cleaned, user.id, displayName);
          if (joined) setVsChallenge(joined);
          setStep('vs-selecting');
        } else {
          // Guest: ask for name first
          setStep('vs-name');
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
    const url = shareService.getChallengeShareUrl(challenge.code, user?.id);

    // Social proof from last game
    let proofText = 'I ranked 9 movies on aaybee — can you match my taste?';
    if (leaderboard.length > 0) {
      const lastGame = leaderboard[0];
      const tier = getMatchTier(lastGame.matchPercent);
      proofText = `I got ${lastGame.matchPercent}% with ${lastGame.name} — ${tier.name}. can you beat that?`;
    }

    const message = `${proofText}\n\n${url}`;

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
  }, [challenge, leaderboard, haptics]);

  const handleShareResults = useCallback(async () => {
    if (!challenge || !results) return;
    const url = shareService.getChallengeShareUrl(challenge.code, user?.id);
    const tier = getMatchTier(results.matchPercent);
    let message: string;

    if (results.biggestDisagreement) {
      const d = results.biggestDisagreement;
      const isCreator = user?.id === challenge.creator_id;
      const myRank = isCreator ? d.creatorRank : d.challengerRank;
      const theirRank = isCreator ? d.challengerRank : d.creatorRank;
      const otherName = isCreator ? challenge.challenger_name : challenge.creator_name;
      message = `i ranked ${d.movie.title} #${myRank}. ${otherName} put it at #${theirRank}. whose taste is better?\n\n${url}`;
      storeLastDisagreement(`i ranked ${d.movie.title} #${myRank}. my friend put it at #${theirRank}. whose taste is better?`);
    } else {
      message = `${challenge.creator_name} & ${challenge.challenger_name}: ${results.matchPercent}% — ${tier.name}\n"${tier.subtitle}"\n\n${url}`;
    }

    try {
      // Try to share as image on native
      if (Platform.OS !== 'web' && shareCardRef.current) {
        try {
          const uri = await (shareCardRef.current as any).capture();
          if (uri) {
            await Share.share(Platform.OS === 'ios' ? { url: uri, message } : { message });
            haptics.success();
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            return;
          }
        } catch {}
      }
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
  }, [challenge, results, haptics, user?.id]);

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

  const handleQuickChallenge = useCallback(async (friend: FriendWithProfile) => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    // Check if both users have 9+ common ranked movies
    const friendId = friend.friend_id;
    const commonMovies = await challengeService.getCommonMovies(user.id, friendId, 9);

    if (commonMovies && commonMovies.length >= 9) {
      // Auto-personalized: use common movies directly
      const selectedMovies = commonMovies.slice(0, 9);
      const creatorRanking = selectedMovies.map(m => m.id);
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Movie Fan';
      const { challenge: c, error: err } = await challengeService.createChallenge(
        user.id, displayName, selectedMovies, creatorRanking,
      );
      if (c) {
        setChallenge(c);
        setStep('share');
        haptics.success();
      } else {
        setError(err || 'Failed');
      }
    } else {
      // Not enough common movies — show collection picker
      setShowPacks(true);
    }

    setLoading(false);
  }, [user, haptics]);

  const handleSelectPack = useCallback(async (pack: CuratedPack) => {
    setLoading(true);

    const { data: movieData } = await supabase
      .from('movies')
      .select('id, title, year, poster_url')
      .in('id', pack.movieIds);

    if (movieData && movieData.length >= 3) {
      const pool: VsMovie[] = movieData.map(m => ({
        id: m.id,
        title: m.title,
        year: m.year,
        posterUrl: m.poster_url || '',
        beta: 0,
      }));

      const { challenge: vc, error: err } = await vsService.createChallengeWithPool(
        user?.id || null,
        pool,
      );

      if (vc) {
        setVsChallenge(vc);
        setShowPacks(false);
        setStep('share');
        haptics.success();
      } else {
        setError(err || 'Failed to create challenge');
      }
    }

    setLoading(false);
  }, [user, haptics]);

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
  // SWISS PAIR GENERATION
  // ============================================

  /**
   * Generate pairwise comparisons for n movies.
   * For 9 movies: ~18 comparisons (2x movie count).
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
      <Text style={styles.headerTitle}>challenge</Text>
    </View>
  );

  // HOME: unified VS flow
  const renderHome = () => {
    const isGuestUser = !user?.id;
    const hasContent = friends.length > 0 || activeChallenges.length > 0;

    // Guest or signed-in user with no challenges/friends: focused empty state
    if (!hasContent && !showSearch && !showPacks) {
      return (
        <View style={[styles.homeScroll, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
          <Text style={styles.vsTitle}>VS</Text>
          <Text style={[styles.emptyPrompt, { textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl, fontSize: 15, lineHeight: 22 }]}>
            {isGuestUser
              ? 'compare your movie taste with a friend.\npick a category, share a link, see who agrees.'
              : 'find out who has better taste.\nchallenge a friend — it takes 30 seconds.'}
          </Text>

          <Pressable
            style={[styles.primaryCta, { width: '100%', maxWidth: 320 }, loading && styles.actionButtonDisabled]}
            onPress={handleCreateChallenge}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={styles.primaryCtaText}>
                {isGuestUser ? 'pick a category' : 'challenge a friend'}
              </Text>
            )}
          </Pressable>

          <TextInput
            style={[styles.codeInputInline, { maxWidth: 320, width: '100%' }]}
            placeholder="have a code? enter it here"
            placeholderTextColor={colors.textMuted}
            value={joinCodeInput}
            onChangeText={handleJoinCodeInput}
            maxLength={6}
            autoCapitalize="characters"
          />

          {isGuestUser && onOpenAuth && (
            <Pressable
              style={{ marginTop: spacing.lg, padding: spacing.sm }}
              onPress={onOpenAuth}
            >
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>already have an account? sign in</Text>
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

      {/* Primary CTA */}
      <Pressable
        style={[styles.primaryCta, loading && styles.actionButtonDisabled]}
        onPress={handleCreateChallenge}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={styles.primaryCtaText}>challenge a friend</Text>
        )}
      </Pressable>

      {/* Always-visible code input */}
      <TextInput
        style={styles.codeInputInline}
        placeholder="enter a code"
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
              onPress={() => handleSelectPack(pack)}
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
                  value={`https://aaybee.netlify.app/connect/${user.id}`}
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
                const friendGames = leaderboard.filter(l => l.name === name);
                const avgMatch = friendGames.length > 0
                  ? Math.round(friendGames.reduce((s, g) => s + g.matchPercent, 0) / friendGames.length)
                  : (friend.taste_match ? Math.round(friend.taste_match) : null);
                return { friend, name, avgMatch, gameCount: friendGames.length, friendGames };
              })
              .sort((a, b) => (b.avgMatch ?? -1) - (a.avgMatch ?? -1))
              .map(({ friend, name, avgMatch, gameCount, friendGames }, rank) => {
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
                          {avgMatch !== null ? `${avgMatch}% avg` : '\u2014'}
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
                        {friendGames.length > 0 && (
                          <Text style={styles.friendStat}>
                            avg match: {avgMatch}% · last played: {friendGames[0]?.date ? new Date(friendGames[0].date).toLocaleDateString() : '\u2014'}
                          </Text>
                        )}
                        {friendGames.length === 0 && (
                          <Text style={styles.friendStat}>no challenges yet</Text>
                        )}
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

      {/* ACTIVE - in-progress challenges */}
      {activeChallenges.filter(c => c.status !== 'complete').length > 0 && (
        <Animated.View entering={FadeInDown.delay(200)} style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>active</Text>
          {activeChallenges.filter(c => c.status !== 'complete').map(c => {
            const isCreator = c.creator_id === user?.id;
            const opponentName = isCreator ? (c.challenger_name || 'waiting...') : c.creator_name;
            const statusText = c.status === 'pending'
              ? 'waiting...'
              : isCreator
                ? 'waiting...'
                : 'your turn!';
            const timeAgo = c.created_at ? getTimeAgo(c.created_at) : '';
            return (
              <Pressable key={c.id} style={styles.challengeRow} onPress={() => {
                setChallenge(c);
                if (c.status === 'pending' && isCreator) setStep('share');
                else if (!isCreator && c.status === 'active') {
                  const pairs = generateSwissPairs(c.movies);
                  setRankingPairs(pairs);
                  setCurrentPairIndex(0);
                  setScores(new Map(c.movies.map(m => [m.id, 0])));
                  setStep('rank');
                }
              }}>
                <Text style={styles.challengeRowName}>{opponentName}</Text>
                <Text style={styles.challengeRowStatus}>
                  {statusText}{timeAgo ? ` · ${timeAgo}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </ScrollView>
    );
  };

  // SELECT: pick 9 movies
  const renderSelect = () => (
    <Animated.View entering={FadeIn} style={styles.fullContent}>
      <Text style={styles.sectionTitle}>pick your movies</Text>
      <Text style={styles.sectionSubtitle}>
        {selectedIds.size}/9 selected — your friend will rank these same movies
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

  // SHARE: waiting/share screen
  const renderShare = () => {
    const code = vsChallenge?.code || challenge?.code;
    const isVs = !!vsChallenge;
    const shareUrl = isVs
      ? shareService.getVsShareUrl(code!, user?.id)
      : shareService.getChallengeShareUrl(code!, user?.id);
    const qrUrl = isVs
      ? `https://aaybee.netlify.app/vs/${code}`
      : `https://aaybee.netlify.app/challenge/${code}`;

    return (
      <Animated.View entering={FadeIn} style={styles.centeredContent}>
        <Text style={styles.heroTitle}>send this to a friend</Text>

        <View style={styles.qrContainer}>
          <QRCode
            value={qrUrl}
            size={160}
            backgroundColor="transparent"
            color="#F5F5F5"
          />
        </View>

        <View style={styles.codeDisplay}>
          <Text style={styles.codeLabel}>CODE</Text>
          <Text style={styles.codeDisplayText}>{code}</Text>
        </View>

        <Pressable
          style={[styles.primaryCta, { marginTop: spacing.xl, width: '100%', maxWidth: 320 }]}
          onPress={async () => {
            const message = `I challenged you on aaybee — who has better taste? ${shareUrl}`;
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
            } catch {}
          }}
        >
          <Text style={styles.primaryCtaText}>
            {copied ? 'copied!' : 'share link'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, { marginTop: spacing.md, backgroundColor: colors.surface }]}
          onPress={() => { setStep('home'); setChallenge(null); setVsChallenge(null); }}
        >
          <Text style={styles.actionButtonText}>done</Text>
        </Pressable>
      </Animated.View>
    );
  };

  // NAME: challenger enters name
  const renderName = () => (
    <Animated.View entering={FadeIn} style={styles.centeredContent}>
      <Text style={styles.heroTitle}>
        {challenge?.creator_name} challenged you
      </Text>
      <Text style={styles.heroSubtitle}>
        rank {challenge?.movies.length || 9} movies and see if your taste matches
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

  // Convert ChallengeMovie to Movie for CinematicCard
  const toMovie = useCallback((cm: ChallengeMovie): Movie => ({
    ...cm,
    genres: [],
    posterColor: colors.surface,
    beta: 0,
    totalWins: 0,
    totalLosses: 0,
    totalComparisons: 0,
    timesShown: 0,
    lastShownAt: 0,
    status: 'uncompared',
  }), []);

  // Handle rank card selection with winner/loser animation delay
  const handleRankSelect = useCallback((choice: 'a' | 'b', winnerId: string) => {
    if (rankSelected) return;
    setRankSelected(choice);
    setTimeout(() => {
      handlePick(winnerId);
      setRankSelected(null);
    }, 300);
  }, [rankSelected, handlePick]);

  // RANK: pairwise comparisons
  const renderRank = () => {
    if (currentPairIndex >= rankingPairs.length) return null;
    const [movieA, movieB] = rankingPairs[currentPairIndex];
    const progress = rankingPairs.length > 0
      ? currentPairIndex / rankingPairs.length
      : 0;

    return (
      <ScrollView contentContainerStyle={styles.rankContainer}>
        <View style={styles.comparisonContent}>
          <Text style={styles.rankPrompt}>Which do you prefer?</Text>
          <View style={styles.cardsRow}>
            <CinematicCard
              movie={toMovie(movieA)}
              onSelect={() => handleRankSelect('a', movieA.id)}
              disabled={rankSelected !== null}
              isWinner={rankSelected === 'a'}
              isLoser={rankSelected === 'b'}
            />
            <CinematicCard
              movie={toMovie(movieB)}
              onSelect={() => handleRankSelect('b', movieB.id)}
              disabled={rankSelected !== null}
              isWinner={rankSelected === 'b'}
              isLoser={rankSelected === 'a'}
            />
          </View>
        </View>
        <OnboardingProgressBar
          progress={progress}
          current={currentPairIndex}
          total={rankingPairs.length}
          label=""
        />
      </ScrollView>
    );
  };

  // RESULTS: updated layout with new CTAs
  const renderResults = () => {
    if (!results || !challenge) return null;
    const tier = getMatchTier(results.matchPercent);
    const isGuest = !user?.id;

    return (
      <Animated.View entering={FadeIn} style={styles.fullContent}>
        <ScrollView contentContainerStyle={styles.resultsContent}>
          <Animated.Text entering={FadeInDown.delay(200)} style={styles.matchPercent}>
            {results.matchPercent}%
          </Animated.Text>
          <Text style={styles.matchTierName}>{tier.name}</Text>
          <Text style={styles.matchTierSubtitle}>"{tier.subtitle}"</Text>
          <Text style={styles.matchNames}>
            {challenge.creator_name} & {challenge.challenger_name}
          </Text>

          {/* CTAs at emotional peak */}
          <Animated.View entering={FadeInUp.delay(300)} style={{ width: '100%', maxWidth: 320, alignSelf: 'center', marginTop: spacing.lg, gap: spacing.sm }}>
            {!isGuest && (
              <Pressable
                style={[styles.primaryCta, { width: '100%' }]}
                onPress={handleCreateChallenge}
              >
                <Text style={styles.primaryCtaText}>challenge someone else</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.primaryCta, { width: '100%', backgroundColor: colors.surface }]}
              onPress={handleShareResults}
            >
              <Text style={[styles.primaryCtaText, { color: colors.textPrimary }]}>
                {copied ? 'copied!' : 'share result'}
              </Text>
            </Pressable>
          </Animated.View>

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

        {/* Rematch */}
        {user?.id && (
          <Pressable
            style={[styles.actionButton, { marginTop: spacing.sm, backgroundColor: colors.card }]}
            onPress={handleRematch}
          >
            <Text style={styles.actionButtonText}>rematch</Text>
          </Pressable>
        )}

        {/* Guest signup prompt */}
        {isGuest && onOpenAuth && (
          <Pressable
            style={[styles.actionButton, { backgroundColor: colors.surface, marginTop: spacing.xs }]}
            onPress={onOpenAuth}
          >
            <Text style={styles.actionButtonText}>sign up to keep your rankings</Text>
          </Pressable>
        )}

        {/* Back */}
        <Pressable
          style={[styles.actionButton, { marginTop: spacing.xs, backgroundColor: 'transparent' }]}
          onPress={() => { setStep('home'); setChallenge(null); setResults(null); }}
        >
          <Text style={[styles.actionButtonText, { color: colors.textMuted }]}>back</Text>
        </Pressable>

      </Animated.View>
    );
  };

  // ============================================
  // VS FLOW: NAME (guest)
  // ============================================

  const renderVsName = () => (
    <Animated.View entering={FadeIn} style={styles.centeredContent}>
      <Text style={styles.heroTitle}>what's your name?</Text>
      <TextInput
        style={[styles.codeInputInline, { marginTop: spacing.lg, maxWidth: 320, width: '100%' }]}
        placeholder="your name"
        placeholderTextColor={colors.textMuted}
        value={vsGuestName}
        onChangeText={setVsGuestName}
        autoCapitalize="words"
        autoFocus
      />
      <Pressable
        style={[styles.primaryCta, { marginTop: spacing.lg, width: '100%', maxWidth: 320 }, !vsGuestName.trim() && styles.actionButtonDisabled]}
        onPress={async () => {
          if (!vsChallenge || !vsGuestName.trim()) return;
          setLoading(true);
          const { challenge: joined } = await vsService.joinChallengeAsGuest(vsChallenge.code, vsGuestName.trim());
          if (joined) setVsChallenge(joined);
          setStep('vs-selecting');
          setLoading(false);
        }}
        disabled={!vsGuestName.trim() || loading}
      >
        <Text style={styles.primaryCtaText}>{loading ? 'joining...' : 'continue'}</Text>
      </Pressable>
    </Animated.View>
  );

  // ============================================
  // VS FLOW: SELECTING (pick 4-10 from pool)
  // ============================================

  const handleVsToggleMovie = useCallback((movieId: string) => {
    setVsSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(movieId)) next.delete(movieId);
      else if (next.size < 10) next.add(movieId);
      return next;
    });
  }, []);

  const handleVsConfirmSelection = useCallback(async () => {
    if (!vsChallenge || vsSelectedIds.size < 4) return;
    setLoading(true);
    const selectedMovies = (vsChallenge.pool || []).filter((m: VsMovie) => vsSelectedIds.has(m.id));
    const { pairs, error: err } = await vsService.selectMovies(vsChallenge.id, selectedMovies);
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setVsChallenge(prev => prev ? { ...prev, pairs, status: 'challenged_comparing', current_pair: 0 } as VsChallenge : null);
    setVsPairIndex(0);
    setStep('vs-comparing');
    setLoading(false);
  }, [vsChallenge, vsSelectedIds]);

  const renderVsSelecting = () => {
    const pool: VsMovie[] = vsChallenge?.pool || [];
    const count = vsSelectedIds.size;

    return (
      <Animated.View entering={FadeIn} style={styles.fullContent}>
        <ScrollView contentContainerStyle={styles.resultsContent}>
          <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>tap the movies you've seen</Text>
          <Text style={[styles.emptyPrompt, { textAlign: 'center', marginBottom: spacing.md }]}>
            {count < 4 ? `select ${4 - count} more to start` : `${count} selected`}
          </Text>

          <View style={styles.movieGrid}>
            {pool.map((movie: VsMovie) => {
              const isSelected = vsSelectedIds.has(movie.id);
              return (
                <Pressable
                  key={movie.id}
                  style={[
                    styles.movieItem,
                    isSelected && styles.movieItemSelected,
                    !isSelected && count >= 10 && { opacity: 0.3 },
                  ]}
                  onPress={() => handleVsToggleMovie(movie.id)}
                >
                  {movie.posterUrl ? (
                    <Image source={{ uri: movie.posterUrl }} style={styles.moviePoster} resizeMode="cover" />
                  ) : (
                    <View style={[styles.moviePoster, { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 24 }}>🎬</Text>
                    </View>
                  )}
                  <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                </Pressable>
              );
            })}
          </View>

          {count >= 4 && (
            <Pressable
              style={[styles.primaryCta, { marginTop: spacing.lg, alignSelf: 'center', width: '100%', maxWidth: 320 }]}
              onPress={handleVsConfirmSelection}
              disabled={loading}
            >
              <Text style={styles.primaryCtaText}>{loading ? 'setting up...' : `compare ${count} movies`}</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  // ============================================
  // VS FLOW: COMPARING (A/B pair picks)
  // ============================================

  const handleVsPick = useCallback(async (pick: 'A' | 'B') => {
    if (!vsChallenge || vsPickingRef.current) return;
    vsPickingRef.current = true;
    haptics.light();

    const { isComplete, error: err } = await vsService.submitPick(
      vsChallenge.id,
      vsPairIndex,
      pick,
      'challenged',
    );

    if (err) {
      setError(err);
      vsPickingRef.current = false;
      return;
    }

    if (isComplete) {
      // Reload challenge to get results
      const updated = await vsService.getChallengeByCode(vsChallenge.code);
      if (updated) {
        setVsChallenge(updated);
        if (updated.status === 'complete' && updated.results) {
          setStep('vs-result');
        } else {
          // Waiting for challenger to finish their picks
          setStep('vs-waiting');
        }
      }
    } else {
      setVsPairIndex(prev => prev + 1);
    }

    vsPickingRef.current = false;
  }, [vsChallenge, vsPairIndex, haptics]);

  const renderVsComparing = () => {
    const pairs: VsPair[] = vsChallenge?.pairs || [];
    const pair = pairs[vsPairIndex];
    if (!pair) return null;

    return (
      <Animated.View entering={FadeIn} style={styles.fullContent}>
        <Text style={[styles.sectionTitle, { textAlign: 'center', marginTop: spacing.lg }]}>
          {vsPairIndex + 1} of {pairs.length}
        </Text>
        <Text style={[styles.emptyPrompt, { textAlign: 'center', marginBottom: spacing.lg }]}>which do you prefer?</Text>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, flex: 1, paddingHorizontal: spacing.md }}>
          <Pressable
            style={{ flex: 1, alignItems: 'center' }}
            onPress={() => handleVsPick('A')}
          >
            <CinematicCard
              movie={toMovie({ id: pair.movieA.id, title: pair.movieA.title, year: pair.movieA.year, posterUrl: pair.movieA.posterUrl })}
              onSelect={() => handleVsPick('A')}
            />
          </Pressable>
          <Pressable
            style={{ flex: 1, alignItems: 'center' }}
            onPress={() => handleVsPick('B')}
          >
            <CinematicCard
              movie={toMovie({ id: pair.movieB.id, title: pair.movieB.title, year: pair.movieB.year, posterUrl: pair.movieB.posterUrl })}
              onSelect={() => handleVsPick('B')}
            />
          </Pressable>
        </View>

        <OnboardingProgressBar
          progress={(vsPairIndex + 1) / pairs.length}
          current={vsPairIndex}
          total={pairs.length}
          label=""
        />
      </Animated.View>
    );
  };

  // ============================================
  // VS FLOW: WAITING
  // ============================================

  const renderVsWaiting = () => (
    <Animated.View entering={FadeIn} style={styles.centeredContent}>
      <Text style={styles.heroTitle}>picks submitted</Text>
      <Text style={[styles.emptyPrompt, { textAlign: 'center', marginTop: spacing.md }]}>
        waiting for the challenger to make their picks
      </Text>
      {!user?.id && onOpenAuth && (
        <Pressable
          style={[styles.primaryCta, { marginTop: spacing.xl, width: '100%', maxWidth: 320 }]}
          onPress={onOpenAuth}
        >
          <Text style={styles.primaryCtaText}>sign up to get notified</Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.actionButton, { marginTop: spacing.md, backgroundColor: colors.surface }]}
        onPress={() => { setStep('home'); setVsChallenge(null); }}
      >
        <Text style={styles.actionButtonText}>back</Text>
      </Pressable>
    </Animated.View>
  );

  // ============================================
  // VS FLOW: RESULT
  // ============================================

  const renderVsResult = () => {
    if (!vsChallenge?.results) return null;
    const vsResults = vsChallenge.results as VsResults;
    const score = vsChallenge.score || 0;
    const pairs = vsChallenge.pairs || [];
    const total = pairs.length;
    const pct = total > 0 ? score / total : 0;
    const label = pct === 1 ? 'perfect match' : pct >= 0.8 ? 'cinema soulmates' : pct >= 0.6 ? 'solid taste overlap' : pct >= 0.4 ? 'some common ground' : pct >= 0.2 ? 'agree to disagree' : 'polar opposites';
    const isGuest = !user?.id;

    return (
      <Animated.View entering={FadeIn} style={styles.fullContent}>
        <ScrollView contentContainerStyle={[styles.resultsContent, { alignItems: 'center' }]}>
          <Text style={styles.matchPercent}>{score}/{total}</Text>
          <Text style={styles.matchTierName}>{label}</Text>
          <Text style={styles.matchNames}>
            {vsResults.challengerName} vs {vsResults.challengedName}
          </Text>

          {/* CTAs */}
          <View style={{ width: '100%', maxWidth: 320, marginTop: spacing.lg, gap: spacing.sm }}>
            {!isGuest && (
              <Pressable style={styles.primaryCta} onPress={handleCreateChallenge}>
                <Text style={styles.primaryCtaText}>challenge someone else</Text>
              </Pressable>
            )}
            {isGuest && onOpenAuth && (
              <Pressable style={styles.primaryCta} onPress={onOpenAuth}>
                <Text style={styles.primaryCtaText}>join aaybee</Text>
              </Pressable>
            )}
          </View>

          {/* Insights */}
          {vsResults.biggestAgreement && (
            <View style={[styles.resultsSection, { marginTop: spacing.lg }]}>
              <Text style={styles.resultsSectionTitle}>biggest agreement</Text>
              <Text style={styles.resultMovie}>{vsResults.biggestAgreement.movieA} over {vsResults.biggestAgreement.movieB}</Text>
            </View>
          )}
          {vsResults.biggestDisagreement && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>biggest disagreement</Text>
              <Text style={styles.resultMovie}>
                you picked {vsResults.biggestDisagreement.challengedPick}, they picked {vsResults.biggestDisagreement.challengerPick}
              </Text>
            </View>
          )}

          {/* Pair breakdown */}
          {pairs.map((pair: VsPair, i: number) => (
            <View key={i} style={[styles.resultRow, { backgroundColor: pair.match ? 'rgba(72,187,120,0.08)' : 'rgba(245,101,101,0.06)' }]}>
              <Text style={styles.resultMovie} numberOfLines={1}>{pair.movieA.title}</Text>
              <Text style={{ color: colors.textMuted, marginHorizontal: spacing.xs }}>vs</Text>
              <Text style={styles.resultMovie} numberOfLines={1}>{pair.movieB.title}</Text>
              <Text style={{ color: pair.match ? '#48BB78' : '#F56565', fontWeight: '700', marginLeft: spacing.sm }}>
                {pair.match ? '✓' : '✗'}
              </Text>
            </View>
          ))}
        </ScrollView>

        <Pressable
          style={[styles.actionButton, { marginTop: spacing.xs, backgroundColor: 'transparent' }]}
          onPress={() => { setStep('home'); setVsChallenge(null); }}
        >
          <Text style={[styles.actionButtonText, { color: colors.textMuted }]}>back</Text>
        </Pressable>
      </Animated.View>
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
          {step === 'select' && renderSelect()}
          {step === 'share' && renderShare()}
          {step === 'name' && renderName()}
          {step === 'rank' && renderRank()}
          {step === 'results' && renderResults()}
          {step === 'vs-name' && renderVsName()}
          {step === 'vs-selecting' && renderVsSelecting()}
          {step === 'vs-comparing' && renderVsComparing()}
          {step === 'vs-waiting' && renderVsWaiting()}
          {step === 'vs-result' && renderVsResult()}
        </>
      )}

      {/* Offscreen share card for image capture */}
      {step === 'results' && results && challenge && (
        <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }} style={{ position: 'absolute', left: -9999 }}>
          <ShareableChallengeResult
            matchPercent={results.matchPercent}
            tierName={getMatchTier(results.matchPercent).name}
            tierSubtitle={getMatchTier(results.matchPercent).subtitle}
            creatorName={challenge.creator_name}
            challengerName={challenge.challenger_name || ''}
            agreements={results.agreements.map(a => ({ rank: a.rank, title: a.movie.title }))}
            disagreements={results.disagreements.map(d => ({
              title: d.movie.title,
              creatorRank: d.creatorRank,
              challengerRank: d.challengerRank,
            }))}
          />
        </ViewShot>
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
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryCtaText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
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
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 4,
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
