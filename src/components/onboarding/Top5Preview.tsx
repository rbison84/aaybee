import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme/cinematic';

interface Top5PreviewProps {
  title?: string;
}

const RANK_COLORS = [
  colors.gold,    // #1
  colors.silver,  // #2
  colors.bronze,  // #3
  colors.textMuted, // #4
  colors.textMuted, // #5
];

export function Top5Preview({ title = 'Your Top 5' }: Top5PreviewProps) {
  const { getRankedMovies } = useAppStore();
  const rankedMovies = getRankedMovies().slice(0, 5);

  // Pad with empty slots if needed
  const displayMovies = [...rankedMovies];
  while (displayMovies.length < 5) {
    displayMovies.push(null as any);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.moviesRow}>
        {displayMovies.map((movie, index) => (
          <View key={movie?.id || `empty-${index}`} style={styles.movieItem}>
            <View style={styles.posterContainer}>
              {movie?.posterUrl ? (
                <Image
                  source={{ uri: movie.posterUrl }}
                  style={styles.poster}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.poster, styles.emptyPoster]}>
                  <Text style={styles.emptyText}>?</Text>
                </View>
              )}
              <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[index] }]}>
                <Text style={styles.rankText}>#{index + 1}</Text>
              </View>
            </View>
            {movie && (
              <Text style={styles.movieTitle} numberOfLines={1}>
                {movie.title}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  moviesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  movieItem: {
    alignItems: 'center',
    width: 60,
  },
  posterContainer: {
    position: 'relative',
    ...shadows.sm,
  },
  poster: {
    width: 56,
    height: 84,
    borderRadius: borderRadius.sm,
  },
  emptyPoster: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyText: {
    ...typography.h3,
    color: colors.textMuted,
  },
  rankBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  rankText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.background,
  },
  movieTitle: {
    ...typography.tiny,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
