import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, Image, ScrollView } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAppStore } from '../../store/useAppStore';
import { useHaptics } from '../../hooks/useHaptics';
import { CatMascot } from '../onboarding/CatMascot';
import { CinematicButton } from '../cinematic';
import { Movie } from '../../types';
import { colors, borderRadius, typography, spacing } from '../../theme/cinematic';

const THUMB_WIDTH = 40;
const THUMB_HEIGHT = 60;
const MAX_GRID_THUMBS = 30;

// Top 25: 5x5 fixed grid
const TOP25_PER_ROW = 5;
const TOP25_GAP = 4;
const TOP25_GRID_WIDTH = TOP25_PER_ROW * THUMB_WIDTH + (TOP25_PER_ROW - 1) * TOP25_GAP;
const TOP25_GRID_HEIGHT = 5 * THUMB_HEIGHT + 4 * TOP25_GAP;

// Classic: 3x3 flip grid
const CLASSIC_CELL_WIDTH = 80;
const CLASSIC_CELL_HEIGHT = 120;
const CLASSIC_GAP = 8;
const CLASSIC_GRID_SIZE = 3 * CLASSIC_CELL_WIDTH + 2 * CLASSIC_GAP;

type RevealType = 'classic' | 'top25' | 'all';
type RevealPhase = 'building' | 'done';

// ============================================
// FLIP CARD SUB-COMPONENT
// ============================================

