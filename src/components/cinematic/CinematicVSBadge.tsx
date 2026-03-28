import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { colors, borderRadius, typography } from '../../theme/cinematic';

interface CinematicVSBadgeProps {
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
}

export function CinematicVSBadge({ size = 'medium', animated = true }: CinematicVSBadgeProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  React.useEffect(() => {
    if (animated) {
      // Subtle pulse animation
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 800 }),
          withTiming(0.6, { duration: 800 })
        ),
        -1,
        true
      );
    }
  }, [animated]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const sizeConfig = {
    small: { width: 40, height: 40, fontSize: 14 },
    medium: { width: 50, height: 50, fontSize: 16 },
    large: { width: 60, height: 60, fontSize: 18 },
  };

  const config = sizeConfig[size];

  return (
    <Animated.View
      style={[
        styles.container,
        { width: config.width, height: config.height },
        animatedStyle,
      ]}
    >
      <Text style={[styles.text, { fontSize: config.fontSize }]}>vs</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
});
