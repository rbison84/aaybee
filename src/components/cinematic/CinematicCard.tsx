import React, { useState, useMemo, memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { Movie } from '../../types';
import { colors, shadows, animation, borderRadius, typography } from '../../theme/cinematic';
import { useAppDimensions } from '../../contexts/DimensionsContext';

interface CinematicCardProps {
  movie: Movie;
  onSelect: () => void;
  onSwipeAway?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  shouldConfirmSwipeAway?: boolean;
  disabled?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  label?: string;
  labelColor?: string;
  position?: 'left' | 'right';
  rank?: number;
  rankingStatus?: string;
  isOnWatchlist?: boolean;
  onRanked?: () => void;
  onAaybee100Collected?: () => void;
  aaybee100Color?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const CinematicCard = memo(function CinematicCard({
  movie,
  onSelect,
  onSwipeAway,
  onSwipeUp,
  onSwipeDown,
  shouldConfirmSwipeAway,
  disabled,
  isWinner,
  isLoser,
  label,
  labelColor,
  position,
  rank,
  rankingStatus,
  isOnWatchlist,
  onRanked,
  onAaybee100Collected,
  aaybee100Color,
}: CinematicCardProps) {
  const { containerWidth, height: screenHeight, isDesktop, isWeb } = useAppDimensions();
  const isDesktopWeb = isDesktop && isWeb;
  const swipeThreshold = containerWidth * 0.12;
  const verticalSwipeThreshold = screenHeight * 0.08;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const isVerticalSwipe = useSharedValue(false);

  // New rank pulse animation
  const prevRankRef = useRef<number | undefined>(rank);
  const badgeScale = useSharedValue(1);

  useEffect(() => {
    if (prevRankRef.current === undefined && rank !== undefined) {
      // Movie just crossed the ranking threshold — pulse the badge after winner spring settles
      badgeScale.value = withDelay(300, withSequence(
        withTiming(1.35, { duration: 200 }),
        withTiming(1, { duration: 250 }),
      ));
      // Skip onRanked haptic for Aaybee 100 movies — they get their own distinct feedback
      if (onRanked && !aaybee100Color) {
        const timer = setTimeout(onRanked, 300);
        return () => clearTimeout(timer);
      }
    }
    prevRankRef.current = rank;
  }, [rank]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  // Aaybee 100 badge fade+scale animation
  const prevAaybee100Ref = useRef<string | undefined>(aaybee100Color);
  const aaybee100Scale = useSharedValue(aaybee100Color ? 1 : 0);
  const aaybee100Opacity = useSharedValue(aaybee100Color ? 1 : 0);

  useEffect(() => {
    if (!prevAaybee100Ref.current && aaybee100Color) {
      aaybee100Scale.value = 0.5;
      aaybee100Opacity.value = 0;
      aaybee100Scale.value = withDelay(400, withTiming(1, { duration: 350 }));
      aaybee100Opacity.value = withDelay(400, withTiming(1, { duration: 250 }));
      // Fire distinct callback once badge is visible
      if (onAaybee100Collected) {
        const timer = setTimeout(onAaybee100Collected, 550);
        return () => clearTimeout(timer);
      }
    } else if (!aaybee100Color) {
      aaybee100Scale.value = 0;
      aaybee100Opacity.value = 0;
    }
    prevAaybee100Ref.current = aaybee100Color;
  }, [aaybee100Color]);

  const aaybee100Style = useAnimatedStyle(() => ({
    transform: [{ scale: aaybee100Scale.value }],
    opacity: aaybee100Opacity.value,
  }));

  // Aaybee 100 glow pulse — fires only on first reveal, then stops
  const glowPulseScale = useSharedValue(1);
  const glowPulseOpacity = useSharedValue(0);

  useEffect(() => {
    if (!prevAaybee100Ref.current && aaybee100Color) {
      // 3 pulses on reveal, then stop
      glowPulseScale.value = 1;
      glowPulseOpacity.value = withDelay(400, withRepeat(
        withSequence(
          withTiming(0.6, { duration: 0 }),
          withTiming(0, { duration: 600 }),
        ),
        3,
      ));
    }
  }, [aaybee100Color]);

  const glowPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulseScale.value }],
    opacity: glowPulseOpacity.value,
  }));

  // Reset position when movie changes
  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    cardOpacity.value = 1;
    isVerticalSwipe.value = false;
  }, [movie.id]);

  // Calculate responsive card dimensions - larger posters are the hero
  const cardWidth = useMemo(() => {
    const availableWidth = containerWidth - 48; // 24px padding each side
    return (availableWidth - 16) / 2; // 16px gap between cards
  }, [containerWidth]);

  const posterHeight = useMemo(() => cardWidth * 1.5, [cardWidth]);

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(animation.buttonPress.scale, animation.springSnappy);
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, animation.springSnappy);
  };

  // Card animation based on win/lose state
  const cardStyle = useAnimatedStyle(() => {
    if (isWinner) {
      return {
        transform: [
          { scale: withSpring(animation.winner.scale, animation.springBouncy) },
        ],
        opacity: 1,
      };
    }

    if (isLoser) {
      return {
        transform: [
          { scale: withTiming(animation.loser.scale, { duration: animation.loser.duration }) },
        ],
        opacity: withTiming(animation.loser.opacity, { duration: animation.loser.duration }),
      };
    }

    return {
      transform: [{ scale: scale.value }],
      opacity: 1,
    };
  });

  // Glow effect for winner
  const glowStyle = useAnimatedStyle(() => {
    if (isWinner) {
      return {
        opacity: withTiming(1, { duration: animation.winner.duration }),
      };
    }
    return {
      opacity: 0,
    };
  });

  // Swipe gesture for marking unknown (horizontal) or adding to watchlist (vertical)
  // Enabled on native and mobile web; disabled on desktop web (hover/click is better)
  const swipeGesture = Gesture.Pan()
    .enabled(!disabled && !isDesktopWeb && (!!onSwipeAway || !!onSwipeUp || !!onSwipeDown))
    .onBegin(() => {
      isVerticalSwipe.value = false;
    })
    .onUpdate((event) => {
      const absX = Math.abs(event.translationX);
      const absY = Math.abs(event.translationY);

      // Determine direction once movement is significant
      if (absX > 10 || absY > 10) {
        if (event.translationY < 0 && absY > absX && onSwipeUp) {
          // Vertical swipe up
          isVerticalSwipe.value = true;
          translateY.value = event.translationY;
          translateX.value = 0;
          cardOpacity.value = 1 - absY / (screenHeight * 0.3);
        } else if (event.translationY > 0 && absY > absX && onSwipeDown) {
          // Vertical swipe down
          isVerticalSwipe.value = true;
          translateY.value = event.translationY;
          translateX.value = 0;
          cardOpacity.value = 1 - absY / (screenHeight * 0.3);
        } else if (!isVerticalSwipe.value && onSwipeAway) {
          // Horizontal swipe
          const isValidDirection = absX > 0;

          if (isValidDirection) {
            translateX.value = event.translationX;
            translateY.value = 0;
            cardOpacity.value = 1 - absX / (containerWidth * 0.4);
          }
        }
      }
    })
    .onEnd((event) => {
      if (isVerticalSwipe.value) {
        // Vertical swipe end
        if (event.translationY < -verticalSwipeThreshold && onSwipeUp) {
          translateY.value = withSpring(0);
          cardOpacity.value = withSpring(1);
          runOnJS(onSwipeUp)();
        } else if (event.translationY > verticalSwipeThreshold && onSwipeDown) {
          translateY.value = withSpring(0);
          cardOpacity.value = withSpring(1);
          runOnJS(onSwipeDown)();
        } else {
          translateY.value = withSpring(0);
          cardOpacity.value = withSpring(1);
        }
      } else {
        // Horizontal swipe end
        const swipedLeft = event.translationX < -swipeThreshold;
        const swipedRight = event.translationX > swipeThreshold;

        const isValidSwipe = swipedLeft || swipedRight;

        if (isValidSwipe && onSwipeAway) {
          if (shouldConfirmSwipeAway) {
            // Snap back and let parent handle confirmation
            translateX.value = withSpring(0);
            cardOpacity.value = withSpring(1);
            runOnJS(onSwipeAway)();
          } else {
            const direction = event.translationX < 0 ? -1 : 1;
            translateX.value = withTiming(direction * containerWidth * 0.6, { duration: 200 });
            cardOpacity.value = withTiming(0, { duration: 200 }, () => {
              runOnJS(onSwipeAway)();
            });
          }
        } else {
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          cardOpacity.value = withSpring(1);
        }
      }
      isVerticalSwipe.value = false;
    });

  // Combined card style including swipe translation
  const swipeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: cardOpacity.value,
  }));

  // Watchlist indicator that fades in when dragging upward
  const watchlistIndicatorStyle = useAnimatedStyle(() => {
    const opacity = isVerticalSwipe.value && translateY.value < 0
      ? Math.min(1, Math.abs(translateY.value) / (verticalSwipeThreshold * 0.8))
      : 0;
    return { opacity };
  });

  // Watchlist indicator that fades in when dragging downward
  const watchlistDownIndicatorStyle = useAnimatedStyle(() => {
    const opacity = isVerticalSwipe.value && translateY.value > 0
      ? Math.min(1, translateY.value / (verticalSwipeThreshold * 0.8))
      : 0;
    return { opacity };
  });

  const cardContent = (
    <View style={{ width: cardWidth }}>
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onSelect}
      disabled={disabled}
      // @ts-ignore — onHoverIn/Out supported by react-native-web
      onHoverIn={isDesktopWeb ? () => setIsHovered(true) : undefined}
      onHoverOut={isDesktopWeb ? () => setIsHovered(false) : undefined}
      style={[styles.container, cardStyle, isHovered && styles.containerHovered]}
    >
      {/* Winner glow effect */}
      <Animated.View style={[styles.glowEffect, glowStyle]} />

      {/* Poster */}
      <View style={[styles.posterContainer, { height: posterHeight }]}>
        {movie.posterUrl && !imageError ? (
          <Image
            source={{ uri: movie.posterUrl }}
            style={styles.posterImage}
            resizeMode="cover"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.posterFallback, { backgroundColor: movie.posterColor || colors.surface }]}>
            <Text style={styles.fallbackText}>{movie.title.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}

        {/* Subtle gradient overlay at bottom for text readability */}
        <View style={styles.posterGradient} />

        {/* Label badge (A/B) */}
        {label && (
          <View style={[styles.labelBadge, labelColor && { backgroundColor: labelColor }]}>
            <Text style={styles.labelText}>{label}</Text>
          </View>
        )}

        {/* Rank / status badge (bottom-right of poster) */}
        {rank != null ? (
          <Animated.View style={[styles.rankBadge, badgeAnimatedStyle]}>
            <Text style={styles.rankBadgeText}>
              #{rank}
            </Text>
          </Animated.View>
        ) : rankingStatus != null ? (
          <View style={[
            styles.rankBadge,
            rankingStatus === 'unranked'
              ? styles.statusBadgeUnranked
              : styles.statusBadgeProgress,
          ]}>
            <Text style={[
              styles.rankBadgeText,
              rankingStatus === 'unranked'
                ? styles.statusTextUnranked
                : styles.statusTextProgress,
            ]}>
              {rankingStatus}
            </Text>
          </View>
        ) : null}

        {/* On-watchlist cue (bottom-left of poster) */}
        {isOnWatchlist && (
          <View style={styles.watchlistBadge}>
            <Text style={styles.watchlistBadgeText}>✓</Text>
          </View>
        )}

        {/* Watchlist indicator shown when dragging upward */}
        {onSwipeUp && (
          <Animated.View style={[styles.watchlistIndicator, watchlistIndicatorStyle]}>
            <Text style={styles.watchlistIndicatorText}>+ watchlist</Text>
          </Animated.View>
        )}

        {/* Watchlist indicator shown when dragging downward */}
        {onSwipeDown && (
          <Animated.View style={[styles.watchlistDownIndicator, watchlistDownIndicatorStyle]}>
            <Text style={styles.watchlistIndicatorText}>+ watchlist</Text>
          </Animated.View>
        )}
      </View>

      {/* Movie info - minimal */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        <Text style={styles.meta}>
          {movie.year}
        </Text>
      </View>
    </AnimatedPressable>

    {/* Aaybee 100 badge — lifted above loser dim with glow pulse */}
    {aaybee100Color && (
      <View style={styles.aaybee100Float} pointerEvents="none">
        <Animated.View style={[styles.aaybee100Glow, { backgroundColor: aaybee100Color }, glowPulseStyle]} />
        <Animated.View style={[styles.aaybee100Badge, { backgroundColor: aaybee100Color + '30', borderColor: aaybee100Color + '60' }, aaybee100Style]}>
          <Svg width={14} height={14} viewBox="0 0 20 20" fill="none">
            <Path
              d="M1 1h3v3H1zM6 1h3v3H6zM11 1h3v3h-3zM16 1h3v3h-3zM1 6h3v3H1zM6 6h3v3H6zM11 6h3v3h-3zM16 6h3v3h-3zM1 11h3v3H1zM6 11h3v3H6zM11 11h3v3h-3zM16 11h3v3h-3zM1 16h3v3H1zM6 16h3v3H6zM11 16h3v3h-3zM16 16h3v3h-3z"
              fill={aaybee100Color}
            />
          </Svg>
        </Animated.View>
      </View>
    )}
    </View>
  );

  // Wrap with gesture detector if swipe is enabled
  if (onSwipeAway || onSwipeUp || onSwipeDown) {
    return (
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={swipeStyle}>
          {cardContent}
        </Animated.View>
      </GestureDetector>
    );
  }

  return cardContent;
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render when these change
  return (
    prevProps.movie.id === nextProps.movie.id &&
    prevProps.movie.posterUrl === nextProps.movie.posterUrl &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.isWinner === nextProps.isWinner &&
    prevProps.isLoser === nextProps.isLoser &&
    prevProps.label === nextProps.label &&
    prevProps.onSwipeAway === nextProps.onSwipeAway &&
    prevProps.onSwipeUp === nextProps.onSwipeUp &&
    prevProps.onSwipeDown === nextProps.onSwipeDown &&
    prevProps.shouldConfirmSwipeAway === nextProps.shouldConfirmSwipeAway &&
    prevProps.rank === nextProps.rank &&
    prevProps.rankingStatus === nextProps.rankingStatus &&
    prevProps.isOnWatchlist === nextProps.isOnWatchlist &&
    prevProps.onRanked === nextProps.onRanked &&
    prevProps.onAaybee100Collected === nextProps.onAaybee100Collected &&
    prevProps.aaybee100Color === nextProps.aaybee100Color
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    paddingBottom: 4,
    ...(Platform.OS === 'web' ? { transition: 'box-shadow 0.2s ease, transform 0.15s ease' } as any : {}),
  },
  containerHovered: {
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 0 20px rgba(167, 139, 250, 0.3), 0 8px 24px rgba(0,0,0,0.4)',
    } as any : {}),
  },
  glowEffect: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: borderRadius.xl + 4,
    backgroundColor: colors.accentGlow,
    ...shadows.accentGlow,
  },
  posterContainer: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.posterLift,
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
  fallbackText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textMuted,
  },
  posterGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    // Subtle gradient for depth
  },
  labelBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.accent,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.background,
  },
  aaybee100Float: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aaybee100Glow: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  aaybee100Badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  rankBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadgeUnranked: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  statusBadgeProgress: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderColor: 'rgba(229, 168, 75, 0.4)',
  },
  statusTextUnranked: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
  },
  statusTextProgress: {
    color: 'rgba(229, 168, 75, 0.9)',
    fontWeight: '600',
  },
  watchlistBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.85)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  watchlistBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  watchlistIndicator: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  watchlistDownIndicator: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  watchlistIndicatorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'rgba(76, 175, 80, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  info: {
    paddingTop: 16,
    paddingHorizontal: 2,
    height: 72, // Fixed height to accommodate 2 lines of title + year
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginBottom: 4,
    lineHeight: 20,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
