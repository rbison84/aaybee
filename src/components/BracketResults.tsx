// ============================================
// Movie Knockout Bracket — Results Component
// SameGoat-style: winner, "send to friend", QR, share, bracket
// ============================================

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
  ScrollView,
  Platform,
  Share,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../hooks/useHaptics';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, borderRadius } from '../theme/cinematic';
import { QRCode } from './QRCode';
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
  isGuest?: boolean;
  onSignUp?: () => void;
  onPlayAgain?: () => void;
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
  isGuest,
  onSignUp,
  onPlayAgain,
  onHome,
}: BracketResultsProps) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const path = buildBracketPath(movies, picks);
  const hasMatch = matchPercent !== undefined && matchPercent !== null;

  // Build share URL with ref param for attribution
  const baseShareUrl = shareUrlProp || 'https://aaybee.netlify.app';
  const shareUrl = user?.id ? (baseShareUrl.includes('?') ? `${baseShareUrl}&ref=${user.id}` : `${baseShareUrl}?ref=${user.id}`) : baseShareUrl;
  const displayName = playerName || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Someone';

  const shareMessage = `${displayName}'s last movie standing is "${winnerMovie.title}" — can you beat it?\n\n${shareUrl}`;

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
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Winner announcement */}
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

        {/* "SEND THIS TO A FRIEND" + QR + Share */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.shareSection}>
          <Text style={styles.sendTitle}>SEND THIS TO A FRIEND</Text>

          {/* QR Card */}
          <View style={styles.qrCard}>
            <Text style={styles.qrLabel}>SCAN OR SHARE</Text>
            <QRCode
              value={shareUrl}
              size={160}
              backgroundColor="transparent"
              color="#FFFFFF"
            />
            <Text style={styles.qrUrl} numberOfLines={2}>{shareUrl}</Text>
          </View>

          {/* Share button */}
          <Pressable style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>{copied ? 'COPIED' : 'SHARE LINK'}</Text>
          </Pressable>
        </Animated.View>

        {/* Taste match (shown when challenger completes) */}
        {hasMatch && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.comparisonSection}>
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

        {/* Bracket visualization */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.bracketSection}>
          <Text style={styles.bracketLabel}>YOUR BRACKET</Text>
          <View style={styles.bracketGrid}>
            {path.map((round, roundIdx) => (
              <View key={roundIdx} style={styles.bracketRound}>
                {round.map((movieIdx) => {
                  const movie = movies[movieIdx];
                  const isWinner = movieIdx === (picks.find(p => p.round === 3)?.winnerIdx);
                  return (
                    <View
                      key={`${roundIdx}-${movieIdx}`}
                      style={[
                        styles.bracketItem,
                        isWinner && styles.bracketItemWinner,
                      ]}
                    >
                      <Text style={[styles.bracketItemText, isWinner && styles.bracketItemTextWinner]} numberOfLines={1}>
                        {movie?.title || '?'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Secondary CTAs */}
        <View style={styles.ctas}>
          {isGuest && onSignUp && (
            <Pressable style={styles.ctaSecondary} onPress={onSignUp}>
              <Text style={styles.ctaSecondaryText}>SIGN UP TO SAVE</Text>
            </Pressable>
          )}

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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },

  // Winner
  winnerSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  winnerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.lg,
  },
  winnerPoster: {
    width: 180,
    height: 270,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.accent,
    marginBottom: spacing.md,
  },
  posterPlaceholder: {
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterPlaceholderText: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.textMuted,
  },
  winnerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  winnerYear: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },

  // Share section
  shareSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  sendTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  qrCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.lg,
  },
  qrLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.lg,
  },
  qrUrl: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  shareButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    width: '100%',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 2,
  },

  // Taste match
  comparisonSection: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
  },
  comparisonLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  comparisonPercent: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  comparisonNames: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  sameWinnerText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },

  // Bracket
  bracketSection: {
    marginBottom: spacing.xxl,
  },
  bracketLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  bracketGrid: {
    flexDirection: 'row',
    gap: 2,
  },
  bracketRound: {
    flex: 1,
    gap: 2,
  },
  bracketItem: {
    backgroundColor: colors.card,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bracketItemWinner: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  bracketItemText: {
    fontSize: 7,
    fontWeight: '500',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bracketItemTextWinner: {
    color: colors.accent,
    fontWeight: '700',
  },

  // CTAs
  ctas: {
    gap: spacing.md,
  },
  ctaSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  ctaGhost: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaGhostText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 1,
  },
});
