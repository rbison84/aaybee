import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CatMascot } from './onboarding/CatMascot';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

interface LockedFeatureCardProps {
  feature: string;
  description: string;
  currentComparisons: number;
  requiredComparisons: number;
  onContinueComparing?: () => void;
}

export function LockedFeatureCard({
  feature,
  description,
  currentComparisons,
  requiredComparisons,
  onContinueComparing,
}: LockedFeatureCardProps) {
  const remaining = requiredComparisons - currentComparisons;
  const progress = Math.min(1, currentComparisons / requiredComparisons);

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(400)}>
      <CatMascot pose="sat" size={100} />

      <Text style={styles.title}>{feature}</Text>

      <Text style={styles.description}>{description}</Text>

      <Text style={styles.remaining}>
        compare {remaining} more movie{remaining !== 1 ? 's' : ''} to unlock
      </Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {currentComparisons}/{requiredComparisons}
        </Text>
      </View>

      {onContinueComparing && (
        <Pressable style={styles.button} onPress={onContinueComparing}>
          <Text style={styles.buttonText}>continue comparing</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  remaining: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 250,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  progressText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.lg,
  },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
});
