import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Image,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  FadeInDown,
} from 'react-native-reanimated';
import { useQuickRank } from '../contexts/QuickRankContext';
import { useAppStore } from '../store/useAppStore';
import { useHaptics } from '../hooks/useHaptics';
import { openLetterboxd } from '../utils/letterboxd';
import { Movie } from '../types';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { useAppDimensions } from '../contexts/DimensionsContext';

const TOTAL_COMPARISONS = 5;

type ComparisonResult = 'win' | 'loss';

/**
 * Binary search opponent selection
 * Finds the optimal opponent to narrow down the target movie's position
 */
function selectBinarySearchOpponent(
  rankedMovies: Movie[],
  results: ComparisonResult[],
  targetMovieId: string,
): Movie | null {
  if (rankedMovies.length === 0) return null;

  // Filter out the target movie from opponents
  const opponents = rankedMovies.filter(m => m.id !== targetMovieId);
  if (opponents.length === 0) return null;

  // Binary search based on previous results
  let low = 0;
  let high = opponents.length - 1;

  for (const result of results) {
    if (low >= high) break;
    const mid = Math.floor((low + high) / 2);
    if (result === 'win') {
      high = mid; // Target is better, search upper half
    } else {
      low = mid + 1; // Target is worse, search lower half
    }
  }

  // Return movie at current search midpoint
  const midpoint = Math.floor((low + high) / 2);
  return opponents[Math.min(midpoint, opponents.length - 1)];
}


// Hardcoded label colors to preserve across themes
const LABEL_COLOR_A = '#E5A84B'; // Orange/amber
const LABEL_COLOR_B = '#4ABFED'; // Blue

interface MovieCardProps {
  movie: {
    id: string;
    title: string;
    year: number;
    posterUrl: string | null;
  };
  onPress: () => void;
  label: string;
  delay?: number;
  cardWidth: number;
  cardHeight: number;
}

function MovieCard({ movie, onPress, label, delay = 0, cardWidth, cardHeight }: MovieCardProps) {
  const labelColor = label === 'A' ? LABEL_COLOR_A : LABEL_COLOR_B;

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { width: cardWidth },
          pressed && styles.cardPressed,
        ]}
        onPress={onPress}
      >
        {movie.posterUrl ? (
          <Image source={{ uri: movie.posterUrl }} style={[styles.poster, { height: cardHeight }]} />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder, { height: cardHeight }]}>
            <Text style={styles.posterText}>{movie.title.slice(0, 2)}</Text>
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{movie.title}</Text>
          <Text style={styles.cardYear}>{movie.year}</Text>
        </View>

        <View style={[styles.labelBadge, { backgroundColor: labelColor }]}>
          <Text style={styles.labelBadgeText}>{label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const progress = current / total;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>{current} of {total}</Text>
    </View>
  );
}

