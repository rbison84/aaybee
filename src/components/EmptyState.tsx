import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { CinematicButton } from './cinematic';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  // Legacy prop support
  emoji?: string;
}

export function EmptyState({
  icon,
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  // Use icon if provided, otherwise fallback to emoji for backwards compatibility
  const displayIcon = icon || emoji;

  return (
    <Animated.View style={styles.container} entering={FadeIn.duration(400)}>
      {displayIcon && (
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>{displayIcon}</Text>
        </View>
      )}
      <Text style={styles.title}>{title.toLowerCase()}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <View style={styles.buttonContainer}>
          <CinematicButton
            label={actionLabel.toLowerCase()}
            variant="primary"
            onPress={onAction}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
    minHeight: 300,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconText: {
    fontSize: 36,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  buttonContainer: {
    marginTop: spacing.xl,
  },
});