function FlipCard({ movie, rank, flipped }: { movie: Movie; rank: number; flipped: boolean }) {
  const flipProgress = useSharedValue(0);

  useEffect(() => {
    if (flipped) {
      flipProgress.value = withTiming(1, { duration: 500 });
    } else {
      flipProgress.value = 0;
    }
  }, [flipped]);

  const frontStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [-180, 0]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [0, 0, 1, 1]);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const opacity = interpolate(flipProgress.value, [0, 0.5, 0.5, 1], [1, 1, 0, 0]);
    return {
      transform: [{ perspective: 800 }, { rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  const isTopThree = rank <= 3;

  return (
    <View style={styles.classicCell}>
      {/* Back face */}
      <Animated.View style={[styles.cardBack, backStyle]}>
        <Text style={styles.cardBackText}>?</Text>
      </Animated.View>
      {/* Front face */}
      <Animated.View style={[styles.cardFront, frontStyle]}>
        {movie.posterUrl ? (
          <Image source={{ uri: movie.posterUrl }} style={styles.classicPoster} />
        ) : (
          <View style={styles.classicPosterFallback}>
            <Text style={styles.classicPosterFallbackText}>{movie.title.slice(0, 2)}</Text>
          </View>
        )}
        <View style={[
          styles.classicBadge,
          isTopThree && (
            rank === 1 ? styles.classicBadgeGold
            : rank === 2 ? styles.classicBadgeSilver
            : styles.classicBadgeBronze
          ),
        ]}>
          <Text style={[
            styles.classicBadgeText,
            isTopThree && styles.classicBadgeTextTop,
          ]}>#{rank}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ============================================
// MAIN OVERLAY
// ============================================

interface RankingRevealOverlayProps {
  visible: boolean;
  type: RevealType;
  onComplete: () => void;
  onDismiss: () => void;
}

export function RankingRevealOverlay({ visible, type, onComplete, onDismiss }: RankingRevealOverlayProps) {
  const { getRankedMovies } = useAppStore();
  const haptics = useHaptics();

  const [phase, setPhase] = useState<RevealPhase>('building');
  const [revealedCount, setRevealedCount] = useState(0);
  const [animatedCount, setAnimatedCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gridScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gridScrollRef = useRef<ScrollView>(null);

  const rankedMovies = useMemo(() => getRankedMovies(), [visible, getRankedMovies]);

  // Classic: top 9 movies
  const classicMovies = useMemo(() => rankedMovies.slice(0, 9), [rankedMovies]);

  // Top 25: all 25 movies as poster grid
  const top25GridMovies = useMemo(() => rankedMovies.slice(0, 25), [rankedMovies]);

  const totalCount = rankedMovies.length;

  // Reset state when overlay becomes visible
  useEffect(() => {
    if (!visible) {
      setPhase('building');
      setRevealedCount(0);
      setAnimatedCount(0);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countTimerRef.current) clearInterval(countTimerRef.current);
      if (gridScrollTimerRef.current) clearInterval(gridScrollTimerRef.current);
      return;
    }

    if (type === 'all') {
      const gridTotal = Math.min(totalCount, MAX_GRID_THUMBS);
      const pacing = 120;
      let i = 0;
      const advance = () => {
        if (i >= gridTotal) {
          setAnimatedCount(totalCount);
          haptics.success();
          timerRef.current = setTimeout(() => setPhase('done'), 800);
          return;
        }
        i++;
        setRevealedCount(i);
        setAnimatedCount(Math.round((i / gridTotal) * totalCount));
        timerRef.current = setTimeout(advance, pacing);
      };
      timerRef.current = setTimeout(advance, 400);
    } else if (type === 'classic') {
      // Flip cards from #9 -> #1, 500ms per flip
      startBuilding(classicMovies.length, 500);
    } else if (type === 'top25') {
      startBuilding(top25GridMovies.length, 150);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countTimerRef.current) clearInterval(countTimerRef.current);
      if (gridScrollTimerRef.current) clearInterval(gridScrollTimerRef.current);
    };
  }, [visible]);

  const startBuilding = useCallback((count: number, pacing: number) => {
    let i = 0;
    const advance = () => {
      if (i >= count) {
        haptics.success();
        timerRef.current = setTimeout(() => setPhase('done'), 600);
        return;
      }
      i++;
      setRevealedCount(i);
      if (i === count) {
        haptics.medium(); // final item gets stronger haptic
      } else {
        haptics.light();
      }
      timerRef.current = setTimeout(advance, pacing);
    };
    timerRef.current = setTimeout(advance, 400);
  }, [haptics]);

  const handleSkip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countTimerRef.current) clearInterval(countTimerRef.current);
    if (gridScrollTimerRef.current) clearInterval(gridScrollTimerRef.current);

    if (type === 'all') {
      setRevealedCount(Math.min(totalCount, MAX_GRID_THUMBS));
      setAnimatedCount(totalCount);
    } else if (type === 'classic') {
      setRevealedCount(classicMovies.length);
    } else if (type === 'top25') {
      setRevealedCount(top25GridMovies.length);
    }

    haptics.success();
    timerRef.current = setTimeout(() => setPhase('done'), 400);
  }, [type, classicMovies.length, top25GridMovies.length, totalCount, haptics]);

  const handleComplete = useCallback(() => {
    haptics.medium();
    onComplete();
  }, [haptics, onComplete]);

  const handleDismiss = useCallback(() => {
    haptics.light();
    onDismiss();
  }, [haptics, onDismiss]);

  // Auto-scroll for all-mode grid
  useEffect(() => {
    if (revealedCount > 0 && type === 'all' && gridScrollRef.current) {
      setTimeout(() => gridScrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [revealedCount, type]);

  if (!visible) return null;

  const getActionLabel = () => {
    if (type === 'classic') return 'view your classic';
    if (type === 'top25') return 'view your top 25';
    return 'explore your full ranking';
  };

  const gridMovies = type === 'all' ? rankedMovies.slice(0, Math.min(revealedCount, MAX_GRID_THUMBS)) : [];

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
    >
      <View style={styles.content}>
        <View style={styles.centerContainer}>
          {/* Cat mascot */}
          <CatMascot
            pose={phase === 'done' ? 'arms' : 'sat'}
            size={80}
          />

          {/* Title */}
          <Text style={styles.title}>
            {type === 'all'
              ? 'full rankings unlocked'
              : type === 'top25'
                ? 'top 25 unlocked'
                : 'aaybee classic unlocked'}
          </Text>

          {type === 'classic' ? (
            // === CLASSIC: 3x3 flip card grid, reveals #9 -> #1 ===
            <View style={styles.classicGrid}>
              {Array.from({ length: 9 }, (_, i) => {
                const movie = classicMovies[i];
                if (!movie) return <View key={i} style={styles.classicCell} />;
                const rank = i + 1;
                // Flip order: #9 first, #1 last
                // Position i flips when revealedCount >= 9 - i
                const flipped = revealedCount >= 9 - i;
                return (
                  <FlipCard
                    key={movie.id}
                    movie={movie}
                    rank={rank}
                    flipped={flipped}
                  />
                );
              })}
            </View>
          ) : type === 'top25' ? (
            // === TOP 25: Fixed 5x5 poster grid ===
            <>
              <Text style={styles.top25Subtitle}>your ranking is taking shape</Text>
              <View style={styles.top25Grid}>
                {Array.from({ length: 25 }, (_, i) => {
                  const movie = top25GridMovies[i];
                  const isRevealed = i < revealedCount && movie;
                  return (
                    <View key={i} style={styles.top25Slot}>
                      {isRevealed ? (
                        <Animated.View entering={FadeIn.duration(300)} style={styles.top25SlotInner}>
                          {movie.posterUrl ? (
                            <Image source={{ uri: movie.posterUrl }} style={styles.top25SlotImage} />
                          ) : (
                            <View style={styles.gridThumbFallback}>
                              <Text style={styles.gridThumbText}>{movie.title.slice(0, 1)}</Text>
                            </View>
                          )}
                        </Animated.View>
                      ) : (
                        <View style={styles.top25SlotEmpty} />
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={styles.top25Caption}>
                {revealedCount < 25 ? `${revealedCount}/25` : 'all 25 revealed'}
              </Text>
            </>
          ) : (
            // === ALL: Count ticker + scrolling poster grid ===
            <>
              <Animated.View
                style={styles.countContainer}
                entering={FadeInDown.duration(400)}
              >
                <Text style={styles.countNumber}>{animatedCount}</Text>
                <Text style={styles.countLabel}>movies ranked</Text>
              </Animated.View>

              <View style={styles.allGridWindow}>
                <ScrollView
                  ref={gridScrollRef}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.gridContainer}>
                    {gridMovies.map((movie) => (
                      <Animated.View
                        key={movie.id}
                        entering={FadeIn.duration(200)}
                        style={styles.gridThumb}
                      >
                        {movie.posterUrl ? (
                          <Image source={{ uri: movie.posterUrl }} style={styles.gridThumbImage} />
                        ) : (
                          <View style={styles.gridThumbFallback}>
                            <Text style={styles.gridThumbText}>{movie.title.slice(0, 1)}</Text>
                          </View>
                        )}
                      </Animated.View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          )}

          {/* Actions */}
          {phase === 'done' ? (
            <Animated.View
              entering={FadeInDown.delay(200).duration(300)}
              style={styles.actions}
            >
              <CinematicButton
                label={getActionLabel()}
                variant="primary"
                onPress={handleComplete}
                fullWidth
              />
              <CinematicButton
                label="continue"
                variant="primary"
                onPress={handleDismiss}
                fullWidth
              />
            </Animated.View>
          ) : (
            <View style={styles.actions}>
              {/* Invisible spacer to prevent layout shift */}
              <View style={styles.buttonSpacer} pointerEvents="none">
                <CinematicButton
                  label={getActionLabel()}
                  variant="primary"
                  onPress={() => {}}
                  fullWidth
                />
              </View>
              <CinematicButton
                label="skip"
                variant="ghost"
                onPress={handleSkip}
                fullWidth
              />
            </View>
          )}
        </View>
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
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  centerContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  // === Classic 3x3 flip grid ===
  classicGrid: {
    width: CLASSIC_GRID_SIZE,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CLASSIC_GAP,
    marginTop: spacing.lg,
  },
  classicCell: {
    width: CLASSIC_CELL_WIDTH,
    height: CLASSIC_CELL_HEIGHT,
    borderRadius: borderRadius.md,
  },
  cardBack: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBackText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  cardFront: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  classicPoster: {
    width: '100%',
    height: '100%',
  },
  classicPosterFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classicPosterFallbackText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  classicBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  classicBadgeGold: {
    backgroundColor: colors.gold,
  },
  classicBadgeSilver: {
    backgroundColor: colors.silver,
  },
  classicBadgeBronze: {
    backgroundColor: colors.bronze,
  },
  classicBadgeText: {
    ...typography.tiny,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  classicBadgeTextTop: {
    color: colors.background,
  },

  // === Count ticker (all mode) ===
  countContainer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  countNumber: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -2,
    lineHeight: 72,
  },
  countLabel: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // === All mode — scrolling grid window ===
  allGridWindow: {
    maxHeight: 260,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },

  // === Top 25: Fixed 5x5 grid ===
  top25Subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  top25Grid: {
    width: TOP25_GRID_WIDTH,
    height: TOP25_GRID_HEIGHT,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TOP25_GAP,
  },
  top25Slot: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  top25SlotInner: {
    width: '100%',
    height: '100%',
  },
  top25SlotImage: {
    width: '100%',
    height: '100%',
  },
  top25SlotEmpty: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    opacity: 0.3,
  },
  top25Caption: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // === Poster grid (all mode) ===
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  gridThumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  gridThumbImage: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
  },
  gridThumbFallback: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridThumbText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
  },

  // === Actions ===
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  buttonSpacer: {
    opacity: 0,
  },
});
