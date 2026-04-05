import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAppStore } from '../store/useAppStore';
import { useHaptics } from '../hooks/useHaptics';
import { CinematicCard } from '../components/cinematic';
import { Movie } from '../types';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

// 5 universally recognizable seed pairs
const SEED_PAIRS: [string, string][] = [
  ['tmdb-11', 'tmdb-597'],     // Star Wars vs Titanic
  ['tmdb-862', 'tmdb-155'],    // Toy Story vs The Dark Knight
  ['tmdb-278', 'tmdb-680'],    // Shawshank vs Pulp Fiction
  ['tmdb-129', 'tmdb-603'],    // Spirited Away vs The Matrix
  ['tmdb-496243', 'tmdb-329'], // Parasite vs Jurassic Park
];

const DECADES = [
  { label: '2010s', value: 2010 },
  { label: '2000s', value: 2000 },
  { label: '1990s', value: 1990 },
  { label: '1980s', value: 1980 },
  { label: '1970s', value: 1970 },
  { label: '1960s', value: 1960 },
];

interface MiniOnboardingScreenProps {
  onComplete: () => void;
}

export function MiniOnboardingScreen({ onComplete }: MiniOnboardingScreenProps) {
  const { movies, setBirthDecade, recordComparison, completeOnboarding } = useAppStore();
  const haptics = useHaptics();
  const [step, setStep] = useState<'pairs' | 'decade'>('pairs');
  const [pairIndex, setPairIndex] = useState(0);

  const handleDecadeSelect = useCallback((decade: number) => {
    setBirthDecade(decade);
    haptics.light();
    // Done — complete onboarding
    completeOnboarding();
    onComplete();
  }, [setBirthDecade, haptics, completeOnboarding, onComplete]);

  const handlePick = useCallback((winnerId: string, loserId: string) => {
    recordComparison(winnerId, loserId);
    haptics.light();

    if (pairIndex + 1 >= SEED_PAIRS.length) {
      // Movies done — ask for decade
      setStep('decade');
    } else {
      setPairIndex(prev => prev + 1);
    }
  }, [pairIndex, recordComparison, haptics]);

  if (step === 'decade') {
    return (
      <View style={styles.container}>
        <Animated.View entering={FadeIn} style={styles.content}>
          <Text style={styles.title}>when were you born?</Text>
          <Text style={styles.subtitle}>this helps us pick the right movies for you</Text>

          <View style={styles.decadeGrid}>
            {DECADES.map(d => (
              <Pressable
                key={d.value}
                style={styles.decadeButton}
                onPress={() => handleDecadeSelect(d.value)}
              >
                <Text style={styles.decadeText}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    );
  }

  // Pairs step
  const [idA, idB] = SEED_PAIRS[pairIndex];
  const movieA = movies.get(idA);
  const movieB = movies.get(idB);

  // If movies aren't loaded yet, show simple text fallback
  if (!movieA || !movieB) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.subtitle}>loading movies...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn} style={styles.content}>
        <Text style={styles.pairCount}>{pairIndex + 1} / {SEED_PAIRS.length}</Text>
        <Text style={styles.prompt}>which do you prefer?</Text>

        <View style={styles.cardsRow}>
          <Pressable style={styles.cardWrapper} onPress={() => handlePick(idA, idB)}>
            <CinematicCard movie={movieA} onSelect={() => handlePick(idA, idB)} isWinner={false} isLoser={false} />
          </Pressable>
          <Pressable style={styles.cardWrapper} onPress={() => handlePick(idB, idA)}>
            <CinematicCard movie={movieB} onSelect={() => handlePick(idB, idA)} isWinner={false} isLoser={false} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  decadeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    maxWidth: 300,
  },
  decadeButton: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  decadeText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  pairCount: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  prompt: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    width: '100%',
    maxWidth: 400,
  },
  cardWrapper: {
    flex: 1,
  },
});
