import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';

interface DecadeSelectorProps {
  onSelect: (decade: number) => void;
}

const DECADES = [
  { year: 1940, label: '40s' },
  { year: 1950, label: '50s' },
  { year: 1960, label: '60s' },
  { year: 1970, label: '70s' },
  { year: 1980, label: '80s' },
  { year: 1990, label: '90s' },
  { year: 2000, label: '00s' },
  { year: 2010, label: '10s' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function DecadeButton({ decade, onSelect }: { decade: typeof DECADES[0]; onSelect: () => void }) {
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    haptics.medium();
    onSelect();
  };

  return (
    <AnimatedPressable
      style={[styles.decadeButton, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      <Text style={styles.decadeLabel}>{decade.label}</Text>
    </AnimatedPressable>
  );
}

export function DecadeSelector({ onSelect }: DecadeSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>when were you born?</Text>
      <Text style={styles.subtitle}>
        this helps us pick movies from your era
      </Text>

      <View style={styles.grid}>
        {DECADES.map((decade) => (
          <DecadeButton
            key={decade.year}
            decade={decade}
            onSelect={() => onSelect(decade.year)}
          />
        ))}
      </View>

      <Text style={styles.privacyText}>
        we only use this for recommendations
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  decadeButton: {
    width: 72,
    height: 56,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  decadeLabel: {
    ...typography.bodyMedium,
    color: colors.accent,
    fontWeight: '600',
  },
  privacyText: {
    ...typography.tiny,
    color: colors.textMuted,
  },
});
