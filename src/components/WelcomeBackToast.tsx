import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

interface WelcomeBackToastProps {
  knownCount: number;
  totalComparisons: number;
  onDismiss?: () => void;
}

export function WelcomeBackToast({ knownCount, totalComparisons, onDismiss }: WelcomeBackToastProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Slide in
    translateY.value = withTiming(0, { duration: 400 });
    opacity.value = withTiming(1, { duration: 300 });

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      translateY.value = withTiming(-100, { duration: 300 });
      opacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setVisible)(false);
        if (onDismiss) runOnJS(onDismiss)();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const getMessage = () => {
    if (knownCount === 0) {
      return "ready to discover your taste?";
    } else if (knownCount < 10) {
      return `you've ranked ${knownCount} movie${knownCount !== 1 ? 's' : ''}. keep going!`;
    } else if (knownCount < 25) {
      return `${knownCount} movies ranked! your taste is taking shape.`;
    } else {
      return `${knownCount} movies in your ranking.`;
    }
  };

  return (
    <Animated.View style={[styles.container, { top: insets.top + 8 }, animatedStyle]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>👋</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>welcome back</Text>
          <Text style={styles.message}>{getMessage()}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.captionMedium,
    color: colors.accent,
  },
  message: {
    ...typography.tiny,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
