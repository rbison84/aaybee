// ============================================
// Movie Knockout Bracket — Results Component
// Winner → taste match → friend picker → external share → bracket
// ============================================

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
  ScrollView,
  Platform,
  Share,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../hooks/useHaptics';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, borderRadius } from '../theme/cinematic';
import { QRCode } from './QRCode';
import { friendService, FriendWithProfile } from '../services/friendService';
import { knockoutService } from '../services/knockoutService';
import {
  BracketMovie,
  BracketPick,
  buildBracketPath,
} from '../utils/movieBracket';

interface BracketResultsProps {
  movies: BracketMovie[];
  picks: BracketPick[];
  winnerMovie: BracketMovie;
  playerName?: string;
  shareUrl?: string;
  matchPercent?: number;
  sameWinner?: boolean;
  creatorName?: string;
  challengerName?: string;
  challengeId?: string;
  challengeCode?: string;
  isGuest?: boolean;
  onSignUp?: () => void;
  onPlayAgain?: () => void;
  onChallengeFriend?: (friendId: string, friendName: string) => void;
  onHome: () => void;
}

export function BracketResults({
  movies,
  picks,
  winnerMovie,
  playerName,
  shareUrl: shareUrlProp,
  matchPercent,
  sameWinner,
  creatorName,
  challengerName,
  challengeId,
  challengeCode,
  isGuest,
  onSignUp,
  onPlayAgain,
  onChallengeFriend,
  onHome,
}: BracketResultsProps) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [challengedFriends, setChallengedFriends] = useState<Set<string>>(new Set());

  const path = buildBracketPath(movies, picks);
  const hasMatch = matchPercent !== undefined && matchPercent !== null;

  // Build share URL with ref param
  const baseShareUrl = shareUrlProp || 'https://aaybee.netlify.app';
  const shareUrl = user?.id ? (baseShareUrl.includes('?') ? `${baseShareUrl}&ref=${user.id}` : `${baseShareUrl}?ref=${user.id}`) : baseShareUrl;
  const displayName = playerName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Someone';

  const shareMessage = `I just ranked 16 movies on Aaybee. Think we have the same taste? Play the same bracket and find out:\n\n${shareUrl}`;

  // Load friends for the picker
  useEffect(() => {
    if (!user?.id || isGuest) return;
    setLoadingFriends(true);
    friendService.getFriends(user.id).then((data) => {
      setFriends(data);
      setLoadingFriends(false);
    });
  }, [user?.id, isGuest]);

  const handleShare = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text: shareMessage });
      } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareMessage);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message: shareMessage });
      }
      haptics.success();
    } catch {}
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* 1. Winner announcement */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.winnerSection}>
          <Text style={styles.winnerLabel}>LAST MOVIE STANDING</Text>

          {winnerMovie.posterUrl ? (
            <Image
              source={{ uri: winnerMovie.posterUrl }}
              style={styles.winnerPoster}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.winnerPoster, styles.posterPlaceholder]}>
              <Text style={styles.posterPlaceholderText}>{winnerMovie.title.charAt(0)}</Text>
            </View>
          )}

          <Text style={styles.winnerTitle}>{winnerMovie.title.toUpperCase()}</Text>
          {winnerMovie.year && (
            <Text style={styles.winnerYear}>{winnerMovie.year}</Text>
          )}
        </Animated.View>

        {/* 2. Taste match (shown when challenger completes) */}
        {hasMatch && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.comparisonSection}>
            <Text style={styles.comparisonLabel}>TASTE MATCH</Text>
            <Text style={styles.comparisonPercent}>{matchPercent}%</Text>
            {creatorName && challengerName && (
              <Text style={styles.comparisonNames}>
                {creatorName.toUpperCase()} & {challengerName.toUpperCase()}
              </Text>
            )}
            {sameWinner && (
              <Text style={styles.sameWinnerText}>SAME LAST MOVIE STANDING</Text>
            )}
          </Animated.View>
        )}

        {/* 3. SEE HOW YOUR TASTE COMPARES — unified section */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.friendPickerSection}>
          <Text style={styles.friendPickerTitle}>SEE HOW YOUR TASTE COMPARES</Text>

          {/* Existing friends */}
          {!isGuest && friends.length > 0 && onChallengeFriend && (
            <>
              <Text style={styles.sectionSubLabel}>EXISTING FRIENDS</Text>
              <TextInput
                style={styles.friendSearchInput}
                placeholder="SEARCH FRIENDS..."
                placeholderTextColor={colors.textMuted}
                value={friendSearch}
                onChangeText={setFriendSearch}
                autoCapitalize="none"
              />
              {friends
                .filter(f => !friendSearch || f.friend.display_name.toLowerCase().includes(friendSearch.toLowerCase()))
                .slice(0, 5)
                .map((friend) => (
                <Pressable
                  key={friend.friend_id}
                  style={styles.friendRow}
                  onPress={async () => {
                    haptics.light();
                    if (challengeId && challengeCode) {
                      await knockoutService.directChallengeToFriend(
                        challengeId, challengeCode, friend.friend_id, displayName,
                      );
                      setChallengedFriends(prev => new Set(prev).add(friend.friend_id));
                    } else {
                      onChallengeFriend?.(friend.friend_id, friend.friend.display_name);
                    }
                  }}
                  disabled={challengedFriends.has(friend.friend_id)}
                >
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{friend.friend.display_name.toUpperCase()}</Text>
                    {friend.taste_match ? (
                      <Text style={styles.friendMatch}>{friend.taste_match}% MATCH</Text>
                    ) : null}
                  </View>
                  <Text style={styles.friendChallengeText}>
                    {challengedFriends.has(friend.friend_id) ? 'SENT' : 'CHALLENGE'}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
          {!isGuest && loadingFriends && (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />
          )}

          {/* New friends — external share */}
          <Text style={[styles.sectionSubLabel, { marginTop: spacing.lg }]}>NEW FRIENDS</Text>

          <View style={styles.qrCard}>
            <Text style={styles.qrLabel}>SCAN OR SHARE</Text>
            <QRCode
              value={shareUrl}
              size={140}
              backgroundColor="transparent"
              color="#FFFFFF"
            />
            <Text style={styles.qrUrl} numberOfLines={2}>{shareUrl}</Text>
          </View>

          <Pressable style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>{copied ? 'COPIED' : 'SHARE LINK'}</Text>
          </Pressable>
        </Animated.View>

        {/* 5. Bracket visualization */}
        <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.bracketSection}>
          <Text style={styles.bracketLabel}>YOUR BRACKET</Text>
          <View style={styles.bracketGrid}>
            {path.map((round, roundIdx) => (
              <View key={roundIdx} style={styles.bracketRound}>
                {round.map((movieIdx) => {
                  const movie = movies[movieIdx];
                  const isWinnerItem = movieIdx === (picks.find(p => p.round === 3)?.winnerIdx);
                  return (
                    <View
                      key={`${roundIdx}-${movieIdx}`}
                      style={[styles.bracketItem, isWinnerItem && styles.bracketItemWinner]}
                    >
                      <Text style={[styles.bracketItemText, isWinnerItem && styles.bracketItemTextWinner]} numberOfLines={1}>
                        {movie?.title || '?'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Guest sign-up prompt */}
        {isGuest && onSignUp && (
          <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.signUpPrompt}>
            <Text style={styles.signUpPromptTitle}>SAVE YOUR BRACKET</Text>
            <Text style={styles.signUpPromptSub}>SIGN UP TO TRACK YOUR TASTE, CHALLENGE FRIENDS, AND JOIN CIRCLES</Text>
            <Pressable style={styles.signUpButton} onPress={onSignUp}>
              <Text style={styles.signUpButtonText}>SIGN UP</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Action CTAs */}
        <View style={styles.ctas}>
          {onPlayAgain && (
            <Pressable style={styles.ctaSecondary} onPress={onPlayAgain}>
              <Text style={styles.ctaSecondaryText}>PLAY AGAIN</Text>
            </Pressable>
          )}
          <Pressable style={styles.ctaGhost} onPress={onHome}>
            <Text style={styles.ctaGhostText}>MAIN MENU</Text>
          </Pressable>
        </View>

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg },

  // Winner
  winnerSection: { alignItems: 'center', marginBottom: spacing.xxl },
  winnerLabel: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 2, marginBottom: spacing.lg },
  winnerPoster: { width: 180, height: 270, borderRadius: borderRadius.xl, borderWidth: 2, borderColor: colors.accent, marginBottom: spacing.md },
  posterPlaceholder: { backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' },
  posterPlaceholderText: { fontSize: 56, fontWeight: '800', color: colors.textMuted },
  winnerTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, letterSpacing: 1.5, textAlign: 'center' },
  winnerYear: { fontSize: 12, fontWeight: '400', color: colors.textMuted, letterSpacing: 0.5, marginTop: spacing.xs },

  // Taste match
  comparisonSection: { alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xxl, padding: spacing.xl, marginBottom: spacing.xxl },
  comparisonLabel: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 2, marginBottom: spacing.sm },
  comparisonPercent: { fontSize: 56, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2 },
  comparisonNames: { fontSize: 10, fontWeight: '500', color: colors.textMuted, letterSpacing: 1, marginTop: spacing.sm },
  sameWinnerText: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 1, marginTop: spacing.sm },

  // Friend picker
  friendPickerSection: { marginBottom: spacing.xxl },
  friendPickerTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2, marginBottom: spacing.lg },
  sectionSubLabel: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 2, marginBottom: spacing.sm },
  friendRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xl,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.xs,
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.5 },
  friendMatch: { fontSize: 9, fontWeight: '400', color: colors.textMuted, letterSpacing: 0.5, marginTop: 2 },
  friendChallengeText: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 1 },
  friendSearchInput: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xl, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, fontSize: 11, color: colors.textPrimary, letterSpacing: 0.5, marginBottom: spacing.sm },

  // External share
  shareSection: { alignItems: 'center', marginBottom: spacing.xxl },
  sendTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2, textAlign: 'center', marginBottom: spacing.lg },
  qrCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xxl, padding: spacing.xl, alignItems: 'center', width: '100%', marginBottom: spacing.lg },
  qrLabel: { fontSize: 10, fontWeight: '700', color: colors.accent, letterSpacing: 2, marginBottom: spacing.lg },
  qrUrl: { fontSize: 10, fontWeight: '400', color: colors.textMuted, letterSpacing: 0.5, marginTop: spacing.lg, textAlign: 'center' },
  shareButton: { backgroundColor: colors.textPrimary, borderRadius: borderRadius.xxl, paddingVertical: spacing.lg, alignItems: 'center', width: '100%' },
  shareButtonText: { fontSize: 14, fontWeight: '800', color: colors.background, letterSpacing: 2 },

  // Bracket
  bracketSection: { marginBottom: spacing.xxl },
  bracketLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 2, marginBottom: spacing.md },
  bracketGrid: { flexDirection: 'row', gap: 2 },
  bracketRound: { flex: 1, gap: 2 },
  bracketItem: { backgroundColor: colors.card, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border },
  bracketItemWinner: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  bracketItemText: { fontSize: 7, fontWeight: '500', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  bracketItemTextWinner: { color: colors.accent, fontWeight: '700' },

  // Sign-up prompt
  signUpPrompt: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent, borderRadius: borderRadius.xxl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.xxl },
  signUpPromptTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, letterSpacing: 2, marginBottom: spacing.sm },
  signUpPromptSub: { fontSize: 10, fontWeight: '400', color: colors.textMuted, letterSpacing: 0.5, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 16 },
  signUpButton: { backgroundColor: colors.accent, borderRadius: borderRadius.xxl, paddingVertical: spacing.md, paddingHorizontal: spacing.xxxl, marginBottom: spacing.sm },
  signUpButtonText: { fontSize: 14, fontWeight: '800', color: colors.background, letterSpacing: 2 },

  // CTAs
  ctas: { gap: spacing.md },
  ctaSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.xxl, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaSecondaryText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, letterSpacing: 1 },
  ctaGhost: { paddingVertical: spacing.md, alignItems: 'center' },
  ctaGhostText: { fontSize: 12, fontWeight: '500', color: colors.textMuted, letterSpacing: 1 },
});
