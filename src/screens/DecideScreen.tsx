import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
  ActivityIndicator,
  Share,
  Linking,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/useAppStore';
import { useMovieDetail } from '../contexts/MovieDetailContext';
import { useLockedFeature } from '../contexts/LockedFeatureContext';
import { useDevSettings } from '../contexts/DevSettingsContext';
import { useHaptics } from '../hooks/useHaptics';
import { decideService, DecideWeights, PoolCandidate } from '../services/decideService';
import { CURATED_PACKS, CuratedPack } from '../data/curatedPacks';

import { watchlistService } from '../services/watchlistService';
import { recommendationService, getEffectiveTier } from '../services/recommendationService';
import { groupDecideService, DecideRoom, DecideRoomMember, GroupPreferences, MatchVote, CouplesResult } from '../services/groupDecideService';
import { supabase } from '../services/supabase';
import { getFullMovieDetails, getMovieTrailer, getWatchProviders, formatRuntime, getProviderLogoUrl, getMoviesByIds, tmdbToAppMovie } from '../services/tmdb';
import { CinematicBackground } from '../components/cinematic';
import { BracketPlay } from '../components/BracketPlay';
import { DecideNegotiation } from '../components/DecideNegotiation';
import { decideSessionService, DecideSession } from '../services/decideSessionService';
import { BracketMovie, BracketPick, createVsBracket, bracketToRanking } from '../utils/movieBracket';
import { OnboardingProgressBar } from '../components/onboarding/OnboardingProgressBar';
import { LockedFeatureCard } from '../components/LockedFeatureCard';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { Genre } from '../types';


// ============================================
// TYPES
// ============================================

type DecideStep =
  | 'mode-select'
  | 'preferences'
  | 'pool-building'
  | 'tournament'
  | 'result'
  // Group mode steps (legacy)
  | 'group-create'
  | 'group-join'
  | 'group-waiting'
  | 'group-preferences'
  | 'group-building'
  | 'group-tournament'
  | 'group-recap'
  | 'group-result'
  // Two-person decide steps
  | 'duo-knockout'     // Playing your 16-movie bracket
  | 'duo-waiting'      // Waiting for other person
  | 'duo-negotiate'    // Agree/disagree phase
  | 'duo-result';      // Winner revealed

interface PreferencePair {
  id: string;
  question: string;
  optionA: { key: string; label: string; icon: 'light' | 'laughs' | 'slow' | 'familiar' | 'classic' };
  optionB: { key: string; label: string; icon: 'heavy' | 'thrills' | 'fast' | 'fresh' | 'modern' };
}

type PreferenceKey = 'tone' | 'entertainment' | 'pacing' | 'novelty' | 'era';

interface UserPreferences {
  tone: 'light' | 'heavy';
  entertainment: 'laughs' | 'thrills';
  pacing: 'slow' | 'fast';
  novelty: 'familiar' | 'fresh';
  era: 'classic' | 'modern';
}

// ============================================
// CONSTANTS
// ============================================

const TOTAL_PREFERENCES = 5;
const TOURNAMENT_MATCHES = 15; // 16 movies: 8 + 4 + 2 + 1
const MIN_COMPARISONS_FOR_DECIDE = 70;

const PREFERENCE_PAIRS: PreferencePair[] = [
  {
    id: 'tone',
    question: "What's your vibe?",
    optionA: { key: 'light', label: 'Light', icon: 'light' },
    optionB: { key: 'heavy', label: 'Heavy', icon: 'heavy' },
  },
  {
    id: 'entertainment',
    question: 'What do you want?',
    optionA: { key: 'laughs', label: 'Laughs', icon: 'laughs' },
    optionB: { key: 'thrills', label: 'Thrills', icon: 'thrills' },
  },
  {
    id: 'pacing',
    question: 'What pace?',
    optionA: { key: 'slow', label: 'Slow burn', icon: 'slow' },
    optionB: { key: 'fast', label: 'Fast-paced', icon: 'fast' },
  },
  {
    id: 'novelty',
    question: 'Seen or unseen?',
    optionA: { key: 'familiar', label: 'Familiar', icon: 'familiar' },
    optionB: { key: 'fresh', label: 'Fresh', icon: 'fresh' },
  },
  {
    id: 'era',
    question: 'When from?',
    optionA: { key: 'classic', label: 'Classic\npre-2000', icon: 'classic' },
    optionB: { key: 'modern', label: 'Modern\n2000+', icon: 'modern' },
  },
];

// ============================================
// PREFERENCE ICONS
// ============================================

type PreferenceIconType = 'light' | 'heavy' | 'laughs' | 'thrills' | 'slow' | 'fast' | 'familiar' | 'fresh' | 'classic' | 'modern';

function PreferenceIcon({ type, size = 48, color }: { type: PreferenceIconType; size?: number; color: string }) {
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
      // Cloud with weight/rain
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
    case 'familiar':
      // Heart - something you love
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'fresh':
      // Sparkle/star - new discovery
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.8 5.6 21.2 8 14l-6-4.8h7.6L12 2z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'classic':
      // Film reel
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} />
          <Circle cx="12" cy="5" r="1" fill={color} />
          <Circle cx="12" cy="19" r="1" fill={color} />
          <Circle cx="5" cy="12" r="1" fill={color} />
          <Circle cx="19" cy="12" r="1" fill={color} />
        </Svg>
      );
    case 'modern':
      // Play button / streaming
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M10 8l6 4-6 4V8z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    default:
      return null;
  }
}

// ============================================
// HELPER COMPONENTS
// ============================================

// Poster URLs for mode select cards
const MODE_POSTER_PERSONAL = 'https://image.tmdb.org/t/p/w342/i5We88HdO9Nsrv8xLyo4toNsLUM.jpg'; // Home Alone
const MODE_POSTER_GROUP = 'https://image.tmdb.org/t/p/w342/gp4zlj7wgbiofLMNsTPndMuO3PN.jpg'; // The Breakfast Club

