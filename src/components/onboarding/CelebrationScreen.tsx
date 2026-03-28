import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme/cinematic';
import { useAppDimensions } from '../../contexts/DimensionsContext';

interface CelebrationScreenProps {
  moviesRanked: number;
  onContinue: () => void;
}

const CONFETTI_COLORS = [colors.accent, colors.success, colors.gold, colors.silver];

function ConfettiPiece({ delay, startX }: { delay: number; startX: number }) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(startX);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withTiming(600, { duration: 2500, easing: Easing.out(Easing.quad) })
    );
    translateX.value = withDelay(
      delay,
      withTiming(startX + (Math.random() - 0.5) * 100, { duration: 2500 })
    );
    rotate.value = withDelay(
      delay,
      withRepeat(withTiming(360, { duration: 1000 }), -1)
    );
    opacity.value = withDelay(delay + 2000, withTiming(0, { duration: 500 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confetti,
        { backgroundColor: color, left: startX },
        style,
      ]}
    />
  );
}

export function CelebrationScreen({ moviesRanked, onContinue }: CelebrationScreenProps) {
  const { containerWidth } = useAppDimensions();
  const haptics = useHaptics();
  const titleScale = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const statsOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.8);
  const iconRotate = useSharedValue(0);

  useEffect(() => {
    haptics.success();

    // Staggered entrance animations
    titleScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    subtitleOpacity.value = withDelay(300, withSpring(1));
    statsOpacity.value = withDelay(600, withSpring(1));
    buttonOpacity.value = withDelay(900, withSpring(1));
    buttonScale.value = withDelay(900, withSpring(1, { damping: 10 }));

    // Icon wiggle
    iconRotate.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 100 }),
          withTiming(10, { duration: 100 }),
          withTiming(0, { duration: 100 })
        ),
        3
      )
    );
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: titleScale.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const statsStyle = useAnimatedStyle(() => ({
    opacity: statsOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotate.value}deg` }],
  }));

  const handleContinue = () => {
    haptics.medium();
    onContinue();
  };

  // Generate confetti pieces
  const confettiPieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    delay: Math.random() * 500,
    startX: Math.random() * containerWidth,
  }));

  return (
    <View style={styles.container}>
      {/* Confetti */}
      {confettiPieces.map((piece) => (
        <ConfettiPiece key={piece.id} delay={piece.delay} startX={piece.startX} />
      ))}

      {/* Content */}
      <View style={styles.content}>
        <Animated.View style={[styles.iconContainer, iconStyle]}>
          <Text style={styles.iconText}>🎬</Text>
        </Animated.View>

        <Animated.Text style={[styles.title, titleStyle]}>
          your taste profile is ready!
        </Animated.Text>

        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          we already know so much about your movie taste
        </Animated.Text>

        <Animated.View style={[styles.statsContainer, statsStyle]}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{moviesRanked}</Text>
            <Text style={styles.statLabel}>movies ranked</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>5</Text>
            <Text style={styles.statLabel}>choices made</Text>
          </View>
        </Animated.View>

        <Animated.View style={buttonStyle}>
          <Pressable style={styles.button} onPress={handleContinue}>
            <Text style={styles.buttonText}>start ranking</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  confetti: {
    position: 'absolute',
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconText: {
    fontSize: 48,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    marginBottom: spacing.xxxl,
    ...shadows.card,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  statNumber: {
    ...typography.stat,
    fontSize: 32,
    color: colors.accent,
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.lg,
  },
  buttonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
});
