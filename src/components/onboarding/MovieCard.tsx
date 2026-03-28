import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Movie } from '../../types';
import { useHaptics } from '../../hooks/useHaptics';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme/cinematic';
import { useAppDimensions } from '../../contexts/DimensionsContext';

interface MovieCardProps {
  movie: Movie;
  position: 'left' | 'right';
  onSelect: () => void;
  disabled?: boolean;
}

export function MovieCard({ movie, position, onSelect, disabled }: MovieCardProps) {
  const { containerWidth } = useAppDimensions();
  const cardWidth = containerWidth * 0.40;
  const posterHeight = cardWidth * 1.35;
  const haptics = useHaptics();
  const scale = useSharedValue(1);
  const [imageError, setImageError] = useState(false);

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    if (disabled) return;
    haptics.medium();
    onSelect();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.5 : 1,
  }));

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View style={[styles.container, { width: cardWidth }, animatedStyle]}>
        {/* Card */}
        <View style={styles.card}>
          {/* Poster */}
          <View style={[styles.posterFrame, { height: posterHeight }]}>
            {movie.posterUrl && !imageError ? (
              <Image
                source={{ uri: movie.posterUrl }}
                style={styles.posterImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={[styles.posterFallback, { backgroundColor: movie.posterColor || colors.surface }]}>
                <Text style={styles.posterFallbackText}>
                  {movie.title.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Movie info */}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={2}>
              {movie.title}
            </Text>
            <Text style={styles.year}>{movie.year}</Text>
          </View>
        </View>

        {/* Tap hint */}
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>tap to select</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  posterFrame: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFallbackText: {
    ...typography.h2,
    color: colors.textMuted,
  },
  info: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  title: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  year: {
    ...typography.tiny,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tapHint: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.round,
  },
  tapHintText: {
    ...typography.tiny,
    color: colors.background,
    fontWeight: '600',
  },
});
