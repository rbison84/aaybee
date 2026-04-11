// ============================================
// Movie Knockout Bracket — Results Component
// Shows winner, bracket path, share CTA
// ============================================

import React from 'react';
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
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import {
  BracketMovie,
  BracketPick,
  buildBracketPath,
  compareBrackets,
} from '../utils/movieBracket';

interface BracketResultsProps {
  movies: BracketMovie[];
  picks: BracketPick[];
  winnerMovie: BracketMovie;
  shareUrl?: string;
  friendPicks?: BracketPick[];
  friendName?: string;
  isGuest?: boolean;
  onSignUp?: () => void;
  onShare?: () => void;
  onPlayAgain?: () => void;
  onHome: () => void;
}

export function BracketResults({
  movies,
  picks,
  winnerMovie,
  shareUrl,
  friendPicks,
  friendName,
  isGuest,
  onSignUp,
  onShare,
  onPlayAgain,
  onHome,
}: BracketResultsProps) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const path = buildBracketPath(movies, picks);
  const comparison = friendPicks ? compareBrackets(picks, friendPicks) : null;

  const handleShare = async () => {
    const message = `My last movie standing is "${winnerMovie.title}" on aaybee.\n\nplay knockout: ${shareUrl || 'https://aaybee.app'}`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text: message });
      } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
      } else {
        await Share.share({ message });
      }
      haptics.success();
    } catch {}
    onShare?.();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
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

        {/* Friend comparison */}
        {comparison && friendName && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.comparisonSection}>
            <Text style={styles.comparisonText}>
              YOU & {friendName.toUpperCase()}: AGREED ON {comparison.agreements}/{comparison.total} MATCHUPS
            </Text>
            <Text style={styles.comparisonPercent}>{comparison.percent}%</Text>
          </Animated.View>
        )}

        {/* Bracket visualization — compact */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.bracketSection}>
          <Text style={styles.bracketLabel}>YOUR BRACKET</Text>
          <View style={styles.bracketGrid}>
            {path.map((round, roundIdx) => (
              <View key={roundIdx} style={styles.bracketRound}>
                {round.map((movieIdx) => {
                  const movie = movies[movieIdx];
                  const isWinner = movieIdx === (picks.find(p => p.round === 3)?.winnerIdx);
                  return (
                    <View
                      key={movieIdx}
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

        {/* CTAs */}
        <View style={styles.ctas}>
          {isGuest && onSignUp && (
            <Pressable style={styles.ctaPrimary} onPress={onSignUp}>
              <Text style={styles.ctaPrimaryText}>SIGN UP TO SAVE</Text>
            </Pressable>
          )}

          <Pressable style={styles.ctaPrimary} onPress={handleShare}>
            <Text style={styles.ctaPrimaryText}>SHARE YOUR PICK</Text>
          </Pressable>

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
    width: 200,
    height: 300,
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
    fontSize: 64,
    fontWeight: '800',
    color: colors.textMuted,
  },
  winnerTitle: {
    fontSize: 20,
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
  comparisonSection: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
  },
  comparisonText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  comparisonPercent: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 2,
  },
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
  ctas: {
    gap: spacing.md,
  },
  ctaPrimary: {
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 1.5,
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
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 1.5,
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
