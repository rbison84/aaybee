import React from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { useHaptics } from '../../hooks/useHaptics';

interface CollageButtonProps {
  label: string;
  variant: 'left' | 'right' | 'skip';
  onPress: () => void;
  disabled?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CollageButton({ label, variant, onPress, disabled }: CollageButtonProps) {
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const variantStyles = {
    left: {
      backgroundColor: colors.yellow,
      skew: -3,
    },
    right: {
      backgroundColor: colors.cyan,
      skew: 3,
    },
    skip: {
      backgroundColor: colors.white,
      skew: 0,
    },
  };

  const config = variantStyles[variant];

  const handlePressIn = () => {
    scale.value = withSpring(1.05, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    haptics.medium();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { skewX: `${config.skew}deg` },
    ],
  }));

  const isSkip = variant === 'skip';

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.button,
        isSkip ? styles.skipButton : styles.mainButton,
        { backgroundColor: config.backgroundColor },
        animatedStyle,
      ]}
    >
      {/* Shadow layer for main buttons */}
      {!isSkip && <View style={styles.shadowLayer} />}

      <Text
        style={[
          styles.text,
          isSkip && styles.skipText,
          { transform: [{ skewX: `${-config.skew}deg` }] }, // Counter-skew the text
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  mainButton: {
    borderWidth: 3,
    borderColor: colors.black,
    position: 'relative',
  },
  skipButton: {
    borderWidth: 2,
    borderColor: colors.black,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 80,
  },
  shadowLayer: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: colors.black,
    borderRadius: 8,
    zIndex: -1,
  },
  text: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.black,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
