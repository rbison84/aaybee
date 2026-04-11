// ============================================
// Movie Knockout Bracket — Play Component
// 16-movie single-elimination bracket (SameGoat-style)
// ============================================

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../hooks/useHaptics';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import {
  BracketMovie,
  BracketPick,
  getCurrentMatchup,
  getRoundName,
  computeBracketState,
} from '../utils/movieBracket';

interface BracketPlayProps {
  movies: BracketMovie[];
  initialPicks?: BracketPick[];
  onPick?: (picks: BracketPick[]) => void;
  onComplete: (picks: BracketPick[], winnerMovie: BracketMovie) => void;
  onBack?: () => void;
}

export function BracketPlay({
  movies,
  initialPicks,
  onPick,
  onComplete,
  onBack,
}: BracketPlayProps) {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [picks, setPicks] = useState<BracketPick[]>(initialPicks || []);
  const [animating, setAnimating] = useState(false);
  const [showContent, setShowContent] = useState(true);

  const matchup = getCurrentMatchup(movies, picks);
  const state = computeBracketState(movies.length, picks);

  const goBack = useCallback(() => {
    if (animating) return;
    if (picks.length === 0) {
      onBack?.();
    } else {
      const newPicks = picks.slice(0, -1);
      setPicks(newPicks);
      onPick?.(newPicks);
    }
  }, [picks, animating, onBack, onPick]);

  const choose = useCallback(
    (winnerIdx: number) => {
      if (animating || !matchup) return;
      setAnimating(true);
      haptics.light();

      const newPick: BracketPick = {
        round: matchup.round,
        match: matchup.match,
        winnerIdx,
      };
      const newPicks = [...picks, newPick];

      // Check if complete (15 picks for 16 movies)
      if (newPicks.length >= 15) {
        setPicks(newPicks);
        setTimeout(() => {
          const winnerMovie = movies[winnerIdx];
          haptics.success();
          onComplete(newPicks, winnerMovie);
        }, 400);
        return;
      }

      // Fade transition
      setShowContent(false);
      setTimeout(() => {
        setPicks(newPicks);
        onPick?.(newPicks);
        setShowContent(true);
        setAnimating(false);
      }, 200);
    },
    [animating, matchup, picks, movies, onComplete, onPick, haptics]
  );

  if (!matchup) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.navRow}>
          <View />
          <Text style={styles.roundLabel}>COMPLETE</Text>
          <Text style={styles.progressText}>15/15</Text>
        </View>
      </View>
    );
  }

  const roundName = getRoundName(matchup.round);
  const idxA = movies.indexOf(matchup.movieA);
  const idxB = movies.indexOf(matchup.movieB);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Nav row */}
      <View style={styles.navRow}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>{'<'} BACK</Text>
        </Pressable>
        <Text style={styles.roundLabel}>{roundName.toUpperCase()}</Text>
        <Text style={styles.progressText}>{picks.length + 1}/15</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBarFill, { width: `${(picks.length / 15) * 100}%` as any }]} />
      </View>

      {/* Cards — side by side like Compare */}
      {showContent ? (
        <Animated.View style={styles.cardsContainer} entering={FadeIn.duration(150)}>
          {/* Movie A */}
          <Pressable
            style={styles.movieCard}
            onPress={() => choose(idxA)}
          >
            <View style={styles.posterContainer}>
              {matchup.movieA.posterUrl ? (
                <Image
                  source={{ uri: matchup.movieA.posterUrl }}
                  style={styles.poster}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.posterPlaceholderText}>{matchup.movieA.title.charAt(0)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {matchup.movieA.title.toUpperCase()}
            </Text>
            {matchup.movieA.year && (
              <Text style={styles.movieYear}>{matchup.movieA.year}</Text>
            )}
          </Pressable>

          {/* Movie B */}
          <Pressable
            style={styles.movieCard}
            onPress={() => choose(idxB)}
          >
            <View style={styles.posterContainer}>
              {matchup.movieB.posterUrl ? (
                <Image
                  source={{ uri: matchup.movieB.posterUrl }}
                  style={styles.poster}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <Text style={styles.posterPlaceholderText}>{matchup.movieB.title.charAt(0)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.movieTitle} numberOfLines={2}>
              {matchup.movieB.title.toUpperCase()}
            </Text>
            {matchup.movieB.year && (
              <Text style={styles.movieYear}>{matchup.movieB.year}</Text>
            )}
          </Pressable>
        </Animated.View>
      ) : (
        <View style={styles.cardsContainer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    paddingVertical: spacing.xs,
    minWidth: 60,
  },
  backText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  roundLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  progressText: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    minWidth: 60,
    textAlign: 'right',
  },
  progressBarContainer: {
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: 1,
  },
  progressBarFill: {
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  cardsContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  movieCard: {
    flex: 1,
    alignItems: 'center',
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterPlaceholderText: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
    lineHeight: 16,
  },
  movieYear: {
    fontSize: 10,
    fontWeight: '400',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
