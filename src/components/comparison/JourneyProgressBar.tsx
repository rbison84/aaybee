import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';

interface JourneyProgressBarProps {
  comparisons: number; // postOnboardingComparisons (0-100+)
}

const MILESTONES = [
  { at: 10, label: 'classic' },
  { at: 30, label: 'top 25' },
  { at: 40, label: 'recs' },
  { at: 70, label: 'decide' },
  { at: 85, label: 'all' },
  { at: 100, label: 'taste' },
];
const TOTAL = 100;
const REC_DOTS = [45, 50, 55, 60]; // recs 2-5

const ORANGE = '#FF8C00';
const BLUE = '#4ABFED';

export function JourneyProgressBar({ comparisons }: JourneyProgressBarProps) {
  const progress = Math.min(comparisons / TOTAL, 1);
  const animatedProgress = useSharedValue(progress);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, { duration: 300 });
  }, [progress, animatedProgress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>{Math.min(comparisons, TOTAL)}/{TOTAL}</Text>
      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />

          {/* Rec dots (recs 2-5) */}
          {REC_DOTS.map((pos) => {
            const completed = comparisons >= pos;
            return (
              <View
                key={`rec-${pos}`}
                style={[
                  styles.recDot,
                  { left: `${(pos / TOTAL) * 100}%` },
                  completed ? styles.recDotCompleted : styles.recDotUpcoming,
                ]}
              />
            );
          })}

          {/* Milestone notches */}
          {MILESTONES.map((m) => {
            const completed = comparisons >= m.at;
            return (
              <View
                key={m.at}
                style={[
                  styles.notch,
                  { left: `${(m.at / TOTAL) * 100}%` },
                  completed ? styles.notchCompleted : styles.notchUpcoming,
                ]}
              />
            );
          })}
        </View>

        {/* Milestone labels */}
        <View style={styles.labelsRow}>
          {MILESTONES.map((m) => {
            const completed = comparisons >= m.at;
            return (
              <Text
                key={m.at}
                style={[
                  styles.label,
                  { left: `${(m.at / TOTAL) * 100}%` },
                  completed ? styles.labelActive : styles.labelDimmed,
                ]}
              >
                {m.label}
              </Text>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const NOTCH_SIZE = 12;
const REC_DOT_SIZE = 8;
const TRACK_HEIGHT = 4;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  counter: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.white,
    marginRight: spacing.sm,
    marginTop: -4,
    minWidth: 38,
  },
  trackWrap: {
    flex: 1,
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.round,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.round,
  },

  // Milestone notches
  notch: {
    position: 'absolute',
    top: -(NOTCH_SIZE - TRACK_HEIGHT) / 2,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_SIZE / 2,
    marginLeft: -NOTCH_SIZE / 2,
  },
  notchCompleted: {
    backgroundColor: ORANGE,
  },
  notchUpcoming: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },

  // Rec dots (recs 2-5)
  recDot: {
    position: 'absolute',
    top: (TRACK_HEIGHT - REC_DOT_SIZE) / 2,
    width: REC_DOT_SIZE,
    height: REC_DOT_SIZE,
    borderRadius: REC_DOT_SIZE / 2,
    marginLeft: -REC_DOT_SIZE / 2,
  },
  recDotCompleted: {
    backgroundColor: BLUE,
  },
  recDotUpcoming: {
    backgroundColor: colors.surface,
  },

  // Labels
  labelsRow: {
    position: 'relative',
    height: 16,
    marginTop: 2,
  },
  label: {
    position: 'absolute',
    ...typography.tiny,
    width: 40,
    marginLeft: -20,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.textSecondary,
  },
  labelDimmed: {
    color: colors.textMuted,
  },
});
