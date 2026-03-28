import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius } from '../../theme/cinematic';

interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <ProgressDot key={index} isActive={index < currentStep} isCurrent={index === currentStep} />
      ))}
    </View>
  );
}

function ProgressDot({ isActive, isCurrent }: { isActive: boolean; isCurrent: boolean }) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withSpring(isCurrent ? 24 : 10, { damping: 15, stiffness: 200 }),
    backgroundColor: isActive || isCurrent ? colors.accent : colors.surface,
    transform: [{ scale: withSpring(isCurrent ? 1.1 : 1) }],
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  dot: {
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
