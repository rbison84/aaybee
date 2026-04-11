import React, { useState } from 'react';
import { Text, StyleSheet, Pressable, ViewStyle, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, borderRadius, typography, animation, shadows } from '../../theme/cinematic';
import { useHaptics } from '../../hooks/useHaptics';
import { useAppDimensions } from '../../contexts/DimensionsContext';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface CinematicButtonProps {
  label: string;
  variant?: ButtonVariant;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CinematicButton({
  label,
  variant = 'primary',
  onPress,
  disabled,
  fullWidth,
  size = 'medium',
  style,
}: CinematicButtonProps) {
  const haptics = useHaptics();
  const { isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;
  const [isHovered, setIsHovered] = useState(false);
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(animation.buttonPress.scale, animation.springSnappy);
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, animation.springSnappy);
  };

  const handlePress = () => {
    if (disabled) return;
    haptics.medium();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyles = getVariantStyles(variant);
  const sizeStyles = getSizeStyles(size);

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      // @ts-ignore — onHoverIn/Out supported by react-native-web
      onHoverIn={isDesktopWeb ? () => setIsHovered(true) : undefined}
      onHoverOut={isDesktopWeb ? () => setIsHovered(false) : undefined}
      style={[
        styles.button,
        variantStyles.button,
        sizeStyles.button,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        isHovered && !disabled && styles.hovered,
        animatedStyle,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          variantStyles.text,
          sizeStyles.text,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function getVariantStyles(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return {
        button: {
          backgroundColor: colors.textPrimary,
        },
        text: {
          color: colors.background,
        },
      };
    case 'secondary':
      return {
        button: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
        text: {
          color: colors.textPrimary,
        },
      };
    case 'ghost':
      return {
        button: {
          backgroundColor: 'transparent',
        },
        text: {
          color: colors.textSecondary,
        },
      };
    case 'destructive':
      return {
        button: {
          backgroundColor: colors.errorSubtle,
          borderWidth: 1,
          borderColor: colors.error,
        },
        text: {
          color: colors.error,
        },
      };
    default:
      return { button: {}, text: {} };
  }
}

function getSizeStyles(size: 'small' | 'medium' | 'large') {
  switch (size) {
    case 'small':
      return {
        button: {
          paddingVertical: 8,
          paddingHorizontal: 16,
        },
        text: {
          fontSize: 13,
        },
      };
    case 'medium':
      return {
        button: {
          paddingVertical: 14,
          paddingHorizontal: 20,
        },
        text: {
          fontSize: 15,
        },
      };
    case 'large':
      return {
        button: {
          paddingVertical: 16,
          paddingHorizontal: 24,
        },
        text: {
          fontSize: 16,
        },
      };
    default:
      return { button: {}, text: {} };
  }
}

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { transition: 'opacity 0.15s ease, transform 0.1s ease' } as any : {}),
  },
  hovered: {
    ...(Platform.OS === 'web' ? {
      borderColor: colors.accent,
    } as any : {}),
    opacity: 0.9,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.3,
  },
  text: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  disabledText: {
    opacity: 0.7,
  },
});