export function QuickRankModal() {
  const { isVisible, movie, closeQuickRank, onComplete } = useQuickRank();
  const { movies, recordComparison, getRankedMovies, getAllComparedMovies } = useAppStore();
  const haptics = useHaptics();
  const { containerWidth } = useAppDimensions();
  const cardWidth = (containerWidth - spacing.lg * 3) / 2;
  const cardHeight = cardWidth * 1.5;

  // State
  const [phase, setPhase] = useState<'intro' | 'comparing' | 'result'>('intro');
  const [comparisonIndex, setComparisonIndex] = useState(0);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [opponents, setOpponents] = useState<Movie[]>([]);
  const [currentOpponent, setCurrentOpponent] = useState<Movie | null>(null);
  const [finalRank, setFinalRank] = useState<number | null>(null);
  const [resultContext, setResultContext] = useState<{ above: Movie | null; below: Movie | null } | null>(null);

  // Track when we're waiting for the store to update with final comparisons
  const [waitingForResult, setWaitingForResult] = useState(false);
  const [initialComparisons, setInitialComparisons] = useState(0);


  // Get the target movie from store (to have full data)
  const targetMovie = useMemo(() => {
    if (!movie) return null;
    return movies.get(movie.id) || {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      posterUrl: movie.posterUrl || '',
      posterColor: '#1A1A1E',
      genres: [],
      beta: 0,
      totalWins: 0,
      totalLosses: 0,
      totalComparisons: 0,
      timesShown: 0,
      lastShownAt: 0,
      status: 'known' as const,
    };
  }, [movie, movies]);

  // Check if movie is already ranked (2+ comparisons)
  const existingRank = useMemo(() => {
    if (!movie) return null;
    const storeMovie = movies.get(movie.id);
    if (!storeMovie || storeMovie.totalComparisons < 2) return null;
    const ranked = getRankedMovies();
    const index = ranked.findIndex(m => m.id === movie.id);
    if (index < 0) return null;
    const above = index > 0 ? ranked[index - 1] : null;
    const below = index < ranked.length - 1 ? ranked[index + 1] : null;
    return { rank: index + 1, above, below };
  }, [movie, movies, getRankedMovies]);

  // Reset state when modal opens
  useEffect(() => {
    if (isVisible && movie) {
      setPhase('intro');
      setComparisonIndex(0);
      setResults([]);
      setOpponents([]);
      setCurrentOpponent(null);
      setFinalRank(null);
      setResultContext(null);
      setWaitingForResult(false);
      setInitialComparisons(0);
    }
  }, [isVisible, movie?.id]);

  // Select next opponent when starting or after a comparison
  useEffect(() => {
    // Don't select new opponent if we're waiting for the final result
    if (phase === 'comparing' && comparisonIndex < TOTAL_COMPARISONS && movie && !waitingForResult) {
      const currentCompared = getAllComparedMovies();
      const opponent = selectBinarySearchOpponent(currentCompared, results, movie.id);
      setCurrentOpponent(opponent);
    }
  }, [phase, comparisonIndex, getAllComparedMovies, results, movie?.id, waitingForResult]);

  // Watch for store updates when waiting for final result
  // This reliably detects when all comparisons have been recorded
  useEffect(() => {
    if (!waitingForResult || !movie) return;

    const currentMovie = movies.get(movie.id);
    if (!currentMovie) return;

    // Check if movie has completed all comparisons (initial + 5)
    const expectedTotal = initialComparisons + TOTAL_COMPARISONS;
    if (currentMovie.totalComparisons >= expectedTotal) {
      // State has been updated - now calculate the rank
      const rankedMovies = getRankedMovies();
      const movieIndex = rankedMovies.findIndex(m => m.id === movie.id);
      const actualRank = movieIndex >= 0 ? movieIndex + 1 : rankedMovies.length + 1;

      // Get context (movies above and below)
      const above = actualRank > 1 ? rankedMovies[actualRank - 2] : null;
      const below = actualRank <= rankedMovies.length ? rankedMovies[actualRank] : null;

      setFinalRank(actualRank);
      setResultContext({ above, below });
      setWaitingForResult(false);
      setPhase('result');
    }
  }, [movies, waitingForResult, initialComparisons, movie, getRankedMovies]);

  const handleStart = useCallback(() => {
    haptics.light();

    // Check if user has enough compared movies
    const currentCompared = getAllComparedMovies();
    if (currentCompared.length < 2) {
      // Not enough movies to compare against - go straight to result
      setFinalRank(1);
      setPhase('result');
      return;
    }

    // Capture initial comparison count before we start
    setInitialComparisons(targetMovie?.totalComparisons || 0);
    setPhase('comparing');
  }, [getAllComparedMovies, haptics, targetMovie?.totalComparisons]);

  const handleChoice = useCallback((choseTarget: boolean) => {
    if (!targetMovie || !currentOpponent) return;

    haptics.medium();

    const result: ComparisonResult = choseTarget ? 'win' : 'loss';
    const newResults = [...results, result];
    const newOpponents = [...opponents, currentOpponent];

    setResults(newResults);
    setOpponents(newOpponents);

    // Record the actual comparison
    if (choseTarget) {
      recordComparison(targetMovie.id, currentOpponent.id, false);
    } else {
      recordComparison(currentOpponent.id, targetMovie.id, false);
    }

    const nextIndex = comparisonIndex + 1;

    if (nextIndex >= TOTAL_COMPARISONS) {
      // Set up to wait for store to update, then calculate final rank
      // This is more reliable than setTimeout - we watch for the actual state change
      setWaitingForResult(true);
    } else {
      setComparisonIndex(nextIndex);
    }
  }, [targetMovie, currentOpponent, results, opponents, comparisonIndex, recordComparison, haptics]);

  const handleDone = useCallback(() => {
    haptics.light();
    if (onComplete && finalRank) {
      onComplete(finalRank);
    }
    closeQuickRank();
  }, [closeQuickRank, onComplete, finalRank, haptics]);

  const handleSkip = useCallback(() => {
    haptics.light();
    closeQuickRank();
  }, [closeQuickRank, haptics]);

  const handleLogOnLetterboxd = useCallback(() => {
    if (!movie) return;
    haptics.light();
    openLetterboxd(movie.title, movie.year);
  }, [movie, haptics]);

  if (!isVisible || !movie) return null;

  // Get context string for result display
  const getResultContextString = () => {
    if (!resultContext) return null;

    const { above, below } = resultContext;
    if (above && below) {
      return `Between ${above.title} and ${below.title}`;
    } else if (above) {
      return `Right after ${above.title}`;
    } else if (below) {
      return `Above ${below.title}`;
    }
    return null;
  };

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
    >
      <Animated.View
        style={styles.modal}
        entering={SlideInDown.duration(300)}
        exiting={SlideOutDown.duration(300)}
      >
        {/* INTRO PHASE */}
        {phase === 'intro' && (
          <View style={styles.introContainer}>
            <View style={styles.introPosterContainer}>
              {movie.posterUrl ? (
                <Image source={{ uri: movie.posterUrl }} style={styles.introPoster} />
              ) : (
                <View style={[styles.introPoster, styles.posterPlaceholder]}>
                  <Text style={styles.introPosterText}>{movie.title.slice(0, 2)}</Text>
                </View>
              )}
            </View>

            {existingRank ? (
              <>
                <Text style={styles.introMovieTitle}>{movie.title}</Text>

                <View style={styles.resultRankContainer}>
                  <Text style={styles.resultRank}>#{existingRank.rank}</Text>
                </View>

                {existingRank.above && existingRank.below ? (
                  <Text style={styles.resultContext}>
                    Between {existingRank.above.title} and {existingRank.below.title}
                  </Text>
                ) : existingRank.above ? (
                  <Text style={styles.resultContext}>
                    Right after {existingRank.above.title}
                  </Text>
                ) : existingRank.below ? (
                  <Text style={styles.resultContext}>
                    Above {existingRank.below.title}
                  </Text>
                ) : null}

                <View style={styles.introActions}>
                  <Pressable style={styles.primaryButton} onPress={handleSkip}>
                    <Text style={styles.primaryButtonText}>Done</Text>
                  </Pressable>

                  <Pressable style={styles.letterboxdButton} onPress={handleLogOnLetterboxd}>
                    <Text style={styles.letterboxdButtonText}>Log on Letterboxd</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.introMovieTitle}>{movie.title}</Text>

                <Text style={styles.introSubtitle}>
                  Let's find where it lands in your rankings
                </Text>

                <View style={styles.introActions}>
                  <Pressable style={styles.primaryButton} onPress={handleStart}>
                    <Text style={styles.primaryButtonText}>
                      Rank it now ({TOTAL_COMPARISONS})
                    </Text>
                  </Pressable>

                  <Pressable style={styles.letterboxdButton} onPress={handleLogOnLetterboxd}>
                    <Text style={styles.letterboxdButtonText}>Log on Letterboxd</Text>
                  </Pressable>

                  <Pressable style={styles.skipButton} onPress={handleSkip}>
                    <Text style={styles.skipButtonText}>maybe later</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {/* COMPARING PHASE */}
        {phase === 'comparing' && currentOpponent && (
          <View style={styles.comparingContainer}>
            <View style={styles.comparingHeader}>
              <Text style={styles.comparingTitle}>Ranking {movie.title}</Text>
              <ProgressBar current={comparisonIndex} total={TOTAL_COMPARISONS} />
            </View>

            <Text style={styles.comparingPrompt}>Which do you prefer?</Text>

            <View style={styles.cardsContainer}>
              <MovieCard
                movie={{
                  id: movie.id,
                  title: movie.title,
                  year: movie.year,
                  posterUrl: movie.posterUrl,
                }}
                onPress={() => handleChoice(true)}
                label="A"
                delay={0}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
              />

              <MovieCard
                movie={{
                  id: currentOpponent.id,
                  title: currentOpponent.title,
                  year: currentOpponent.year,
                  posterUrl: currentOpponent.posterUrl || null,
                }}
                onPress={() => handleChoice(false)}
                label="B"
                delay={100}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
              />
            </View>
          </View>
        )}

        {/* RESULT PHASE */}
        {phase === 'result' && finalRank && (
          <View style={styles.resultContainer}>
            <View style={styles.resultPosterContainer}>
              {movie.posterUrl ? (
                <Image source={{ uri: movie.posterUrl }} style={styles.resultPoster} />
              ) : (
                <View style={[styles.resultPoster, styles.posterPlaceholder]}>
                  <Text style={styles.resultPosterText}>{movie.title.slice(0, 2)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.resultLabel}>You ranked</Text>
            <Text style={styles.resultMovieTitle}>{movie.title}</Text>

            <View style={styles.resultRankContainer}>
              <Text style={styles.resultRank}>#{finalRank}</Text>
            </View>

            {getResultContextString() && (
              <Text style={styles.resultContext}>{getResultContextString()}</Text>
            )}

            <View style={styles.resultActions}>
              <Pressable style={styles.primaryButton} onPress={handleDone}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>

              <Pressable style={styles.letterboxdButton} onPress={handleLogOnLetterboxd}>
                <Text style={styles.letterboxdButtonText}>Log on Letterboxd</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    minHeight: '70%',
    maxHeight: '90%',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Intro Phase
  introContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  introPosterContainer: {
    marginBottom: spacing.xl,
  },
  introPoster: {
    width: 140,
    height: 210,
    borderRadius: borderRadius.lg,
  },
  introPosterText: {
    ...typography.h2,
    color: colors.textMuted,
  },
  introTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  introMovieTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  introSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  introActions: {
    width: '100%',
    gap: spacing.md,
  },

  // Comparing Phase
  comparingContainer: {
    flex: 1,
    paddingTop: spacing.md,
  },
  comparingHeader: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  comparingTitle: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  comparingPrompt: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  cardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },

  // Movie Card
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  poster: {
    width: '100%',
  },
  posterPlaceholder: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterText: {
    ...typography.h2,
    color: colors.textMuted,
  },
  cardInfo: {
    padding: spacing.md,
    height: 64, // Fixed height to accommodate 2 lines of title + year
  },
  cardTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    marginBottom: 2,
    lineHeight: 18,
  },
  cardYear: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  labelBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.background,
  },

  // Progress Bar
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '60%',
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  progressText: {
    ...typography.tiny,
    color: colors.textMuted,
  },

  // Result Phase
  resultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  resultPosterContainer: {
    marginBottom: spacing.lg,
  },
  resultPoster: {
    width: 120,
    height: 180,
    borderRadius: borderRadius.lg,
  },
  resultPosterText: {
    ...typography.h2,
    color: colors.textMuted,
  },
  resultLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  resultMovieTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  resultRankContainer: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
  },
  resultRank: {
    ...typography.h1,
    color: colors.background,
    fontWeight: '900',
  },
  resultContext: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    fontStyle: 'italic',
  },
  resultActions: {
    width: '100%',
    gap: spacing.md,
  },

  // Buttons
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  letterboxdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1E2B1E',
  },
  letterboxdButtonText: {
    ...typography.captionMedium,
    color: '#00D735',
    fontWeight: '600',
  },
});