function PreferenceCard({
  label,
  icon,
  position,
  onSelect,
  isSelected,
  isLoser,
}: {
  label: string;
  icon: PreferenceIconType;
  position: 'A' | 'B';
  onSelect: () => void;
  isSelected?: boolean;
  isLoser?: boolean;
}) {
  const labelColor = position === 'A' ? LABEL_COLOR_A : LABEL_COLOR_B;
  const iconColor = isSelected ? labelColor : isLoser ? colors.textMuted : colors.tabBarInactive;

  return (
    <Pressable
      style={[
        styles.preferenceCard,
        isSelected && (position === 'A' ? styles.preferenceCardSelectedA : styles.preferenceCardSelectedB),
        isLoser && styles.preferenceCardLoser,
      ]}
      onPress={onSelect}
      disabled={isSelected || isLoser}
    >
      {/* A/B Label Badge */}
      <View style={[styles.preferenceCardLabelBadge, { backgroundColor: labelColor }]}>
        <Text style={styles.preferenceCardLabelBadgeText}>{position}</Text>
      </View>
      <View style={styles.preferenceCardContent}>
        <PreferenceIcon type={icon} size={48} color={iconColor} />
        <Text style={[
          styles.preferenceCardLabel,
          { color: iconColor },
        ]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const LABEL_COLOR_A = colors.tournamentA;
const LABEL_COLOR_B = colors.tournamentB;

function TournamentCard({
  movie,
  label,
  onSelect,
  onMoreInfo,
  isSelected,
  isLoser,
  disabled,
}: {
  movie: PoolCandidate;
  label: 'A' | 'B';
  onSelect: () => void;
  onMoreInfo: () => void;
  isSelected?: boolean;
  isLoser?: boolean;
  disabled?: boolean;
}) {
  const labelColor = label === 'A' ? LABEL_COLOR_A : LABEL_COLOR_B;

  return (
    <View style={styles.tournamentCard}>
      <Pressable onPress={onSelect} disabled={disabled}>
        <View style={[isLoser && styles.tournamentCardDimmed]}>
          {movie.posterUrl ? (
            <Image source={{ uri: movie.posterUrl }} style={styles.tournamentPoster} />
          ) : (
            <View style={[styles.tournamentPoster, styles.tournamentPosterFallback]}>
              <Text style={styles.tournamentFallbackText}>{movie.title.slice(0, 2)}</Text>
            </View>
          )}
          {/* A/B Label with color */}
          <View style={[styles.posterLabel, { backgroundColor: labelColor }]}>
            <Text style={styles.posterLabelText}>{label}</Text>
          </View>

        </View>
      </Pressable>
      <Text style={[styles.tournamentMovieTitle, isLoser && styles.tournamentTextDimmed]} numberOfLines={2}>{movie.title}</Text>
      <Text style={[styles.tournamentYear, isLoser && styles.tournamentTextDimmed]}>{movie.year}</Text>
      <Pressable style={styles.tournamentMoreInfo} onPress={onMoreInfo}>
        <Text style={styles.tournamentMoreInfoText}>more info</Text>
      </Pressable>
    </View>
  );
}

// ============================================
// MAIN SCREEN
// ============================================

interface DecideScreenProps {
  onNavigateToCompare?: () => void;
}

export function DecideScreen({ onNavigateToCompare }: DecideScreenProps) {
  const { user, isGuest } = useAuth();
  const { getRankedMovies, getMoviesByStatus, userSession, movies, postOnboardingComparisons, getRevealedMovieIds } = useAppStore();
  const { openMovieDetail } = useMovieDetail();
  const { showLockedFeature } = useLockedFeature();
  const { unlockAllFeatures } = useDevSettings();
  const haptics = useHaptics();

  const [step, setStep] = useState<DecideStep>('mode-select');
  const [preferenceIndex, setPreferenceIndex] = useState(0);
  const [tournamentIndex, setTournamentIndex] = useState(0);
  const [selected, setSelected] = useState<'A' | 'B' | null>(null);

  // User preferences (5 pairs)
  const [preferences, setPreferences] = useState<UserPreferences>({
    tone: 'light',
    entertainment: 'laughs',
    pacing: 'slow',
    novelty: 'fresh',
    era: 'modern',
  });

  // Pool & tournament (16 movies)
  const [pool, setPool] = useState<PoolCandidate[]>([]);
  const [tournamentBracket, setTournamentBracket] = useState<{
    r1Winners: PoolCandidate[];  // 8 winners from round 1
    qfWinners: PoolCandidate[];  // 4 winners from QF
    sfWinners: PoolCandidate[];  // 2 winners from SF
    champion: PoolCandidate | null;
  }>({
    r1Winners: [],
    qfWinners: [],
    sfWinners: [],
    champion: null,
  });

  // Result details
  const [resultDetails, setResultDetails] = useState<{
    runtime: string | null;
    streamingProviders: { name: string; logoUrl: string }[];
    trailerUrl: string | null;
  } | null>(null);

  // ============================================
  // GROUP MODE STATE
  // ============================================
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<DecideRoom | null>(null);
  const [members, setMembers] = useState<DecideRoomMember[]>([]);
  const [groupPreferenceIndex, setGroupPreferenceIndex] = useState(0);
  const [groupPreferences, setGroupPreferences] = useState<GroupPreferences>({
    tone: 'light',
    entertainment: 'laughs',
    pacing: 'slow',
    novelty: 'fresh',
    era: 'modern',
  });
  const [hasSubmittedPrefs, setHasSubmittedPrefs] = useState(false);
  const [prefsSubmittedCount, setPrefsSubmittedCount] = useState(0);
  const [matchVotes, setMatchVotes] = useState<MatchVote[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [vetoesRemaining, setVetoesRemaining] = useState(1);
  const [vetoMessage, setVetoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [matchComplete, setMatchComplete] = useState(false);
  const [matchWinner, setMatchWinner] = useState<PoolCandidate | null>(null);
  const [vetoMode, setVetoMode] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [couplesAgreed, setCouplesAgreed] = useState<boolean | null>(null);

  // Curated pack fallback state
  const [needsPackSelection, setNeedsPackSelection] = useState(false);
  const [selectedPack, setSelectedPack] = useState<CuratedPack | null>(null);

  // Guest member ID — used when a guest joins a group room (no user.id)
  const [guestMemberId, setGuestMemberId] = useState<string | null>(null);

  // Subscriptions refs
  const roomSubscription = useRef<any>(null);
  const membersSubscription = useRef<any>(null);
  const votesSubscription = useRef<any>(null);
  const couplesAdvanceRef = useRef(false);

  // ============================================
  // TWO-PERSON DECIDE STATE
  // ============================================
  const [duoSession, setDuoSession] = useState<DecideSession | null>(null);
  const [duoBracketMovies, setDuoBracketMovies] = useState<BracketMovie[]>([]);
  const [duoIsPersonOne, setDuoIsPersonOne] = useState(true);
  const [duoPolling, setDuoPolling] = useState(false);

  // Current preference pair
  const currentPreferencePair = useMemo(() => {
    return PREFERENCE_PAIRS[preferenceIndex] || PREFERENCE_PAIRS[0];
  }, [preferenceIndex]);

  // Current group preference pair
  const currentGroupPreferencePair = useMemo(() => {
    return PREFERENCE_PAIRS[groupPreferenceIndex] || PREFERENCE_PAIRS[0];
  }, [groupPreferenceIndex]);

  // ============================================
  // GROUP MODE SUBSCRIPTIONS
  // ============================================
  useEffect(() => {
    if (!room?.id) return;

    // Subscribe to room changes
    roomSubscription.current = groupDecideService.subscribeToRoom(room.id, (updatedRoom) => {
      setRoom(updatedRoom);
      // Auto-transition based on room status
      if (updatedRoom.status === 'preferences' && step !== 'group-preferences') {
        setStep('group-preferences');
      } else if (updatedRoom.status === 'building' && step !== 'group-building') {
        setStep('group-building');
      } else if (updatedRoom.status === 'tournament' && step !== 'group-tournament') {
        setStep('group-tournament');
        setHasVoted(false);
      } else if (updatedRoom.status === 'recap' && step !== 'group-recap') {
        setStep('group-recap');
      } else if (updatedRoom.status === 'result' && step !== 'group-result') {
        setStep('group-result');
        if (updatedRoom.champion) {
          loadResultDetails(updatedRoom.champion);
        }
      }
    });

    // Subscribe to members
    membersSubscription.current = groupDecideService.subscribeToMembers(room.id, (updatedMembers) => {
      setMembers(updatedMembers);
      const myMember = updatedMembers.find(m => m.user_id === user?.id || (guestMemberId && m.id === guestMemberId));
      if (myMember) {
        setVetoesRemaining(myMember.vetoes_remaining);
      }
    });

    return () => {
      if (roomSubscription.current) {
        groupDecideService.unsubscribe(roomSubscription.current);
      }
      if (membersSubscription.current) {
        groupDecideService.unsubscribe(membersSubscription.current);
      }
      if (votesSubscription.current) {
        groupDecideService.unsubscribe(votesSubscription.current);
      }
    };
  }, [room?.id, step, user?.id]);

  // Subscribe to match votes when in tournament
  useEffect(() => {
    if (!room?.id || room.status !== 'tournament') return;

    votesSubscription.current = groupDecideService.subscribeToMatchVotes(
      room.id,
      room.current_round,
      room.current_match,
      (votes) => {
        setMatchVotes(votes);
        // Check if I voted
        const myVote = votes.find(v => v.user_id === user?.id);
        setHasVoted(!!myVote);
      }
    );

    return () => {
      if (votesSubscription.current) {
        groupDecideService.unsubscribe(votesSubscription.current);
      }
    };
  }, [room?.id, room?.status, room?.current_round, room?.current_match, user?.id]);

  // Fetch preference vote count
  useEffect(() => {
    if (!room?.id || room.status !== 'preferences') return;

    const fetchPrefsCount = async () => {
      const votes = await groupDecideService.getPreferenceVotes(room.id);
      setPrefsSubmittedCount(votes.length);
    };
    fetchPrefsCount();

    const interval = setInterval(fetchPrefsCount, 2000);
    return () => clearInterval(interval);
  }, [room?.id, room?.status]);

  // Track match key for countdown reset
  const matchKey = `${room?.current_round}-${room?.current_match}`;
  const matchKeyRef = useRef(matchKey);

  // Reset match state when match changes - with smooth transition
  useEffect(() => {
    if (matchKey !== matchKeyRef.current && room?.status === 'tournament') {
      // Start transition
      setIsTransitioning(true);

      // Small delay before resetting to new match
      const timer = setTimeout(() => {
        matchKeyRef.current = matchKey;
        setCountdown(5);
        setMatchComplete(false);
        setMatchWinner(null);
        setHasVoted(false);
        setMatchVotes([]);
        setSelected(null);
        setIsTransitioning(false);
        setCouplesAgreed(null);
        couplesAdvanceRef.current = false;
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [matchKey, room?.status]);

  // Get current group match pair (defined early so useEffect can use it)
  const currentGroupPair = useMemo(() => {
    if (!room) return null;
    if (!room.pool || !Array.isArray(room.pool)) return null;
    return groupDecideService.getCurrentMatchPair(room);
  }, [room]);

  // Check if host (defined early for useEffect access)
  const isHost = useMemo(() => {
    return room?.host_id === user?.id;
  }, [room?.host_id, user?.id]);

  // Couples mode: auto-detected from member count (defined early for useEffect access)
  const isCouplesMode = useMemo(() => {
    return members.length === 2 && room !== null;
  }, [members.length, room]);

  // Countdown timer for group tournament matches (not used in couples mode)
  useEffect(() => {
    if (step !== 'group-tournament' || matchComplete || isTransitioning || isCouplesMode) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, matchComplete, isTransitioning, isCouplesMode]);

  // When countdown hits 0 OR everyone has voted, calculate winner
  useEffect(() => {
    if (matchComplete || step !== 'group-tournament' || !room) return;

    // Only count votes for the CURRENT match
    const currentMatchVotes = matchVotes.filter(
      v => v.round === room.current_round && v.match_index === room.current_match
    );

    const everyoneVoted = currentMatchVotes.length >= members.length && members.length > 0;
    const timeUp = countdown === 0;

    if ((everyoneVoted || timeUp) && currentMatchVotes.length > 0) {
      const pair = currentGroupPair;
      if (pair) {
        if (isCouplesMode && room.couples_picker_id) {
          // Couples: sequential pick/agree logic
          const pickerVote = currentMatchVotes.find(v => v.user_id === room.couples_picker_id);
          const responderVote = currentMatchVotes.find(v => v.user_id !== room.couples_picker_id);
          if (pickerVote && responderVote) {
            const result = groupDecideService.calculateCouplesResult(
              pair.movieA, pair.movieB, pickerVote, responderVote, room.couples_picker_id
            );
            setMatchWinner(result.winner);
            setMatchComplete(true);
            setCouplesAgreed(result.agreed);
          }
        } else {
          // Group: majority vote
          const result = groupDecideService.calculateMatchResult(pair.movieA, pair.movieB, currentMatchVotes);
          setMatchWinner(result.winner);
          setMatchComplete(true);
        }
      }
    }
  }, [countdown, matchComplete, step, currentGroupPair, matchVotes, members.length, room, isCouplesMode]);

  // Auto-advance for couples mode (host only, after showing result briefly)
  useEffect(() => {
    if (!matchComplete || !isCouplesMode || !isHost || !room?.id || couplesAdvanceRef.current) return;

    const pair = currentGroupPair;
    if (!pair || !matchWinner) return;

    const currentMatchVotes = matchVotes.filter(
      v => v.round === room.current_round && v.match_index === room.current_match
    );
    const pickerVote = currentMatchVotes.find(v => v.user_id === room.couples_picker_id);
    const responderVote = currentMatchVotes.find(v => v.user_id !== room.couples_picker_id);

    if (!pickerVote || !responderVote) return;

    const agreed = pickerVote.choice === responderVote.choice;
    const nextPickerId = agreed ? room.couples_picker_id! : responderVote.user_id;
    const loser = matchWinner === pair.movieA ? pair.movieB : pair.movieA;

    couplesAdvanceRef.current = true;

    const timer = setTimeout(async () => {
      await groupDecideService.advanceMatch(room.id, matchWinner, loser, 0, { couplesPickerId: nextPickerId });
    }, 2500);

    return () => clearTimeout(timer);
  }, [matchComplete, isCouplesMode, isHost, room?.id, room?.couples_picker_id, room?.current_round, room?.current_match, matchWinner, matchVotes, currentGroupPair]);

  // Progress
  const progress = useMemo(() => {
    if (step === 'preferences') {
      return preferenceIndex / TOTAL_PREFERENCES;
    }
    if (step === 'tournament') {
      return tournamentIndex / TOURNAMENT_MATCHES;
    }
    return 0;
  }, [step, preferenceIndex, tournamentIndex]);

  // Handle preference selection
  const handlePreferenceSelect = useCallback((choice: 'A' | 'B') => {
    setSelected(choice);
    haptics.light();

    setTimeout(() => {
      setSelected(null);

      const pair = currentPreferencePair;
      const selectedOption = choice === 'A' ? pair.optionA.key : pair.optionB.key;

      // Update preferences based on which pair we're on
      setPreferences(prev => ({
        ...prev,
        [pair.id]: selectedOption,
      }));

      if (preferenceIndex < TOTAL_PREFERENCES - 1) {
        // Move to next preference
        setPreferenceIndex(prev => prev + 1);
      } else {
        // All preferences done, build pool
        setStep('pool-building');
      }
    }, 300);
  }, [preferenceIndex, currentPreferencePair, haptics]);

  // Build pool when entering pool-building step
  useEffect(() => {
    if (step !== 'pool-building') return;

    const buildPool = async () => {
      console.log('[Decide] Building pool with preferences:', preferences);

      // Gather all candidates
      const watchlistData = user?.id ? await watchlistService.getWatchlist(user.id) : [];
      const watchlistCandidates: PoolCandidate[] = watchlistData.map(w => ({
        id: w.movie_id,
        title: w.title,
        year: w.year,
        genres: [],
        posterUrl: w.poster_url || '',
        posterColor: '#1A1A1E',
        source: 'watchlist' as const,
        score: 0,
      }));

      const recsData = user?.id ? await recommendationService.getRecommendations(user.id, 20, getRevealedMovieIds(), { ...userSession.preferences, maxTier: getEffectiveTier(userSession.totalComparisons, userSession.poolUnlockedTier) }) : { recommendations: [] };
      const recCandidates: PoolCandidate[] = recsData.recommendations.map(r => ({
        id: r.movieId,
        title: r.title,
        year: r.year,
        genres: (r.genres || []) as Genre[],
        posterUrl: r.posterUrl || '',
        posterColor: '#1A1A1E',
        source: 'recommendation' as const,
        score: 0,
      }));

      const rankedMovies = getRankedMovies().slice(0, 50);
      const rankedCandidates: PoolCandidate[] = rankedMovies.map(m =>
        decideService.movieToCandidate(m, 'ranked')
      );

      // Get unseen movies (uncertain + unknown) - these are movies user hasn't watched
      const uncertainMovies = getMoviesByStatus('uncertain').slice(0, 30);
      const unknownMovies = getMoviesByStatus('unknown').slice(0, 30);
      const unseenCandidates: PoolCandidate[] = [
        ...uncertainMovies.map(m => decideService.movieToCandidate(m, 'unseen')),
        ...unknownMovies.map(m => decideService.movieToCandidate(m, 'unseen')),
      ];

      // Combine and score all candidates based on preferences
      const allCandidates = [
        ...watchlistCandidates,
        ...recCandidates,
        ...rankedCandidates,
        ...unseenCandidates,
      ];

      // Deduplicate by ID
      const seen = new Set<string>();
      const uniqueCandidates = allCandidates.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      // Score each candidate based on user preferences (excluding era - handled separately)
      const scoredCandidates = uniqueCandidates.map(c => {
        let score = 0;
        const genres = c.genres || [];
        const primaryGenre = genres[0]; // First genre is usually the primary one
        const hasComedy = genres.includes('comedy' as Genre);

        // Genre category definitions (using only valid Genre types)
        const lightGenres: Genre[] = ['comedy', 'animation', 'romance', 'fantasy'];
        const heavyGenres: Genre[] = ['drama', 'thriller', 'horror'];
        const laughGenres: Genre[] = ['comedy', 'animation'];
        const thrillGenres: Genre[] = ['thriller', 'horror', 'action'];
        const fastGenres: Genre[] = ['action', 'adventure', 'thriller', 'animation'];
        const slowGenres: Genre[] = ['drama', 'romance'];
        const darkGenres: Genre[] = ['thriller', 'horror'];

        // Check genre presence
        const hasLight = genres.some(g => lightGenres.includes(g));
        const hasHeavy = genres.some(g => heavyGenres.includes(g));
        const hasLaughs = genres.some(g => laughGenres.includes(g));
        const hasThrills = genres.some(g => thrillGenres.includes(g));
        const hasFast = genres.some(g => fastGenres.includes(g));
        const hasSlow = genres.some(g => slowGenres.includes(g));
        const hasDark = genres.some(g => darkGenres.includes(g));

        // Primary genre checks (stronger signal)
        const primaryIsLight = primaryGenre && lightGenres.includes(primaryGenre);
        const primaryIsHeavy = primaryGenre && heavyGenres.includes(primaryGenre);
        const primaryIsLaughs = primaryGenre && laughGenres.includes(primaryGenre);
        const primaryIsThrills = primaryGenre && thrillGenres.includes(primaryGenre);
        const primaryIsFast = primaryGenre && fastGenres.includes(primaryGenre);
        const primaryIsSlow = primaryGenre && slowGenres.includes(primaryGenre);

        // === TONE: Light vs Heavy ===
        if (preferences.tone === 'light') {
          if (primaryIsLight) score += 25;
          else if (hasLight && !hasDark) score += 15;
          else if (hasLight && hasDark) score += 0; // Mixed tone - no bonus
          // Penalize dark/heavy films when user wants light
          if (primaryIsHeavy || (hasDark && !hasLight)) score -= 20;
        } else {
          // User wants HEAVY
          if (primaryIsHeavy) score += 25;
          else if (hasHeavy) score += 15;
          // Penalize comedies when user wants heavy (comedic films undermine heaviness)
          if (hasComedy && !hasDark) score -= 25;
        }

        // === ENTERTAINMENT: Laughs vs Thrills ===
        if (preferences.entertainment === 'laughs') {
          // Comedy must be primary or film must be purely comedic
          if (primaryIsLaughs) score += 25;
          else if (hasLaughs && !hasDark && !hasHeavy) score += 15;
          else if (hasLaughs && (hasDark || genres.includes('drama' as Genre))) {
            // "Dark comedy" or "comedy-drama" - not really "laughs"
            score -= 10;
          }
        } else {
          // User wants THRILLS
          if (primaryIsThrills) score += 25;
          else if (hasThrills) score += 15;
          // Penalize pure comedies when user wants thrills
          if (primaryIsLaughs && !hasThrills) score -= 20;
        }

        // === PACING: Slow burn vs Fast-paced ===
        if (preferences.pacing === 'fast') {
          if (primaryIsFast) score += 20;
          else if (hasFast && !primaryIsSlow) score += 10;
          // Penalize slow dramas/romances when user wants fast
          if (primaryIsSlow && !hasFast) score -= 15;
        } else {
          if (primaryIsSlow) score += 20;
          else if (hasSlow) score += 10;
          // Penalize pure action films when user wants slow burn
          if (primaryGenre === 'action') score -= 10;
        }

        // === NOVELTY: Familiar vs Fresh (STRONGER weight) ===
        const isFamiliar = c.source === 'ranked';
        const isUnseen = c.source === 'unseen'; // Movies marked unknown/uncertain
        if (preferences.novelty === 'familiar') {
          if (isFamiliar) score += 35;
          else if (isUnseen) score -= 20; // Penalize unseen movies when user wants familiar
          else score -= 15; // Penalize watchlist/recs when user wants familiar
        } else {
          // User wants FRESH
          if (isUnseen) score += 40; // Extra boost for truly unseen movies
          else if (!isFamiliar) score += 35; // Watchlist, recs, new releases
          else score -= 25; // Stronger penalty for ranked movies when user wants fresh
        }

        // === MINIMUM SCORE: Don't include films that actively contradict preferences ===
        score = Math.max(score, 0);

        // Store era info for later splitting
        const isPreferredEra = preferences.era === 'classic' ? c.year < 2000 : c.year >= 2000;

        return { ...c, score, isPreferredEra };
      });

      // Filter to preferred era only, sort by score
      let moviePool = scoredCandidates
        .filter(c => c.isPreferredEra)
        .sort((a, b) => b.score - a.score)
        .slice(0, 16);

      // If not enough from preferred era, fill from other era
      if (moviePool.length < 16) {
        const otherEra = scoredCandidates
          .filter(c => !c.isPreferredEra)
          .sort((a, b) => b.score - a.score)
          .slice(0, 16 - moviePool.length);
        moviePool = [...moviePool, ...otherEra];
      }

      setPool(moviePool);

      // Short delay for animation
      setTimeout(() => {
        setTournamentIndex(0);
        setStep('tournament');
      }, 2000);
    };

    buildPool();
  }, [step, preferences, user?.id, getRankedMovies, userSession.preferences.genreScores]);

  // Get current tournament pair (16 movies: 8 R1 + 4 QF + 2 SF + 1 Final = 15 matches)
  const currentTournamentPair = useMemo((): { movieA: PoolCandidate; movieB: PoolCandidate } | null => {
    if (pool.length < 16) return null;

    const r1 = tournamentBracket.r1Winners;
    const qf = tournamentBracket.qfWinners;
    const sf = tournamentBracket.sfWinners;

    // Round 1: 8 matches (0-7)
    if (tournamentIndex < 8) {
      const idx = tournamentIndex * 2;
      return { movieA: pool[idx], movieB: pool[idx + 1] };
    }
    // QF: 4 matches (8-11)
    if (tournamentIndex < 12 && r1.length >= (tournamentIndex - 8 + 1) * 2) {
      const qfIdx = tournamentIndex - 8;
      return { movieA: r1[qfIdx * 2], movieB: r1[qfIdx * 2 + 1] };
    }
    // SF: 2 matches (12-13)
    if (tournamentIndex < 14 && qf.length >= (tournamentIndex - 12 + 1) * 2) {
      const sfIdx = tournamentIndex - 12;
      return { movieA: qf[sfIdx * 2], movieB: qf[sfIdx * 2 + 1] };
    }
    // Final: 1 match (14)
    if (tournamentIndex === 14 && sf.length >= 2) {
      return { movieA: sf[0], movieB: sf[1] };
    }

    return null;
  }, [pool, tournamentIndex, tournamentBracket]);

  // Handle tournament selection
  const handleTournamentSelect = useCallback((choice: 'A' | 'B') => {
    const pair = currentTournamentPair;
    if (!pair) return;

    setSelected(choice);
    haptics.medium();

    const winner = choice === 'A' ? pair.movieA : pair.movieB;

    setTimeout(() => {
      setSelected(null);

      if (tournamentIndex < 8) {
        // Round 1
        setTournamentBracket(prev => ({
          ...prev,
          r1Winners: [...prev.r1Winners, winner],
        }));
      } else if (tournamentIndex < 12) {
        // QF
        setTournamentBracket(prev => ({
          ...prev,
          qfWinners: [...prev.qfWinners, winner],
        }));
      } else if (tournamentIndex < 14) {
        // SF
        setTournamentBracket(prev => ({
          ...prev,
          sfWinners: [...prev.sfWinners, winner],
        }));
      } else {
        // Final
        setTournamentBracket(prev => ({
          ...prev,
          champion: winner,
        }));

        // Load result details
        loadResultDetails(winner);
        setStep('result');
        return;
      }

      setTournamentIndex(prev => prev + 1);
    }, 300);
  }, [currentTournamentPair, tournamentIndex, haptics]);

  // Handle opening movie detail for more info
  const handleMovieInfo = useCallback((movie: PoolCandidate) => {
    openMovieDetail({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      genres: movie.genres || [],
      posterUrl: movie.posterUrl || '',
      posterColor: '#1A1A2E',
      beta: 0,
      totalWins: 0,
      totalLosses: 0,
      totalComparisons: 0,
      timesShown: 0,
      lastShownAt: 0,
      status: 'uncompared',
    });
  }, [openMovieDetail]);

  // Load details for the winning movie
  const loadResultDetails = async (movie: PoolCandidate) => {
    try {
      const tmdbId = parseInt(movie.id.replace('tmdb-', ''));
      if (isNaN(tmdbId)) return;

      const [details, trailer, providers] = await Promise.all([
        getFullMovieDetails(tmdbId),
        getMovieTrailer(tmdbId),
        getWatchProviders(tmdbId),
      ]);

      setResultDetails({
        runtime: formatRuntime(details.runtime),
        streamingProviders: providers.stream.slice(0, 4).map(p => ({
          name: p.provider_name,
          logoUrl: getProviderLogoUrl(p.logo_path),
        })),
        trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
      });
    } catch (err) {
      console.error('[Decide] Failed to load result details:', err);
    }
  };

  // Handle share
  const handleShare = async (isGroup: boolean = false) => {
    const champion = isGroup ? room?.champion : tournamentBracket.champion;
    if (!champion) return;

    const message = isGroup
      ? `Our group is watching "${champion.title}" tonight! 🎬\n\nDecided together on Aaybee — the app that settles "what should we watch?" in 2 minutes.\n\naaybee.netlify.app`
      : `Watching "${champion.title}" tonight! 🎬\n\nDecided in 2 min on Aaybee — rank movies head-to-head and get perfect picks.\n\naaybee.netlify.app`;

    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ text: message });
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(message);
        }
      } else {
        await Share.share({ message });
      }
    } catch (err) {
      console.error('[Decide] Share failed:', err);
    }
  };

  // Handle decide again
  const handleDecideAgain = () => {
    setStep('mode-select');
    setPreferenceIndex(0);
    setTournamentIndex(0);
    setSelected(null);
    setPreferences({
      tone: 'light',
      entertainment: 'laughs',
      pacing: 'slow',
      novelty: 'fresh',
      era: 'modern',
    });
    setPool([]);
    setTournamentBracket({ r1Winners: [], qfWinners: [], sfWinners: [], champion: null });
    setResultDetails(null);
    // Reset group state
    setRoom(null);
    setMembers([]);
    setRoomCode('');
    setJoinCode('');
    setGroupPreferenceIndex(0);
    setHasSubmittedPrefs(false);
    setHasVoted(false);
    setVetoMessage(null);
    setErrorMessage(null);
    setVetoMode(false);
    setMatchVotes([]);
    setIsTransitioning(false);
    setCouplesAgreed(null);
    couplesAdvanceRef.current = false;
  };

  // ============================================
  // GROUP MODE HANDLERS
  // ============================================

  // Create a new group room
  const handleCreateRoom = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setErrorMessage(null);

    const displayName = user?.user_metadata?.display_name || 'Host';
    const { room: newRoom, error } = await groupDecideService.createRoom(user.id, displayName);

    setIsLoading(false);

    if (error || !newRoom) {
      setErrorMessage(error || 'Failed to create room');
      return;
    }

    setRoom(newRoom);
    setRoomCode(newRoom.code);
    setStep('group-waiting');
  };

  // Join an existing room
  const handleJoinRoom = async () => {
    if (!joinCode || joinCode.length !== 4) {
      setErrorMessage('Enter a 4-letter code');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const displayName = user?.user_metadata?.display_name || 'Guest';
    const { room: joinedRoom, member, error } = await groupDecideService.joinRoom(
      joinCode.toUpperCase(),
      user?.id || null,
      displayName
    );

    setIsLoading(false);

    if (error || !joinedRoom) {
      setErrorMessage(error || 'Failed to join room');
      return;
    }

    setRoom(joinedRoom);
    setRoomCode(joinedRoom.code);
    setVetoesRemaining(member?.vetoes_remaining || 1);
    // Store member ID for guest voting (when user?.id is not available)
    if (!user?.id && member?.id) {
      setGuestMemberId(member.id);
    }
    setStep('group-waiting');
  };

  // Host starts the preferences phase
  const handleStartGroupPreferences = async () => {
    if (!room?.id) return;

    const { error } = await supabase
      .from('decide_rooms')
      .update({ status: 'preferences' })
      .eq('id', room.id);

    if (!error) {
      setStep('group-preferences');
    }
  };

  // Submit group preferences
  const submitGroupPreferences = async (finalPrefs: GroupPreferences) => {
    const effectiveUserId = user?.id || guestMemberId;
    if (!room?.id || !effectiveUserId) return;

    console.log('[GroupDecide] Submitting preferences:', finalPrefs);

    const { success, error } = await groupDecideService.submitPreferences(
      room.id,
      effectiveUserId,
      finalPrefs
    );

    console.log('[GroupDecide] Submit result:', { success, error });

    if (success) {
      setHasSubmittedPrefs(true);
    } else {
      setErrorMessage(error || 'Failed to submit preferences');
    }
  };

  // Handle group preference selection
  const handleGroupPreferenceSelect = useCallback((choice: 'A' | 'B') => {
    setSelected(choice);
    haptics.light();

    setTimeout(() => {
      setSelected(null);

      const pair = currentGroupPreferencePair;
      const selectedOption = choice === 'A' ? pair.optionA.key : pair.optionB.key;

      // Build the updated preferences
      const updatedPrefs = {
        ...groupPreferences,
        [pair.id]: selectedOption,
      };

      setGroupPreferences(updatedPrefs);

      if (groupPreferenceIndex < TOTAL_PREFERENCES - 1) {
        setGroupPreferenceIndex(prev => prev + 1);
      } else {
        // Submit with the updated preferences directly
        submitGroupPreferences(updatedPrefs);
      }
    }, 300);
  }, [groupPreferenceIndex, currentGroupPreferencePair, haptics, groupPreferences, room?.id, user?.id]);

  // Host finalizes preferences and builds pool
  const handleFinalizePreferences = async () => {
    if (!room?.id) return;
    setIsLoading(true);

    const { preferences: finalPrefs, error } = await groupDecideService.finalizePreferences(room.id);

    if (error) {
      setErrorMessage(error);
      setIsLoading(false);
      return;
    }

    // Build pool — 8 movies for couples, 16 for group
    const poolSize = members.length === 2 ? 8 : 16;
    await buildGroupPool(finalPrefs, poolSize);
  };

  // Build pool for group mode
  const buildGroupPool = async (prefs: GroupPreferences, poolSize: number = 16) => {
    // Gather candidates from all members' watchlists, recommendations, etc.
    // For simplicity, use host's data (could be enhanced to merge all members' data)
    const watchlistData = user?.id ? await watchlistService.getWatchlist(user.id) : [];
    const watchlistCandidates: PoolCandidate[] = watchlistData.map(w => ({
      id: w.movie_id,
      title: w.title,
      year: w.year,
      genres: [],
      posterUrl: w.poster_url || '',
      posterColor: '#1A1A1E',
      source: 'watchlist' as const,
      score: 0,
    }));

    const recsData = user?.id ? await recommendationService.getRecommendations(user.id, 20, getRevealedMovieIds(), { ...userSession.preferences, maxTier: getEffectiveTier(userSession.totalComparisons, userSession.poolUnlockedTier) }) : { recommendations: [] };
    const recCandidates: PoolCandidate[] = recsData.recommendations.map(r => ({
      id: r.movieId,
      title: r.title,
      year: r.year,
      genres: (r.genres || []) as Genre[],
      posterUrl: r.posterUrl || '',
      posterColor: '#1A1A1E',
      source: 'recommendation' as const,
      score: 0,
    }));

    const rankedMovies = getRankedMovies().slice(0, 50);
    const rankedCandidates: PoolCandidate[] = rankedMovies.map(m =>
      decideService.movieToCandidate(m, 'ranked')
    );

    // Get unseen movies (uncertain + unknown)
    const uncertainMovies = getMoviesByStatus('uncertain').slice(0, 30);
    const unknownMovies = getMoviesByStatus('unknown').slice(0, 30);
    const unseenCandidates: PoolCandidate[] = [
      ...uncertainMovies.map(m => decideService.movieToCandidate(m, 'unseen')),
      ...unknownMovies.map(m => decideService.movieToCandidate(m, 'unseen')),
    ];

    // Combine and score (same scoring logic as personal mode)
    const allCandidates = [...watchlistCandidates, ...recCandidates, ...rankedCandidates, ...unseenCandidates];
    const seen = new Set<string>();
    const uniqueCandidates = allCandidates.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Score candidates based on group preferences
    const scoredCandidates = scorePoolCandidates(uniqueCandidates, prefs);

    // Filter to preferred era only
    let moviePool = scoredCandidates
      .filter(c => c.isPreferredEra)
      .sort((a, b) => b.score - a.score)
      .slice(0, poolSize);

    // If not enough, fill from other era
    if (moviePool.length < poolSize) {
      const otherEra = scoredCandidates
        .filter(c => !c.isPreferredEra)
        .sort((a, b) => b.score - a.score)
        .slice(0, poolSize - moviePool.length);
      moviePool = [...moviePool, ...otherEra];
    }

    // Cold-start fallback: if pool is still too thin, ask host to pick a curated pack
    if (moviePool.length < 8) {
      setNeedsPackSelection(true);
      setIsLoading(false);
      return;
    }

    // Start tournament — couples mode sets host as first picker
    if (room?.id) {
      const isCouplesStart = members.length === 2;
      await groupDecideService.startTournament(
        room.id,
        moviePool,
        isCouplesStart ? { couplesPickerId: room.host_id } : undefined
      );
    }
    setIsLoading(false);
  };

  // Handle curated pack selection (cold-start fallback)
  const handlePackSelect = async (pack: CuratedPack) => {
    setSelectedPack(pack);
    setNeedsPackSelection(false);
    setIsLoading(true);

    try {
      // Extract TMDB numeric IDs from 'tmdb-{id}' format
      const tmdbIds = pack.movieIds.map(id => parseInt(id.replace('tmdb-', ''), 10));
      const tmdbMovies = await getMoviesByIds(tmdbIds);

      const packPool: PoolCandidate[] = tmdbMovies.map(m => {
        const app = tmdbToAppMovie(m);
        return {
          id: app.id,
          title: app.title,
          year: app.year,
          genres: app.genres,
          posterUrl: app.posterUrl,
          posterColor: app.posterColor,
          source: 'recommendation' as const,
          score: 0,
        };
      });

      // Need at least 8 for a bracket; packs have 10 so take up to poolSize
      const poolSize = members.length === 2 ? 8 : Math.min(packPool.length, 16);
      const moviePool = packPool.slice(0, poolSize);

      if (room?.id) {
        const isCouplesStart = members.length === 2;
        await groupDecideService.startTournament(
          room.id,
          moviePool,
          isCouplesStart ? { couplesPickerId: room.host_id } : undefined
        );
      }
    } catch (err) {
      console.error('[DecideScreen] Failed to load curated pack:', err);
      setErrorMessage('Failed to load movie pack. Try again.');
      setNeedsPackSelection(true);
    }
    setIsLoading(false);
  };

  // Score pool candidates (extracted for reuse)
  const scorePoolCandidates = (candidates: PoolCandidate[], prefs: GroupPreferences) => {
    const lightGenres: Genre[] = ['comedy', 'animation', 'romance', 'fantasy'];
    const heavyGenres: Genre[] = ['drama', 'thriller', 'horror'];
    const laughGenres: Genre[] = ['comedy', 'animation'];
    const thrillGenres: Genre[] = ['thriller', 'horror', 'action'];
    const fastGenres: Genre[] = ['action', 'adventure', 'thriller', 'animation'];
    const slowGenres: Genre[] = ['drama', 'romance'];
    const darkGenres: Genre[] = ['thriller', 'horror'];

    return candidates.map(c => {
      let score = 0;
      const genres = c.genres || [];
      const primaryGenre = genres[0];
      const hasComedy = genres.includes('comedy' as Genre);

      const hasLight = genres.some(g => lightGenres.includes(g));
      const hasHeavy = genres.some(g => heavyGenres.includes(g));
      const hasLaughs = genres.some(g => laughGenres.includes(g));
      const hasThrills = genres.some(g => thrillGenres.includes(g));
      const hasFast = genres.some(g => fastGenres.includes(g));
      const hasSlow = genres.some(g => slowGenres.includes(g));
      const hasDark = genres.some(g => darkGenres.includes(g));

      const primaryIsLight = primaryGenre && lightGenres.includes(primaryGenre);
      const primaryIsHeavy = primaryGenre && heavyGenres.includes(primaryGenre);
      const primaryIsLaughs = primaryGenre && laughGenres.includes(primaryGenre);
      const primaryIsThrills = primaryGenre && thrillGenres.includes(primaryGenre);
      const primaryIsFast = primaryGenre && fastGenres.includes(primaryGenre);
      const primaryIsSlow = primaryGenre && slowGenres.includes(primaryGenre);

      // Tone
      if (prefs.tone === 'light') {
        if (primaryIsLight) score += 25;
        else if (hasLight && !hasDark) score += 15;
        if (primaryIsHeavy || (hasDark && !hasLight)) score -= 20;
      } else {
        if (primaryIsHeavy) score += 25;
        else if (hasHeavy) score += 15;
        if (hasComedy && !hasDark) score -= 25;
      }

      // Entertainment
      if (prefs.entertainment === 'laughs') {
        if (primaryIsLaughs) score += 25;
        else if (hasLaughs && !hasDark && !hasHeavy) score += 15;
        else if (hasLaughs && (hasDark || genres.includes('drama' as Genre))) score -= 10;
      } else {
        if (primaryIsThrills) score += 25;
        else if (hasThrills) score += 15;
        if (primaryIsLaughs && !hasThrills) score -= 20;
      }

      // Pacing
      if (prefs.pacing === 'fast') {
        if (primaryIsFast) score += 20;
        else if (hasFast && !primaryIsSlow) score += 10;
        if (primaryIsSlow && !hasFast) score -= 15;
      } else {
        if (primaryIsSlow) score += 20;
        else if (hasSlow) score += 10;
        if (primaryGenre === 'action') score -= 10;
      }

      // Novelty
      const isFamiliar = c.source === 'ranked';
      const isUnseen = c.source === 'unseen';
      if (prefs.novelty === 'familiar') {
        if (isFamiliar) score += 35;
        else if (isUnseen) score -= 20;
        else score -= 15;
      } else {
        if (isUnseen) score += 40;
        else if (!isFamiliar) score += 35;
        else score -= 25;
      }

      score = Math.max(score, 0);
      const isPreferredEra = prefs.era === 'classic' ? c.year < 2000 : c.year >= 2000;

      return { ...c, score, isPreferredEra };
    });
  };

  // Handle group tournament vote
  const handleGroupTournamentVote = async (choice: 'A' | 'B') => {
    const effectiveUserId = user?.id || guestMemberId;
    if (!room?.id || !effectiveUserId || hasVoted) return;

    setSelected(choice);
    haptics.medium();

    const { success } = await groupDecideService.submitMatchVote(
      room.id,
      room.current_round,
      room.current_match,
      effectiveUserId,
      choice
    );

    if (success) {
      setHasVoted(true);
    }

    setTimeout(() => setSelected(null), 300);
  };

  // Host advances match when all votes are in
  const handleAdvanceMatch = async () => {
    if (!room?.id) return;

    const pair = groupDecideService.getCurrentMatchPair(room);
    if (!pair) return;

    // Filter votes for current match only
    const currentMatchVotes = matchVotes.filter(
      v => v.round === room.current_round && v.match_index === room.current_match
    );

    const result = groupDecideService.calculateMatchResult(pair.movieA, pair.movieB, currentMatchVotes);

    await groupDecideService.advanceMatch(
      room.id,
      result.winner,
      result.loser,
      result.margin
    );

    // Room update will come via subscription, which will trigger matchKey change and reset state
  };

  // Handle veto - when in veto mode, tap a movie to veto it
  const handleVeto = async (movieId: string) => {
    const effectiveUserId = user?.id || guestMemberId;
    if (!room?.id || !effectiveUserId || vetoesRemaining <= 0 || !vetoMode) return;

    const displayName = user?.user_metadata?.display_name || 'Someone';
    const { replacement, error } = await groupDecideService.vetoMovie(
      room.id,
      effectiveUserId,
      displayName,
      movieId
    );

    setVetoMode(false);

    if (error) {
      setErrorMessage(error);
    } else if (replacement) {
      setVetoMessage(`Vetoed! ${replacement.title} now advances`);
      setVetoesRemaining(prev => prev - 1);
      setTimeout(() => setVetoMessage(null), 3000);
    }
  };

  // Toggle veto mode
  const toggleVetoMode = () => {
    if (vetoesRemaining > 0) {
      setVetoMode(prev => !prev);
    }
  };

  // Continue to next round after recap
  const handleContinueRound = async () => {
    if (!room?.id) return;
    setVetoMode(false);
    await groupDecideService.continueToNextRound(room.id);
  };

  // Get advancing movies for recap
  const advancingMovies = useMemo(() => {
    if (!room) return [];
    return groupDecideService.getAdvancingMovies(room);
  }, [room]);

  // All members voted?
  const allMembersVoted = useMemo(() => {
    return matchVotes.length >= members.length && members.length > 0;
  }, [matchVotes.length, members.length]);

  // Guest state — guests can join group rooms but not use personal mode
  const isInGroupFlow = step.startsWith('group-');
  // Personal mode locked for guests or not enough comparisons
  const isPersonalLocked = isGuest || (unlockAllFeatures ? false : postOnboardingComparisons < MIN_COMPARISONS_FOR_DECIDE);

  // ============================================
  // TWO-PERSON DECIDE HANDLERS
  // ============================================

  const handleStartDuo = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    // Get 32 random movies (16 for each person, no overlap)
    const { data: randomMovies } = await supabase
      .from('movies')
      .select('id, title, year, poster_url')
      .lte('tier', 2)
      .limit(80);

    if (!randomMovies || randomMovies.length < 32) {
      setErrorMessage('Not enough movies available');
      setIsLoading(false);
      return;
    }

    const shuffled = [...randomMovies].sort(() => Math.random() - 0.5);
    const p1Pool: BracketMovie[] = shuffled.slice(0, 16).map(m => ({
      id: m.id, title: m.title, posterUrl: m.poster_url || '', year: m.year,
    }));

    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Person 1';
    const bracket = createVsBracket(p1Pool);

    const { session, error } = await decideSessionService.createSession(
      user?.id || null, displayName, bracket,
    );

    if (session) {
      setDuoSession(session);
      setDuoBracketMovies(bracket);
      setDuoIsPersonOne(true);
      setStep('duo-knockout');
    } else {
      setErrorMessage(error || 'Failed to create session');
    }

    setIsLoading(false);
  }, [user]);

  const handleDuoKnockoutComplete = useCallback(async (picks: BracketPick[], winner: BracketMovie) => {
    if (!duoSession) return;

    // Get the top 4 from the bracket (winner + finalist + semi-final losers)
    const ranking = bracketToRanking(duoBracketMovies.length, picks);
    const final4: BracketMovie[] = ranking.slice(0, 4).map(idx => duoBracketMovies[idx]);

    if (duoIsPersonOne) {
      const { session } = await decideSessionService.submitPerson1Knockout(duoSession.id, picks, final4);
      if (session) setDuoSession(session);
      setStep('duo-waiting');
    } else {
      const { session } = await decideSessionService.submitPerson2Knockout(
        duoSession.id, picks, final4, duoSession.person1_final4 || [],
      );
      if (session) setDuoSession(session);
      setStep('duo-negotiate');
    }
  }, [duoSession, duoBracketMovies, duoIsPersonOne]);

  const handleJoinDuo = useCallback(async (code: string) => {
    setIsLoading(true);
    const session = await decideSessionService.getByCode(code);
    if (!session) {
      setErrorMessage('Session not found');
      setIsLoading(false);
      return;
    }

    // Get 16 movies for Person 2 (no overlap with Person 1)
    const p1Ids = new Set((session.person1_movies || []).map((m: BracketMovie) => m.id));

    const { data: randomMovies } = await supabase
      .from('movies')
      .select('id, title, year, poster_url')
      .lte('tier', 2)
      .limit(80);

    if (!randomMovies) {
      setErrorMessage('Failed to load movies');
      setIsLoading(false);
      return;
    }

    const available = randomMovies.filter(m => !p1Ids.has(m.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const p2Pool: BracketMovie[] = shuffled.slice(0, 16).map(m => ({
      id: m.id, title: m.title, posterUrl: m.poster_url || '', year: m.year,
    }));

    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Person 2';
    const bracket = createVsBracket(p2Pool);

    const { session: updated } = await decideSessionService.joinSession(
      session.id, user?.id || null, displayName, bracket,
    );

    if (updated) {
      setDuoSession(updated);
      setDuoBracketMovies(bracket);
      setDuoIsPersonOne(false);
      setStep('duo-knockout');
    }

    setIsLoading(false);
  }, [user]);

  // Poll for session updates during waiting/negotiation
  useEffect(() => {
    if (!duoSession || !['duo-waiting', 'duo-negotiate'].includes(step)) return;
    const interval = setInterval(async () => {
      const updated = await decideSessionService.getByCode(duoSession.code);
      if (updated) {
        setDuoSession(updated);
        // Auto-advance if status changed
        if (updated.status === 'negotiating' && step === 'duo-waiting') {
          setStep('duo-negotiate');
        }
        if (updated.status === 'complete') {
          setStep('duo-result');
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [duoSession?.code, step]);

  // RENDER: Mode Select
  if (step === 'mode-select') {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <Animated.View style={styles.modeSelectContainer} entering={FadeIn.duration(300)}>
            {/* Title removed — sub-nav handles it */}
            <Text style={styles.screenSubtitle}>WHAT TO WATCH TONIGHT?</Text>

            <View style={styles.modeCardsRow}>
              {/* Personal — A card */}
              <View style={styles.modeCardWrapper}>
                <Text style={styles.modeCardTopLabel}>Personal</Text>
                <Pressable
                  style={[styles.modeCard, isPersonalLocked && styles.modeCardDisabled]}
                  onPress={() => {
                    if (isPersonalLocked) {
                      haptics.light();
                      showLockedFeature({
                        feature: 'personal decide',
                        requirement: isGuest
                          ? 'sign in and compare movies to unlock personal decide'
                          : `compare ${MIN_COMPARISONS_FOR_DECIDE - postOnboardingComparisons} more movie${MIN_COMPARISONS_FOR_DECIDE - postOnboardingComparisons !== 1 ? 's' : ''} to unlock`,
                        progress: isGuest ? undefined : {
                          current: postOnboardingComparisons,
                          required: MIN_COMPARISONS_FOR_DECIDE,
                        },
                      });
                    } else {
                      setStep('preferences');
                      setPreferenceIndex(0);
                    }
                  }}
                >
                  <Image source={{ uri: MODE_POSTER_PERSONAL }} style={styles.modeCardPoster} resizeMode="cover" />
                  <View style={styles.modeCardPosterGradient} />
                  <View style={[styles.modeCardBadge, { backgroundColor: colors.tournamentA }]}>
                    <Text style={styles.modeCardBadgeText}>A</Text>
                  </View>
                </Pressable>
                <Text style={styles.modeCardBottomLabel}>by yourself</Text>
              </View>

              {/* Group — B card */}
              <View style={styles.modeCardWrapper}>
                <Text style={styles.modeCardTopLabel}>Group</Text>
                <Pressable
                  style={styles.modeCard}
                  onPress={() => setStep('group-create')}
                >
                  <Image source={{ uri: MODE_POSTER_GROUP }} style={styles.modeCardPoster} resizeMode="cover" />
                  <View style={styles.modeCardPosterGradient} />
                  <View style={[styles.modeCardBadge, { backgroundColor: colors.tournamentB }]}>
                    <Text style={styles.modeCardBadgeText}>B</Text>
                  </View>
                </Pressable>
                <Text style={styles.modeCardBottomLabel}>with friends</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Create/Join
  if (step === 'group-create') {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <Animated.View style={styles.groupContainer} entering={FadeIn.duration(300)}>
            {/* Back button + title removed — sub-nav handles it */}
            <Text style={styles.screenSubtitle}>WATCH WITH FRIENDS</Text>

            <View style={styles.groupOptions}>
              {/* Two-person knockout → negotiation */}
              <Pressable
                style={styles.groupOptionCard}
                onPress={handleStartDuo}
                disabled={isLoading}
              >
                <Text style={styles.groupOptionTitle}>JUST TWO</Text>
                <Text style={styles.groupOptionDescription}>
                  knockout + negotiate with one person
                </Text>
              </Pressable>

              {/* 3+ person room */}
              <Pressable
                style={styles.groupOptionCard}
                onPress={handleCreateRoom}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <Text style={styles.groupOptionTitle}>GROUP (3+)</Text>
                    <Text style={styles.groupOptionDescription}>
                      Create a room and invite friends
                    </Text>
                  </>
                )}
              </Pressable>

              <Text style={styles.orText}>or</Text>

              <View style={styles.joinSection}>
                <Text style={styles.joinLabel}>JOIN WITH CODE</Text>
                <TextInput
                  style={styles.codeInput}
                  value={joinCode}
                  onChangeText={(text) => setJoinCode(text.toUpperCase().slice(0, 6))}
                  placeholder="ENTER CODE"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  maxLength={6}
                />
                <Pressable
                  style={[styles.joinButton, joinCode.length < 4 && styles.joinButtonDisabled]}
                  onPress={async () => {
                    if (joinCode.length === 6) {
                      // Try duo session first
                      await handleJoinDuo(joinCode);
                    } else if (joinCode.length === 4) {
                      // Try group room
                      handleJoinRoom();
                    }
                  }}
                  disabled={isLoading || joinCode.length < 4}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.background} size="small" />
                  ) : (
                    <Text style={styles.joinButtonText}>JOIN</Text>
                  )}
                </Pressable>
              </View>
            </View>

            {errorMessage && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}
          </Animated.View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Waiting Room
  if (step === 'group-waiting') {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <Animated.View style={styles.groupContainer} entering={FadeIn.duration(300)}>
            <Text style={styles.screenTitle}>waiting room</Text>

            <View style={styles.roomCodeSection}>
              <Text style={styles.roomCodeLabel}>Share this code</Text>
              <Text style={styles.roomCode}>{roomCode}</Text>
              <Pressable
                style={styles.shareCodeButton}
                onPress={async () => {
                  const msg = `Join Group Decide! 🎬\n\nCode: ${roomCode}\n\nDecide what to watch together on Aaybee`;
                  try {
                    if (Platform.OS === 'web') {
                      if (navigator.share) {
                        await navigator.share({ text: msg });
                      } else if (navigator.clipboard) {
                        await navigator.clipboard.writeText(msg);
                      }
                    } else {
                      await Share.share({ message: msg });
                    }
                  } catch (err) {
                    console.error('Share failed:', err);
                  }
                }}
              >
                <Text style={styles.shareCodeButtonText}>Share Invite</Text>
              </Pressable>
            </View>

            <View style={styles.membersSection}>
              <Text style={styles.membersLabel}>{members.length} member{members.length !== 1 ? 's' : ''}</Text>
              <ScrollView style={styles.membersList}>
                {members.map((member, idx) => (
                  <View key={member.id} style={styles.memberRow}>
                    <Text style={styles.memberName}>
                      {member.display_name}
                      {member.is_host && ' (host)'}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            {isHost ? (
              <Pressable
                style={styles.startButton}
                onPress={handleStartGroupPreferences}
              >
                <Text style={styles.startButtonText}>
                  {members.length < 2 ? 'Start (Solo Test)' : 'Start'}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.waitingHost}>
                <ActivityIndicator color={colors.textMuted} size="small" />
                <Text style={styles.waitingHostText}>Waiting for host to start...</Text>
              </View>
            )}
          </Animated.View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Preferences
  if (step === 'group-preferences') {
    if (hasSubmittedPrefs) {
      // Waiting for others
      return (
        <CinematicBackground>
          <View style={styles.container}>
            <View style={styles.groupContainer}>
              <Text style={styles.screenTitle}>preferences submitted</Text>
              <Text style={styles.screenSubtitle}>
                {prefsSubmittedCount} of {members.length} voted
              </Text>

              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />

              {isHost && prefsSubmittedCount >= members.length && (
                <Pressable style={styles.startButton} onPress={handleFinalizePreferences}>
                  <Text style={styles.startButtonText}>Build Movie Pool</Text>
                </Pressable>
              )}
            </View>
          </View>
        </CinematicBackground>
      );
    }

    const pair = currentGroupPreferencePair;
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.bracketContainer}>
            <Text style={styles.bracketTitle}>{pair.question}</Text>

            <View style={styles.preferenceCards}>
              <PreferenceCard
                label={pair.optionA.label}
                icon={pair.optionA.icon}
                position="A"
                onSelect={() => handleGroupPreferenceSelect('A')}
                isSelected={selected === 'A'}
                isLoser={selected === 'B'}
              />
              <PreferenceCard
                label={pair.optionB.label}
                icon={pair.optionB.icon}
                position="B"
                onSelect={() => handleGroupPreferenceSelect('B')}
                isSelected={selected === 'B'}
                isLoser={selected === 'A'}
              />
            </View>
          </View>
          <OnboardingProgressBar
            progress={groupPreferenceIndex / TOTAL_PREFERENCES}
            current={groupPreferenceIndex}
            total={TOTAL_PREFERENCES}
            label="Setting your preferences"
          />
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Building Pool (with curated pack fallback)
  if (step === 'group-building') {
    if (needsPackSelection) {
      return (
        <CinematicBackground>
          <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.packScrollContent}>
              <View style={styles.packSection}>
                <Text style={styles.packPrompt}>pick a category for your group</Text>
                {CURATED_PACKS.map(pack => (
                  <Pressable
                    key={pack.id}
                    style={styles.packCard}
                    onPress={() => handlePackSelect(pack)}
                    disabled={isLoading}
                  >
                    <Text style={styles.packTitle}>{pack.title}</Text>
                    <Text style={styles.packSubtitle}>{pack.subtitle}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </CinematicBackground>
      );
    }

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>curating the group's picks...</Text>
          </View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Couples Tournament (2 members — sequential pick/agree)
  if (step === 'group-tournament' && isCouplesMode) {
    const pair = currentGroupPair;
    if (!pair || !room || isTransitioning) {
      return (
        <CinematicBackground>
          <View style={styles.container}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          </View>
        </CinematicBackground>
      );
    }

    const isPicker = user?.id === room.couples_picker_id;
    const pickerMember = members.find(m => m.user_id === room.couples_picker_id);
    const responderMember = members.find(m => m.user_id !== room.couples_picker_id);
    const pickerName = pickerMember?.display_name || 'Partner';
    const responderName = responderMember?.display_name || 'Partner';
    const pickerVote = matchVotes.find(v => v.user_id === room.couples_picker_id);
    const matchesPerRound = groupDecideService.getMatchesPerRound(true);
    const roundName = groupDecideService.getCouplesRoundName(room.current_round);
    const matchNumber = room.current_match + 1;
    const totalMatchesInRound = matchesPerRound[room.current_round - 1] || 1;

    // Show explanation hint on the very first match
    const isFirstMatch = room.current_round === 1 && room.current_match === 0;

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.tournamentContainer}>
            <Text style={styles.roundLabel}>{roundName} · Match {matchNumber}/{totalMatchesInRound}</Text>

            {!matchComplete ? (
              <>
                {isPicker ? (
                  // PICKER UI
                  <>
                    <Text style={styles.tournamentTitle}>
                      {hasVoted ? `waiting for ${responderName}...` : 'your turn to pick'}
                    </Text>

                    <View style={styles.tournamentCards}>
                      <TournamentCard
                        movie={pair.movieA}
                        label="A"
                        onSelect={() => handleGroupTournamentVote('A')}
                        onMoreInfo={() => handleMovieInfo(pair.movieA)}
                        isSelected={selected === 'A'}
                        isLoser={selected === 'B'}
                        disabled={hasVoted}
                      />
                      <TournamentCard
                        movie={pair.movieB}
                        label="B"
                        onSelect={() => handleGroupTournamentVote('B')}
                        onMoreInfo={() => handleMovieInfo(pair.movieB)}
                        isSelected={selected === 'B'}
                        isLoser={selected === 'A'}
                        disabled={hasVoted}
                      />
                    </View>

                    {hasVoted && (
                      <View style={styles.voteStatus}>
                        <ActivityIndicator color={colors.accent} size="small" />
                      </View>
                    )}
                  </>
                ) : (
                  // RESPONDER UI
                  <>
                    <Text style={styles.tournamentTitle}>
                      {!pickerVote
                        ? `waiting for ${pickerName} to pick...`
                        : hasVoted
                          ? 'deciding...'
                          : `${pickerName} picked ${pickerVote.choice === 'A' ? pair.movieA.title : pair.movieB.title}`}
                    </Text>

                    {pickerVote && !hasVoted && (
                      <Text style={styles.couplesSubtitle}>agree or pick different?</Text>
                    )}

                    <View style={styles.tournamentCards}>
                      <TournamentCard
                        movie={pair.movieA}
                        label="A"
                        onSelect={() => handleGroupTournamentVote('A')}
                        onMoreInfo={() => handleMovieInfo(pair.movieA)}
                        isSelected={pickerVote?.choice === 'A' && !hasVoted ? true : selected === 'A'}
                        isLoser={selected === 'B'}
                        disabled={!pickerVote || hasVoted}
                      />
                      <TournamentCard
                        movie={pair.movieB}
                        label="B"
                        onSelect={() => handleGroupTournamentVote('B')}
                        onMoreInfo={() => handleMovieInfo(pair.movieB)}
                        isSelected={pickerVote?.choice === 'B' && !hasVoted ? true : selected === 'B'}
                        isLoser={selected === 'A'}
                        disabled={!pickerVote || hasVoted}
                      />
                    </View>

                    {!pickerVote && (
                      <View style={styles.voteStatus}>
                        <ActivityIndicator color={colors.accent} size="small" />
                      </View>
                    )}
                  </>
                )}

                {isFirstMatch && !hasVoted && !pickerVote && (
                  <Text style={styles.couplesHint}>
                    one picks, the other responds. disagree? your pick wins — but you go first next round.
                  </Text>
                )}
              </>
            ) : (
              // MATCH RESULT (couples)
              <Animated.View entering={FadeIn.duration(300)} style={styles.winnerDisplay}>
                <Text style={styles.matchWinnerLabel}>
                  {couplesAgreed ? 'you both agreed!' : `${responderMember?.user_id === user?.id ? 'your' : `${responderName}'s`} pick wins`}
                </Text>

                {matchWinner?.posterUrl ? (
                  <Image source={{ uri: matchWinner.posterUrl }} style={styles.winnerPoster} />
                ) : (
                  <View style={[styles.winnerPoster, styles.tournamentPosterFallback]}>
                    <Text style={styles.tournamentFallbackText}>{matchWinner?.title.slice(0, 2)}</Text>
                  </View>
                )}
                <Text style={styles.winnerTitle}>{matchWinner?.title}</Text>
                <Text style={styles.winnerYear}>{matchWinner?.year}</Text>
                <Text style={styles.winnerAdvances}>advances!</Text>

                {!couplesAgreed && (
                  <Text style={styles.couplesPickerSwitch}>
                    {responderName} picks first next round
                  </Text>
                )}
              </Animated.View>
            )}
          </View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Tournament (3+ members — simultaneous voting)
  if (step === 'group-tournament') {
    const pair = currentGroupPair;
    if (!pair || !room || isTransitioning) {
      return (
        <CinematicBackground>
          <View style={styles.container}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          </View>
        </CinematicBackground>
      );
    }

    const roundName = groupDecideService.getRoundName(room.current_round);
    const matchNumber = room.current_match + 1;
    const totalMatchesInRound = [8, 4, 2, 1][room.current_round - 1] || 1;

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.tournamentContainer}>
            <Text style={styles.roundLabel}>{roundName} · Match {matchNumber}/{totalMatchesInRound}</Text>

            {!matchComplete ? (
              <>
                <Text style={styles.tournamentTitle}>Which would you rather watch?</Text>

                {/* Countdown Timer */}
                <View style={styles.countdownContainer}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>

                <View style={styles.tournamentCards}>
                  <TournamentCard
                    movie={pair.movieA}
                    label="A"
                    onSelect={() => handleGroupTournamentVote('A')}
                    onMoreInfo={() => handleMovieInfo(pair.movieA)}
                    isSelected={selected === 'A'}
                    isLoser={selected === 'B'}
                    disabled={hasVoted || countdown === 0}
                  />
                  <TournamentCard
                    movie={pair.movieB}
                    label="B"
                    onSelect={() => handleGroupTournamentVote('B')}
                    onMoreInfo={() => handleMovieInfo(pair.movieB)}
                    isSelected={selected === 'B'}
                    isLoser={selected === 'A'}
                    disabled={hasVoted || countdown === 0}
                  />
                </View>

                <View style={styles.voteStatus}>
                  <Text style={styles.voteStatusText}>
                    {matchVotes.length} of {members.length} voted
                  </Text>
                  {hasVoted && (
                    <Text style={styles.votedText}>You voted!</Text>
                  )}
                </View>
              </>
            ) : (
              <>
                {/* Match Complete - Show Winner Only */}
                <Animated.View entering={FadeIn.duration(300)} style={styles.winnerDisplay}>
                  {matchWinner?.posterUrl ? (
                    <Image source={{ uri: matchWinner.posterUrl }} style={styles.winnerPoster} />
                  ) : (
                    <View style={[styles.winnerPoster, styles.tournamentPosterFallback]}>
                      <Text style={styles.tournamentFallbackText}>{matchWinner?.title.slice(0, 2)}</Text>
                    </View>
                  )}
                  <Text style={styles.winnerTitle}>{matchWinner?.title}</Text>
                  <Text style={styles.winnerYear}>{matchWinner?.year}</Text>
                  <Text style={styles.winnerAdvances}>advances!</Text>
                  {(() => {
                    const votesA = matchVotes.filter(v => v.choice === 'A').length;
                    const votesB = matchVotes.filter(v => v.choice === 'B').length;
                    const isTie = votesA === votesB;
                    return (
                      <Text style={[styles.voteStatusText, isTie && styles.tieText]}>
                        {isTie
                          ? `Tied ${votesA}-${votesB} — decided by ranking`
                          : `Votes: ${votesA} - ${votesB}`}
                      </Text>
                    );
                  })()}

                  {isHost ? (
                    <Pressable style={styles.advanceButton} onPress={handleAdvanceMatch}>
                      <Text style={styles.advanceButtonText}>Next</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.waitingHostText}>Waiting for host...</Text>
                  )}
                </Animated.View>
              </>
            )}
          </View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Recap (after each round — group mode only, couples skip recap)
  if (step === 'group-recap') {
    const roundName = room
      ? (isCouplesMode ? groupDecideService.getCouplesRoundName(room.current_round) : groupDecideService.getRoundName(room.current_round))
      : '';
    const nextRoundName = room
      ? (isCouplesMode ? groupDecideService.getCouplesRoundName(room.current_round + 1) : groupDecideService.getNextRoundName(room.current_round))
      : '';

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.recapContainerCompact}>
            <Text style={styles.recapTitle}>{roundName} Complete</Text>
            <Text style={styles.recapSubtitle}>Advancing to {nextRoundName}</Text>

            {/* Fixed height message area to prevent layout shift */}
            <View style={styles.recapMessageArea}>
              {vetoMessage ? (
                <View style={styles.vetoMessageContainer}>
                  <Text style={styles.vetoMessageText}>{vetoMessage}</Text>
                </View>
              ) : vetoMode ? (
                <View style={styles.vetoModeIndicator}>
                  <Text style={styles.vetoModeText}>Tap a movie to veto it</Text>
                </View>
              ) : null}
            </View>

            {/* Different layouts based on number of advancing movies */}
            {advancingMovies.length === 2 ? (
              // Semi-finals: side-by-side like comparison
              <View style={styles.semiFinalGrid}>
                {advancingMovies.map((movie, idx) => (
                  <Pressable
                    key={`${movie.id}-${idx}`}
                    style={styles.semiFinalCard}
                    onPress={() => vetoMode && handleVeto(movie.id)}
                    disabled={!vetoMode}
                  >
                    <View style={[styles.semiFinalPosterWrapper, vetoMode && styles.advancingPosterWrapperVeto]}>
                      {movie.posterUrl ? (
                        <Image source={{ uri: movie.posterUrl }} style={styles.semiFinalPoster} />
                      ) : (
                        <View style={[styles.semiFinalPoster, styles.advancingPosterFallback]}>
                          <Text style={styles.tournamentFallbackText}>{movie.title.slice(0, 2)}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.semiFinalTitle} numberOfLines={2}>{movie.title}</Text>
                    <Text style={styles.semiFinalYear}>{movie.year}</Text>
                  </Pressable>
                ))}
              </View>
            ) : advancingMovies.length === 4 ? (
              // Quarter-finals: 2x2 grid
              <View style={styles.quarterFinalGrid}>
                {advancingMovies.map((movie, idx) => (
                  <Pressable
                    key={`${movie.id}-${idx}`}
                    style={styles.quarterFinalCard}
                    onPress={() => vetoMode && handleVeto(movie.id)}
                    disabled={!vetoMode}
                  >
                    <View style={[styles.quarterFinalPosterWrapper, vetoMode && styles.advancingPosterWrapperVeto]}>
                      {movie.posterUrl ? (
                        <Image source={{ uri: movie.posterUrl }} style={styles.quarterFinalPoster} />
                      ) : (
                        <View style={[styles.quarterFinalPoster, styles.advancingPosterFallback]}>
                          <Text style={styles.advancingFallbackTextSmall}>{movie.title.slice(0, 2)}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.quarterFinalTitle} numberOfLines={1}>{movie.title}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              // Round 1: compact grid (8 movies)
              <View style={styles.advancingGridCompact}>
                {advancingMovies.map((movie, idx) => (
                  <Pressable
                    key={`${movie.id}-${idx}`}
                    style={styles.advancingCardCompact}
                    onPress={() => vetoMode && handleVeto(movie.id)}
                    disabled={!vetoMode}
                  >
                    <View style={[styles.advancingPosterWrapper, vetoMode && styles.advancingPosterWrapperVeto]}>
                      {movie.posterUrl ? (
                        <Image source={{ uri: movie.posterUrl }} style={styles.advancingPosterCompact} />
                      ) : (
                        <View style={[styles.advancingPosterCompact, styles.advancingPosterFallback]}>
                          <Text style={styles.advancingFallbackTextSmall}>{movie.title.slice(0, 2)}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.advancingTitleCompact} numberOfLines={1}>{movie.title}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.recapActions}>
              {vetoesRemaining > 0 && (
                <Pressable
                  style={[styles.vetoModeButton, vetoMode && styles.vetoModeButtonActive]}
                  onPress={toggleVetoMode}
                >
                  <Text style={[styles.vetoModeButtonText, vetoMode && styles.vetoModeButtonTextActive]}>
                    {vetoMode ? 'Cancel' : `Use Veto (${vetoesRemaining})`}
                  </Text>
                </Pressable>
              )}

              {isHost && (
                <Pressable style={styles.continueButton} onPress={handleContinueRound}>
                  <Text style={styles.continueButtonText}>Continue</Text>
                </Pressable>
              )}

              {!isHost && (
                <View style={styles.waitingHost}>
                  <Text style={styles.waitingHostText}>Waiting for host...</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Group Result
  if (step === 'group-result') {
    const champion = room?.champion;
    if (!champion) return null;

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <Animated.View style={styles.resultContainer} entering={FadeInUp.duration(400)}>
            <Text style={styles.resultLabel}>The Group Pick</Text>

            {champion.posterUrl ? (
              <Image source={{ uri: champion.posterUrl }} style={styles.resultPoster} />
            ) : (
              <View style={[styles.resultPoster, styles.resultPosterFallback]}>
                <Text style={styles.resultPosterFallbackText}>{champion.title.slice(0, 2)}</Text>
              </View>
            )}

            <Text style={styles.resultTitle}>{champion.title}</Text>
            <Text style={styles.resultYear}>
              {champion.year}
              {resultDetails?.runtime && ` · ${resultDetails.runtime}`}
            </Text>

            {resultDetails?.streamingProviders && resultDetails.streamingProviders.length > 0 && (
              <View style={styles.streamingSection}>
                <Text style={styles.streamingLabel}>Streaming on</Text>
                <View style={styles.providerLogos}>
                  {resultDetails.streamingProviders.map((p, i) => (
                    <Image key={i} source={{ uri: p.logoUrl }} style={styles.providerLogo} />
                  ))}
                </View>
              </View>
            )}

            <View style={styles.resultActions}>
              {resultDetails?.trailerUrl && (
                <Pressable
                  style={styles.trailerButton}
                  onPress={() => Linking.openURL(resultDetails.trailerUrl!)}
                >
                  <Text style={styles.trailerButtonText}>Watch Trailer</Text>
                </Pressable>
              )}
              <Pressable style={styles.shareResultButton} onPress={() => handleShare(true)}>
                <Text style={styles.shareResultButtonText}>Share</Text>
              </Pressable>
            </View>

            <Pressable style={styles.decideAgainButton} onPress={handleDecideAgain}>
              <Text style={styles.decideAgainText}>Decide Again</Text>
            </Pressable>
          </Animated.View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Two-Person Decide — Knockout
  if (step === 'duo-knockout') {
    return (
      <BracketPlay
        movies={duoBracketMovies}
        onComplete={handleDuoKnockoutComplete}
      />
    );
  }

  // RENDER: Two-Person Decide — Waiting
  if (step === 'duo-waiting') {
    return (
      <CinematicBackground>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: spacing.md }}>YOUR PICKS ARE IN</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, textAlign: 'center' as const, marginBottom: spacing.xxl, textTransform: 'uppercase' as const }}>
            SEND THE CODE TO YOUR PARTNER
          </Text>
          <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent, borderRadius: borderRadius.xxl, padding: spacing.xl, alignItems: 'center' as const, width: '100%', maxWidth: 300 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 2, marginBottom: spacing.md }}>SESSION CODE</Text>
            <Text style={{ fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: 6 }}>{duoSession?.code || '...'}</Text>
          </View>
          <Pressable
            style={{ backgroundColor: '#FFFFFF', borderRadius: borderRadius.xxl, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxxl, marginTop: spacing.xl }}
            onPress={async () => {
              const msg = `Let's decide what to watch! Join my session on Aaybee\n\nCode: ${duoSession?.code}\n\nhttps://aaybee.netlify.app`;
              try {
                if (Platform.OS === 'web' && navigator?.share) {
                  await navigator.share({ text: msg });
                } else if (Platform.OS === 'web' && navigator?.clipboard) {
                  await navigator.clipboard.writeText(msg);
                } else {
                  await Share.share({ message: msg });
                }
              } catch {}
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#000', letterSpacing: 2 }}>SHARE CODE</Text>
          </Pressable>
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
          <Text style={{ fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, marginTop: spacing.sm, textTransform: 'uppercase' as const }}>WAITING FOR PARTNER...</Text>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Two-Person Decide — Negotiation
  if (step === 'duo-negotiate' && duoSession) {
    const pairs = duoSession.negotiation_pairs || [];
    const log = duoSession.negotiation_log || [];
    const currentPair = pairs[duoSession.current_pair_index];
    const isMyTurnToPropose = (duoIsPersonOne && duoSession.current_proposer === 1) ||
                               (!duoIsPersonOne && duoSession.current_proposer === 2);

    // Find pending proposal (last log entry with response='pending')
    const pendingEntry = log.length > 0 && log[log.length - 1].response === 'pending'
      ? log[log.length - 1]
      : undefined;

    const totalRounds = Math.ceil(Math.log2((duoSession.person1_final4?.length || 4) + (duoSession.person2_final4?.length || 4)));
    const completedPairs = log.filter(e => e.response !== 'pending').length;

    if (!currentPair) {
      return (
        <CinematicBackground>
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: spacing.md, textTransform: 'uppercase' as const, letterSpacing: 1 }}>LOADING...</Text>
          </View>
        </CinematicBackground>
      );
    }

    return (
      <DecideNegotiation
        pair={currentPair}
        isProposer={isMyTurnToPropose}
        pendingProposal={pendingEntry}
        proposerName={duoSession.current_proposer === 1 ? duoSession.person1_name : (duoSession.person2_name || 'Partner')}
        responderName={duoSession.current_proposer === 1 ? (duoSession.person2_name || 'Partner') : duoSession.person1_name}
        roundLabel={`PAIR ${completedPairs + 1}`}
        onPropose={async (movie) => {
          await decideSessionService.submitProposal(
            duoSession.id, movie, duoSession.current_pair_index,
            duoIsPersonOne ? 1 : 2,
          );
        }}
        onRespond={async (response) => {
          await decideSessionService.submitResponse(duoSession.id, response);
        }}
        loading={isLoading}
      />
    );
  }

  // RENDER: Two-Person Decide — Result
  if (step === 'duo-result' && duoSession?.winner_movie) {
    const winner = duoSession.winner_movie;
    return (
      <CinematicBackground>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }]}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 2, marginBottom: spacing.lg }}>TONIGHT'S MOVIE</Text>
          {winner.posterUrl ? (
            <Image source={{ uri: winner.posterUrl }} style={{ width: 200, height: 300, borderRadius: borderRadius.xl, borderWidth: 2, borderColor: colors.accent, marginBottom: spacing.md }} />
          ) : null}
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: 1.5, textAlign: 'center' as const }}>{winner.title.toUpperCase()}</Text>
          {winner.year && <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: spacing.xs }}>{winner.year}</Text>}

          <Text style={{ fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, marginTop: spacing.xl, textTransform: 'uppercase' as const }}>
            {duoSession.person1_name.toUpperCase()} & {(duoSession.person2_name || 'PARTNER').toUpperCase()} DECIDED
          </Text>

          <Pressable
            style={{ backgroundColor: '#FFFFFF', borderRadius: borderRadius.xxl, paddingVertical: spacing.lg, paddingHorizontal: spacing.xxxl, marginTop: spacing.xxl }}
            onPress={() => setStep('mode-select')}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#000', letterSpacing: 2 }}>DECIDE AGAIN</Text>
          </Pressable>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Preferences (5 pairs)
  if (step === 'preferences') {
    const pair = currentPreferencePair;
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.bracketContainer}>
            <Text style={styles.bracketTitle}>{pair.question}</Text>

            <View style={styles.preferenceCards}>
              <PreferenceCard
                label={pair.optionA.label}
                icon={pair.optionA.icon}
                position="A"
                onSelect={() => handlePreferenceSelect('A')}
                isSelected={selected === 'A'}
                isLoser={selected === 'B'}
              />
              <PreferenceCard
                label={pair.optionB.label}
                icon={pair.optionB.icon}
                position="B"
                onSelect={() => handlePreferenceSelect('B')}
                isSelected={selected === 'B'}
                isLoser={selected === 'A'}
              />
            </View>
          </View>
          <OnboardingProgressBar progress={progress} current={preferenceIndex} total={TOTAL_PREFERENCES} label="Setting your preferences" />
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Pool Building
  if (step === 'pool-building') {
    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>curating your picks...</Text>
          </View>
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Tournament
  if (step === 'tournament') {
    const pair = currentTournamentPair;
    if (!pair) {
      return (
        <CinematicBackground>
          <View style={styles.container}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          </View>
        </CinematicBackground>
      );
    }

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <View style={styles.tournamentContainer}>
            <Text style={styles.tournamentTitle}>Which would you rather watch tonight?</Text>

            <View style={styles.tournamentCards}>
              <TournamentCard
                movie={pair.movieA}
                label="A"
                onSelect={() => handleTournamentSelect('A')}
                onMoreInfo={() => handleMovieInfo(pair.movieA)}
                isSelected={selected === 'A'}
                isLoser={selected === 'B'}
                disabled={selected !== null}
              />
              <TournamentCard
                movie={pair.movieB}
                label="B"
                onSelect={() => handleTournamentSelect('B')}
                onMoreInfo={() => handleMovieInfo(pair.movieB)}
                isSelected={selected === 'B'}
                isLoser={selected === 'A'}
                disabled={selected !== null}
              />
            </View>
          </View>
          <OnboardingProgressBar progress={progress} current={tournamentIndex} total={TOURNAMENT_MATCHES} label="Finding tonight's pick" />
        </View>
      </CinematicBackground>
    );
  }

  // RENDER: Result
  if (step === 'result') {
    const champion = tournamentBracket.champion;
    if (!champion) return null;

    return (
      <CinematicBackground>
        <View style={styles.container}>
          <Animated.View style={styles.resultContainer} entering={FadeInUp.duration(400)}>
            <Text style={styles.resultLabel}>The Pick</Text>

            {champion.posterUrl ? (
              <Image source={{ uri: champion.posterUrl }} style={styles.resultPoster} />
            ) : (
              <View style={[styles.resultPoster, styles.resultPosterFallback]}>
                <Text style={styles.resultPosterFallbackText}>{champion.title.slice(0, 2)}</Text>
              </View>
            )}

            <Text style={styles.resultTitle}>{champion.title}</Text>
            <Text style={styles.resultYear}>
              {champion.year}
              {resultDetails?.runtime && ` · ${resultDetails.runtime}`}
            </Text>

            {/* Streaming providers */}
            {resultDetails?.streamingProviders && resultDetails.streamingProviders.length > 0 && (
              <View style={styles.streamingSection}>
                <Text style={styles.streamingLabel}>Streaming on</Text>
                <View style={styles.providerLogos}>
                  {resultDetails.streamingProviders.map((p, i) => (
                    <Image key={i} source={{ uri: p.logoUrl }} style={styles.providerLogo} />
                  ))}
                </View>
              </View>
            )}

            {/* Actions */}
            <View style={styles.resultActions}>
              {resultDetails?.trailerUrl && (
                <Pressable
                  style={styles.trailerButton}
                  onPress={() => Linking.openURL(resultDetails.trailerUrl!)}
                >
                  <Text style={styles.trailerButtonText}>Watch Trailer</Text>
                </Pressable>
              )}
              <Pressable style={styles.shareResultButton} onPress={() => handleShare(false)}>
                <Text style={styles.shareResultButtonText}>Share</Text>
              </Pressable>
            </View>

            <Pressable style={styles.decideAgainButton} onPress={handleDecideAgain}>
              <Text style={styles.decideAgainText}>Decide Again</Text>
            </Pressable>
          </Animated.View>
        </View>
      </CinematicBackground>
    );
  }

  return null;
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  guestContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    gap: spacing.md,
  },
  guestTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  guestText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lockedIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  progressContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressBar: {
    width: 200,
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressText: {
    ...typography.tiny,
    color: colors.textMuted,
  },

  // Mode Select
  modeSelectContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  screenTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  screenSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  modeCardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  modeCardWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  modeCardTopLabel: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modeCardBottomLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  modeCard: {
    width: '100%',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeCardDisabled: {
    opacity: 0.5,
  },
  modeCardPoster: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  modeCardPosterGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  modeCardBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeCardBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.background,
  },

  // Bracket
  bracketContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  bracketTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  preferenceCards: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  preferenceCard: {
    position: 'relative',
    width: 140,
    height: 180,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  preferenceCardSelectedA: {
    borderColor: colors.accent,
  },
  preferenceCardSelectedB: {
    borderColor: colors.tournamentB,
  },
  preferenceCardLoser: {
    opacity: 0.3,
    transform: [{ scale: 0.95 }],
  },
  preferenceCardLabelBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  preferenceCardLabelBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
  preferenceCardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  preferenceCardLabel: {
    ...typography.h3,
    textAlign: 'center',
  },
  vsText: {
    ...typography.bodyMedium,
    color: colors.textMuted,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Tournament
  tournamentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  tournamentTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  tournamentCards: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tournamentCard: {
    width: 150,
    alignItems: 'center',
  },
  tournamentCardDimmed: {
    opacity: 0.3,
  },
  tournamentTextDimmed: {
    opacity: 0.3,
  },
  tournamentPoster: {
    width: 140,
    height: 210,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  tournamentPosterFallback: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tournamentFallbackText: {
    ...typography.h2,
    color: colors.textMuted,
  },
  posterLabel: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterLabelText: {
    ...typography.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tournamentMovieTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    height: 36, // Fixed height for 2 lines
    lineHeight: 18,
  },
  tournamentYear: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },
  tournamentMoreInfo: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tournamentMoreInfoText: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Winner display (single poster) - centered on screen
  winnerDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  winnerPoster: {
    width: 160,
    height: 240,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  winnerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  winnerYear: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  winnerAdvances: {
    ...typography.captionMedium,
    color: colors.accent,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },

  // Result - centered layout
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  resultLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: spacing.lg,
  },
  resultPoster: {
    width: 180,
    height: 270,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  resultPosterFallback: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultPosterFallbackText: {
    ...typography.h1,
    color: colors.textMuted,
  },
  resultTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  resultYear: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  streamingSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  streamingLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  providerLogos: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  trailerButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  trailerButtonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
  shareResultButton: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  shareResultButtonText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  decideAgainButton: {
    paddingVertical: spacing.md,
  },
  decideAgainText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },

  // ============================================
  // GROUP MODE STYLES
  // ============================================
  groupContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  backButton: {
    marginBottom: spacing.lg,
  },
  backButtonText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  groupOptions: {
    gap: spacing.xl,
    marginTop: spacing.xl,
  },
  groupOptionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 100,
    justifyContent: 'center',
  },
  groupOptionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  groupOptionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  orText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  joinSection: {
    gap: spacing.md,
  },
  joinLabel: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  codeInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 8,
  },
  joinButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.lg,
  },

  // Waiting Room
  roomCodeSection: {
    alignItems: 'center',
    marginVertical: spacing.xxl,
  },
  roomCodeLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  roomCode: {
    ...typography.h1,
    color: colors.accent,
    letterSpacing: 12,
    fontSize: 48,
  },
  shareCodeButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  shareCodeButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  membersSection: {
    flex: 1,
    marginBottom: spacing.xl,
  },
  membersLabel: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  membersList: {
    flex: 1,
  },
  memberRow: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  memberName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  startButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  waitingHost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  waitingHostText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Tournament Group
  roundLabel: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  countdownContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  countdownText: {
    ...typography.h2,
    color: colors.accent,
    fontSize: 24,
  },
  matchWinnerLabel: {
    ...typography.h3,
    color: colors.accent,
    marginBottom: spacing.lg,
  },
  matchResultText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  voteStatus: {
    alignItems: 'center',
    marginTop: spacing.lg,
    height: 50, // Fixed height to prevent layout shift
    justifyContent: 'center',
  },
  voteStatusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  votedText: {
    ...typography.captionMedium,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  advanceButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.md,
  },
  advanceButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },

  // Recap - Compact layout to fit on screen
  recapContainerCompact: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    justifyContent: 'space-between',
  },
  recapTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  recapSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  // Fixed height container for messages to prevent layout shift
  recapMessageArea: {
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  vetoMessageContainer: {
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  vetoMessageText: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
  },
  vetoModeIndicator: {
    backgroundColor: colors.error + '20',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
  },
  vetoModeText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'center',
  },
  // Round 1: 8 movies - compact grid
  advancingGridCompact: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    alignContent: 'center',
  },
  advancingCardCompact: {
    width: 75,
    alignItems: 'center',
  },
  advancingPosterWrapper: {
    width: 70,
    height: 105,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  advancingPosterWrapperVeto: {
    borderWidth: 2,
    borderColor: colors.error,
  },
  advancingPosterCompact: {
    width: '100%',
    height: '100%',
  },
  advancingPosterFallback: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  advancingFallbackTextSmall: {
    ...typography.caption,
    color: colors.textMuted,
  },
  advancingTitleCompact: {
    ...typography.tiny,
    fontSize: 9,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 2,
  },

  // Quarter-finals: 4 movies - 2x2 grid
  quarterFinalGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
    alignContent: 'center',
    maxWidth: 280,
    alignSelf: 'center',
  },
  quarterFinalCard: {
    width: 120,
    alignItems: 'center',
  },
  quarterFinalPosterWrapper: {
    width: 110,
    height: 165,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  quarterFinalPoster: {
    width: '100%',
    height: '100%',
  },
  quarterFinalTitle: {
    ...typography.tiny,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Semi-finals: 2 movies - side by side like comparison
  semiFinalGrid: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  semiFinalCard: {
    width: 150,
    alignItems: 'center',
  },
  semiFinalPosterWrapper: {
    width: 140,
    height: 210,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  semiFinalPoster: {
    width: '100%',
    height: '100%',
  },
  semiFinalTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  semiFinalYear: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
  },
  recapActions: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  vetoModeButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  vetoModeButtonActive: {
    backgroundColor: colors.error,
  },
  vetoModeButtonText: {
    ...typography.bodyMedium,
    color: colors.error,
  },
  vetoModeButtonTextActive: {
    color: colors.background,
  },
  continueButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  continueButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },

  // Couples mode styles
  couplesSubtitle: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  couplesHint: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    lineHeight: 18,
  },
  couplesPickerSwitch: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // Tie indicator
  tieText: {
    color: colors.accent,
    fontWeight: '600',
  },

  // Guest join button
  guestJoinButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guestJoinButtonText: {
    ...typography.bodyMedium,
    color: colors.accent,
  },

  // Curated pack selection
  packScrollContent: {
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
  },
  packSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  packPrompt: {
    ...typography.captionMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    marginBottom: spacing.sm,
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
});

export default DecideScreen;
