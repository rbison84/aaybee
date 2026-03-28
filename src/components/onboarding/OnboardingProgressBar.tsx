import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, borderRadius, spacing, typography } from '../../theme/cinematic';

interface OnboardingProgressBarProps {
  progress: number; // 0 to 1
  current?: number;
  total?: number;
  label?: string;
}

export function OnboardingProgressBar({ progress, current, total, label = 'Building your aaybee classic' }: OnboardingProgressBarProps) {
  const animatedProgress = useSharedValue(progress);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, { duration: 300 });
  }, [progress, animatedProgress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {current !== undefined && total !== undefined && (
          <Text style={styles.count}>{current}/{total}</Text>
        )}
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  count: {
    ...typography.captionMedium,
    color: colors.accent,
  },
  track: {
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.round,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.round,
  },
});
