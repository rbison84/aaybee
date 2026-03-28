import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Movie } from '../../types';
import { CinematicCard } from '../cinematic';
import { CatMascot, CatPose } from './CatMascot';
import { useHaptics } from '../../hooks/useHaptics';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';

interface OnboardingComparisonStepProps {
  movieA: Movie;
  movieB: Movie;
  onSelectA: () => void;
  onSelectB: () => void;
  catPose?: CatPose;
  prompt?: string;
  pairKey?: number;
}

export function OnboardingComparisonStep({
  movieA,
  movieB,
  onSelectA,
  onSelectB,
  catPose = 'sat',
  prompt,
  pairKey = 0,
}: OnboardingComparisonStepProps) {
  const [selectionState, setSelectionState] = useState<'idle' | 'selected'>('idle');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const haptics = useHaptics();

  // Reset state when pairKey changes (new comparison)
  useEffect(() => {
    setSelectionState('idle');
    setWinnerId(null);
  }, [pairKey]);

  const handleSelect = (isA: boolean) => {
    if (selectionState !== 'idle') return;
    setSelectionState('selected');
    setWinnerId(isA ? movieA.id : movieB.id);
    haptics.success();

    setTimeout(() => {
      if (isA) onSelectA();
      else onSelectB();
    }, 500);
  };

  return (
    <View style={styles.container}>
      {/* Optional prompt text */}
      {prompt && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.promptContainer}>
          <Text style={styles.promptText}>{prompt}</Text>
        </Animated.View>
      )}

      {/* Movie cards */}
      <View key={`cards-${pairKey}`} style={styles.cardsContainer}>
        <CinematicCard
          movie={movieA}
          onSelect={() => handleSelect(true)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieA.id}
          isLoser={winnerId === movieB.id}
        />
        <CinematicCard
          movie={movieB}
          onSelect={() => handleSelect(false)}
          disabled={selectionState !== 'idle'}
          isWinner={winnerId === movieB.id}
          isLoser={winnerId === movieA.id}
        />
      </View>

      {/* Action buttons */}
      <View style={styles.buttonsContainer}>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.choiceButton, styles.choiceButtonPrimary]}
            onPress={() => handleSelect(true)}
            disabled={selectionState !== 'idle'}
          >
            <Text style={styles.choiceButtonText}>A</Text>
          </Pressable>

          <Pressable
            style={[styles.choiceButton, styles.choiceButtonPrimary]}
            onPress={() => handleSelect(false)}
            disabled={selectionState !== 'idle'}
          >
            <Text style={styles.choiceButtonText}>B</Text>
          </Pressable>
        </View>
      </View>

      {/* Cat mascot */}
      <View style={styles.mascotContainer}>
        <CatMascot pose={catPose} size={80} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  promptContainer: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  promptText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cardsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  buttonsContainer: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  choiceButton: {
    width: 70,
    height: 44,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceButtonPrimary: {
    backgroundColor: colors.accent,
  },
  choiceButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.background,
  },
  mascotContainer: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
});
