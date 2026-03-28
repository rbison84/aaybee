import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, Image, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../store/useAppStore';
import { useRecommendationTracking } from '../../contexts/RecommendationTrackingContext';
import { useQuickRank } from '../../contexts/QuickRankContext';
import { useHaptics } from '../../hooks/useHaptics';
import { CatMascot } from '../onboarding/CatMascot';
import { GiftIcon } from '../GiftIcon';
import { CinematicButton } from '../cinematic';
import { recommendationService, MovieRecommendation, getEffectiveTier } from '../../services/recommendationService';
import { colors, borderRadius, typography, spacing } from '../../theme/cinematic';

const POSTER_WIDTH = 160;
const POSTER_HEIGHT = 240;
const FLIP_DURATION = 500;

interface RecommendationRevealOverlayProps {
  visible: boolean;
  onComplete: () => void;
}

type RevealPhase = 'mystery' | 'revealing' | 'revealed';

export function RecommendationRevealOverlay({ visible, onComplete }: RecommendationRevealOverlayProps) {
  const { user } = useAuth();
  const { getAllComparedMovies, markMovieAsKnown, userSession } = useAppStore();
  const { onReveal: trackReveal, getRevealedMovieIds } = useRecommendationTracking();
  const { startQuickRank } = useQuickRank();
  const haptics = useHaptics();

  const [phase, setPhase] = useState<RevealPhase>('mystery');
  const [recommendation, setRecommendation] = useState<MovieRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Flip animation (0 = gift face, 1 = poster face)
  const flipProgress = useSharedValue(0);

  // Load recommendation when visible - only once per show
  useEffect(() => {
    if (!visible) {
      setPhase('mystery');
      setRecommendation(null);
      setIsLoading(true);
      setError(null);
      flipProgress.value = 0;
      hasLoadedRef.current = false;
      return;
    }

    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadRecommendation = async () => {
      if (!user?.id) {
        setError('Sign in to get recommendations');
        setIsLoading(false);
        return;
      }

      try {
        const revealedIds = getRevealedMovieIds();
        const maxTier = getEffectiveTier(userSession.totalComparisons, userSession.poolUnlockedTier);
        const result = await recommendationService.getRecommendations(user.id, 1, revealedIds, { ...userSession.preferences, maxTier });
        if (result.recommendations.length > 0) {
          setRecommendation(result.recommendations[0]);
        } else {
          setError('No recommendations available');
        }
      } catch (err) {
        console.error('[RevealOverlay] Failed to load:', err);
        setError('Failed to load recommendation');
      } finally {
        setIsLoading(false);
      }
    };

    loadRecommendation();
  }, [visible, user?.id, getRevealedMovieIds]);

  const onFlipComplete = useCallback(() => {
    if (!recommendation) return;
    setPhase('revealed');
    trackReveal(recommendation.movieId, {
      movieId: recommendation.movieId,
      title: recommendation.title,
      year: recommendation.year,
      posterUrl: recommendation.posterUrl,
      reason: recommendation.reason,
    });
  }, [recommendation, trackReveal]);

  const handleReveal = useCallback(() => {
    if (!recommendation || phase !== 'mystery') return;

    setPhase('revealing');

    // Haptic at midpoint of flip
    setTimeout(() => {
      haptics.success();
    }, FLIP_DURATION / 2);

    flipProgress.value = withTiming(1, {
      duration: FLIP_DURATION,
      easing: Easing.inOut(Easing.cubic),
    }, (finished) => {
      if (finished) {
        runOnJS(onFlipComplete)();
      }
    });
  }, [recommendation, phase, haptics, flipProgress, onFlipComplete]);

  const handleContinue = useCallback(() => {
    haptics.light();
    onComplete();
  }, [haptics, onComplete]);

  const handleSeenIt = useCallback(() => {
    if (!recommendation) return;

    haptics.medium();
    const comparedMovies = getAllComparedMovies();
    const shouldQuickRank = comparedMovies.length >= 3;

    markMovieAsKnown(recommendation.movieId);
    onComplete();

    if (shouldQuickRank) {
      setTimeout(() => {
        startQuickRank({
          id: recommendation.movieId,
          title: recommendation.title,
          year: recommendation.year,
          posterUrl: recommendation.posterUrl,
        });
      }, 100);
    }
  }, [recommendation, haptics, getAllComparedMovies, markMovieAsKnown, onComplete, startQuickRank]);

  // Front face (gift box) - visible from 0 to 0.5, rotates 0° to 90°
  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 0.5], [0, 90]);
    const opacity = flipProgress.value > 0.5 ? 0 : 1;
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden' as const,
    };
  });

  // Back face (poster) - visible from 0.5 to 1, rotates -90° to 0°
  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0.5, 1], [-90, 0]);
    const opacity = flipProgress.value <= 0.5 ? 0 : 1;
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      opacity,
      backfaceVisibility: 'hidden' as const,
    };
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
    >
      <View style={styles.content}>
        {error ? (
          <View style={styles.centerContainer}>
            <CatMascot pose="sat" size={80} />
            <Text style={styles.errorText}>{error}</Text>
            <CinematicButton
              label="continue"
              variant="primary"
              onPress={handleContinue}
              fullWidth
            />
          </View>
        ) : (
          <View style={styles.centerContainer}>
            <CatMascot pose={isLoading ? 'sat' : 'arms'} size={80} />

            <Text style={styles.title}>
              {phase === 'revealed' ? 'your recommendation' : 'recommendation unlocked'}
            </Text>
            <Text style={[styles.subtitle, phase !== 'mystery' && { opacity: 0 }]}>
              {isLoading ? 'finding your pick...' : 'tap the card to reveal'}
            </Text>

            {/* Flip card container */}
            <Pressable
              onPress={handleReveal}
              disabled={phase !== 'mystery' || isLoading}
              style={styles.cardContainer}
            >
              {/* Front face — gift box */}
              <Animated.View style={[styles.cardFace, styles.giftFace, frontStyle]}>
                <View style={styles.dashedBorder}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <GiftIcon size={48} color={colors.accent} />
                  )}
                </View>
              </Animated.View>

              {/* Back face — movie poster */}
              <Animated.View style={[styles.cardFace, backStyle]}>
                {recommendation?.posterUrl ? (
                  <Image source={{ uri: recommendation.posterUrl }} style={styles.poster} />
                ) : (
                  <View style={[styles.poster, styles.posterPlaceholder]}>
                    <Text style={styles.posterInitials}>
                      {recommendation?.title.slice(0, 2)}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </Pressable>

            {/* Movie info — reserve space to prevent layout shift */}
            <View style={styles.movieInfoSlot}>
              {phase === 'revealed' && recommendation && (
                <Animated.View
                  entering={FadeInDown.delay(150).duration(300)}
                  style={styles.movieInfo}
                >
                  <Text style={styles.movieTitle}>{recommendation.title}</Text>
                  <Text style={styles.movieMeta}>{recommendation.year}</Text>
                </Animated.View>
              )}
            </View>

            {/* Actions — always reserve height for 2 buttons to prevent shift */}
            {phase === 'revealed' ? (
              <Animated.View
                entering={FadeInDown.delay(300).duration(300)}
                style={styles.actions}
              >
                <CinematicButton
                  label="seen it"
                  variant="secondary"
                  onPress={handleSeenIt}
                  fullWidth
                />
                <CinematicButton
                  label="continue"
                  variant="ghost"
                  onPress={handleContinue}
                  fullWidth
                />
              </Animated.View>
            ) : (
              <View style={styles.actions}>
                {/* Invisible button matching exact height of "seen it" */}
                <View style={styles.buttonSpacer} pointerEvents="none">
                  <CinematicButton
                    label="seen it"
                    variant="secondary"
                    onPress={() => {}}
                    fullWidth
                  />
                </View>
                <CinematicButton
                  label="keep comparing"
                  variant="ghost"
                  onPress={handleContinue}
                  fullWidth
                />
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  centerContainer: {
    alignItems: 'center',
    width: '100%',
  },
  buttonSpacer: {
    opacity: 0,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Flip card
  cardContainer: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  cardFace: {
    position: 'absolute',
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: borderRadius.lg,
  },
  giftFace: {
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dashedBorder: {
    width: POSTER_WIDTH - 16,
    height: POSTER_HEIGHT - 16,
    borderRadius: borderRadius.lg - 4,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: borderRadius.lg,
  },
  posterPlaceholder: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterInitials: {
    ...typography.h2,
    color: colors.textMuted,
  },

  // Movie info
  movieInfoSlot: {
    minHeight: 44,
    justifyContent: 'center',
  },
  movieInfo: {
    alignItems: 'center',
  },
  movieTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  movieMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Actions
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
