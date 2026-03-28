import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';

interface VSBadgeProps {
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
}

export function VSBadge({ size = 'medium', animated = true }: VSBadgeProps) {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (animated) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        true
      );
    }
  }, [animated]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sizeStyles = {
    small: { fontSize: 40, width: 60, height: 60 },
    medium: { fontSize: 56, width: 80, height: 80 },
    large: { fontSize: 72, width: 100, height: 100 },
  };

  const config = sizeStyles[size];

  return (
    <Animated.View style={[styles.container, animatedStyle, { width: config.width, height: config.height }]}>
      <View style={styles.burst} />
      <Text style={[styles.text, { fontSize: config.fontSize }]}>VS</Text>
      <Text style={[styles.textShadow, { fontSize: config.fontSize }]}>VS</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  burst: {
    position: 'absolute',
    width: '120%',
    height: '120%',
    backgroundColor: colors.white,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: colors.black,
  },
  text: {
    fontWeight: '900',
    color: colors.red,
    letterSpacing: -2,
    zIndex: 2,
  },
  textShadow: {
    position: 'absolute',
    fontWeight: '900',
    color: colors.black,
    letterSpacing: -2,
    transform: [{ translateX: 2 }, { translateY: 2 }],
    zIndex: 1,
  },
});
