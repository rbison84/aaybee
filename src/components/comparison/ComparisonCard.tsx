import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Image, Platform } from 'react-native';
import { useAppDimensions } from '../../contexts/DimensionsContext';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  interpolateColor,
} from 'react-native-reanimated';
import { Movie } from '../../types';
import { getStatusEmoji } from '../../utils/statusManager';

interface ComparisonCardProps {
  movie: Movie;
  position: 'left' | 'right';
  onSelect: () => void;
  disabled?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  betaChange?: number;
}

export function ComparisonCard({
  movie,
  position,
  onSelect,
  disabled,
  isWinner,
  isLoser,
  betaChange,
}: ComparisonCardProps) {
  const { isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const opacity = useSharedValue(1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Handle press animation
  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  // Animated styles
  const cardStyle = useAnimatedStyle(() => {
    // Winner animation
    if (isWinner) {
      return {
        transform: [{ scale: withSequence(
          withSpring(1.05, { damping: 10 }),
          withSpring(1.02, { damping: 15 })
        )}],
        opacity: 1,
      };
    }

    // Loser animation
    if (isLoser) {
      return {
        transform: [{ scale: withTiming(0.95, { duration: 200 }) }],
        opacity: withTiming(0.4, { duration: 200 }),
      };
    }

    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: isWinner ? withTiming(0.8, { duration: 200 }) : 0,
  }));

  // Format genres
  const genreText = movie.genres.slice(0, 2).join(' • ');

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onSelect}
      disabled={disabled}
      // @ts-ignore — onHoverIn/Out supported by react-native-web
      onHoverIn={isDesktopWeb ? () => setIsHovered(true) : undefined}
      onHoverOut={isDesktopWeb ? () => setIsHovered(false) : undefined}
      style={[styles.pressable, isHovered && styles.pressableHovered]}
    >
      <Animated.View style={[styles.container, cardStyle]}>
        {/* Winner glow effect */}
        <Animated.View
          style={[
            styles.glow,
            glowStyle,
            { backgroundColor: '#4ade80' }
          ]}
        />

        {/* Card content */}
        <View style={[styles.card, { backgroundColor: movie.posterColor }]}>
          {/* Status badge */}
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{getStatusEmoji(movie.status)}</Text>
          </View>

          {/* Movie poster */}
          <View style={styles.posterContainer}>
            {movie.posterUrl && !imageError ? (
              <Image
                source={{ uri: movie.posterUrl }}
                style={styles.posterImage}
                resizeMode="cover"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            ) : (
              <Text style={styles.emoji}>{movie.emoji || '🎬'}</Text>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>
            {movie.title}
          </Text>

          {/* Year and genres */}
          <Text style={styles.meta}>
            {movie.year} • {genreText}
          </Text>

          {/* Beta indicator (subtle) */}
          <View style={styles.betaContainer}>
            <View
              style={[
                styles.betaBar,
                {
                  width: `${Math.max(10, Math.min(100, (movie.beta + 4) / 8 * 100))}%`,
                  backgroundColor: movie.beta >= 0 ? '#4ade80' : '#f87171',
                }
              ]}
            />
          </View>
        </View>

        {/* Beta change indicator */}
        {betaChange !== undefined && betaChange !== 0 && (
          <Animated.View
            style={[
              styles.betaChange,
              { backgroundColor: betaChange > 0 ? '#22c55e' : '#ef4444' }
            ]}
          >
            <Text style={styles.betaChangeText}>
              {betaChange > 0 ? '+' : ''}{betaChange.toFixed(2)}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    ...(Platform.OS === 'web' ? { transition: 'box-shadow 0.2s ease' } as any : {}),
  },
  pressableHovered: {
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 0 20px rgba(167, 139, 250, 0.3), 0 8px 24px rgba(0,0,0,0.4)',
    } as any : {}),
  },
  container: {
    flex: 1,
    margin: 6,
  },
  glow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 20,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 4px 8px rgba(0,0,0,0.3)' } as any
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }),
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
  },
  posterContainer: {
    width: 100,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
    ...(Platform.OS === 'web'
      ? { textShadow: '0px 1px 3px rgba(0,0,0,0.5)' } as any
      : { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }),
  },
  meta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 8,
  },
  betaContainer: {
    width: '80%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  betaBar: {
    height: '100%',
    borderRadius: 2,
  },
  betaChange: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  betaChangeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
