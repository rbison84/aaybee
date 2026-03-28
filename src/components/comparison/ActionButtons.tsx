import React from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { useAppDimensions } from '../../contexts/DimensionsContext';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';

interface ActionButtonsProps {
  onChooseLeft: () => void;
  onChooseRight: () => void;
  onSkip: () => void;
  disabled?: boolean;
  leftTitle?: string;
  rightTitle?: string;
}

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'skip';
  disabled?: boolean;
}) {
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    if (disabled) return;
    if (variant === 'skip') {
      haptics.light();
    } else {
      haptics.medium();
    }
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  const buttonStyle = [
    styles.button,
    variant === 'primary' && styles.primaryButton,
    variant === 'secondary' && styles.secondaryButton,
    variant === 'skip' && styles.skipButton,
  ];

  const textStyle = [
    styles.buttonText,
    variant === 'skip' && styles.skipText,
  ];

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View style={[buttonStyle, animatedStyle]}>
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function ActionButtons({
  onChooseLeft,
  onChooseRight,
  onSkip,
  disabled,
  leftTitle = 'Choose',
  rightTitle = 'Choose',
}: ActionButtonsProps) {
  const { isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;

  return (
    <View style={styles.container}>
      <View style={styles.mainButtons}>
        <ActionButton
          label={`👈 ${leftTitle}`}
          onPress={onChooseLeft}
          variant="primary"
          disabled={disabled}
        />

        <ActionButton
          label="Skip"
          onPress={onSkip}
          variant="skip"
          disabled={disabled}
        />

        <ActionButton
          label={`${rightTitle} 👉`}
          onPress={onChooseRight}
          variant="secondary"
          disabled={disabled}
        />
      </View>

      <Text style={styles.hint}>
        {isDesktopWeb
          ? 'Click a movie, use buttons, or press ← → arrow keys'
          : 'Tap a movie or use buttons below'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  mainButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
  },
  secondaryButton: {
    backgroundColor: '#8b5cf6',
  },
  skipButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: 70,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  skipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  hint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 8,
  },
});
