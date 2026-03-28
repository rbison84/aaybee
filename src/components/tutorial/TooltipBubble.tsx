import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, Pressable, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';

interface TooltipBubbleProps {
  text: string;
  visible: boolean;
  position: ViewStyle;
  arrowDirection?: 'down' | 'up';
  onDismiss: () => void;
  autoHideMs?: number;
}

export function TooltipBubble({
  text,
  visible,
  position,
  arrowDirection = 'down',
  onDismiss,
  autoHideMs = 3000,
}: TooltipBubbleProps) {
  const opacity = useSharedValue(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      timerRef.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 200 }, () => {
          runOnJS(onDismiss)();
        });
      }, autoHideMs);
    } else {
      opacity.value = withTiming(0, { duration: 200 });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const handlePress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onDismiss)();
    });
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, position, animatedStyle]}
      pointerEvents="box-none"
    >
      <Pressable onPress={handlePress} style={styles.pressable}>
        {arrowDirection === 'up' && <ArrowUp />}
        <Animated.View style={styles.pill}>
          <Text style={styles.text}>{text}</Text>
        </Animated.View>
        {arrowDirection === 'down' && <ArrowDown />}
      </Pressable>
    </Animated.View>
  );
}

function ArrowDown() {
  return (
    <Animated.View style={styles.arrowDown} />
  );
}

function ArrowUp() {
  return (
    <Animated.View style={styles.arrowUp} />
  );
}

const ARROW_SIZE = 6;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 100,
    alignItems: 'center',
  },
  pressable: {
    alignItems: 'center',
  },
  pill: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  text: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '600',
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.accent,
  },
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.accent,
  },
});
