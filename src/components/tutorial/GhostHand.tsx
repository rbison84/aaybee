import React, { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface GhostHandProps {
  direction: 'left' | 'right' | 'up';
}

export function GhostHand({ direction }: GhostHandProps) {
  const translate = useSharedValue(0);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    translate.value = withRepeat(
      withSequence(
        withTiming(-40 * (direction === 'right' ? -1 : 1), {
          duration: direction === 'up' ? 0 : 0,
          easing: Easing.linear,
        }),
        withTiming(0, { duration: 0 }),
        withTiming(
          direction === 'up' ? -40 : direction === 'left' ? -40 : 40,
          { duration: 600, easing: Easing.out(Easing.ease) }
        ),
        withDelay(400, withTiming(0, { duration: 0 }))
      ),
      -1
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 0 }),
        withTiming(0.9, { duration: 600, easing: Easing.out(Easing.ease) }),
        withDelay(400, withTiming(0.4, { duration: 0 }))
      ),
      -1
    );
  }, [direction]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      direction === 'up'
        ? { translateY: translate.value }
        : { translateX: translate.value },
    ],
  }));

  const emoji = direction === 'up' ? '\u{1F446}' : '\u{1F448}';

  return (
    <Animated.View style={animatedStyle}>
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
    </Animated.View>
  );
}
