import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { Movie } from '../../types';
import { colors, shadows } from '../../theme/colors';
import { TapeStrip } from './TapeStrip';
import { PosterOverlayLines } from './PosterOverlayLines';
import { useAppDimensions } from '../../contexts/DimensionsContext';

interface CollageCardProps {
  movie: Movie;
  position: 'left' | 'right';
  label?: string;
  onSelect: () => void;
  disabled?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
}

export function CollageCard({
  movie,
  position,
  label,
  onSelect,
  disabled,
  isWinner,
  isLoser,
}: CollageCardProps) {
  const { containerWidth } = useAppDimensions();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Calculate responsive card dimensions
  const cardWidth = useMemo(() => (containerWidth - 56) / 2, [containerWidth]);
  const posterHeight = useMemo(() => cardWidth * 1.4, [cardWidth]);

  // Random slight rotation for each card (-2 to +2 degrees)
  const rotation = useMemo(() => (Math.random() - 0.5) * 4, []);

  // Random tape rotations
  const tapeRotations = useMemo(() => ({
    topLeft: -30 + (Math.random() - 0.5) * 20,
    topRight: 30 + (Math.random() - 0.5) * 20,
  }), []);

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const cardStyle = useAnimatedStyle(() => {
    if (isWinner) {
      return {
        transform: [
          { scale: withSequence(
            withSpring(1.08, { damping: 10 }),
            withSpring(1.04, { damping: 15 })
          )},
          { rotate: `${rotation}deg` },
        ],
        opacity: 1,
      };
    }

    if (isLoser) {
      return {
        transform: [
          { scale: withTiming(0.9, { duration: 200 }) },
          { rotate: `${rotation}deg` },
        ],
        opacity: withTiming(0.3, { duration: 200 }),
      };
    }

    return {
      transform: [
        { scale: scale.value },
        { rotate: `${rotation}deg` },
      ],
      opacity: opacity.value,
    };
  });

  return (
    <View style={styles.container}>
      {/* Label above card */}
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onSelect}
        disabled={disabled}
      >
        <Animated.View style={[styles.cardWrapper, cardStyle]}>
          {/* Card with white frame */}
          <View style={[styles.card, { width: cardWidth }]}>
            {/* Tape strips */}
            <TapeStrip position="top-left" rotation={tapeRotations.topLeft} />
            <TapeStrip position="top-right" rotation={tapeRotations.topRight} />

            {/* Poster container */}
            <View style={[styles.posterFrame, { height: posterHeight }]}>
              {movie.posterUrl && !imageError ? (
                <Image
                  source={{ uri: movie.posterUrl }}
                  style={styles.posterImage}
                  resizeMode="cover"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                />
              ) : (
                <View style={[styles.posterFallback, { backgroundColor: movie.posterColor }]}>
                  <Text style={styles.fallbackEmoji}>{movie.emoji || '🎬'}</Text>
                </View>
              )}

              {/* Overlay lines */}
              <PosterOverlayLines width={cardWidth - 16} height={posterHeight} />
            </View>

            {/* Movie info */}
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={2}>
                {movie.title.toUpperCase()}
              </Text>
              <Text style={styles.meta}>
                {movie.year} • {movie.genres.slice(0, 2).join(' / ')}
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.black,
    marginBottom: 12,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },
  cardWrapper: {
    // Shadow applied here so it animates with the card
  },
  card: {
    // width is set dynamically via inline style
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 8,
    ...shadows.card,
    borderWidth: 2,
    borderColor: colors.black,
  },
  posterFrame: {
    width: '100%',
    // height is set dynamically via inline style
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.cream,
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
  fallbackEmoji: {
    fontSize: 48,
  },
  info: {
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.black,
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
