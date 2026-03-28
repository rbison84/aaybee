import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Movie } from '../../types';
import { getStatusEmoji } from '../../utils/statusManager';
import { colors } from '../../theme/cinematic';

interface RankingItemProps {
  movie: Movie;
  rank: number;
  onPress: () => void;
  onLongPress: () => void;
}

// Medal colors for top 3
const MEDAL_COLORS = {
  1: { bg: colors.gold, text: colors.background, emoji: '🥇' },
  2: { bg: colors.silver, text: colors.background, emoji: '🥈' },
  3: { bg: colors.bronze, text: colors.textPrimary, emoji: '🥉' },
};

export function RankingItem({ movie, rank, onPress, onLongPress }: RankingItemProps) {
  const scale = useSharedValue(1);
  const [imageError, setImageError] = useState(false);

  const isTopThree = rank <= 3;
  const isTopTen = rank <= 10;
  const medalConfig = MEDAL_COLORS[rank as 1 | 2 | 3];

  // Calculate win percentage
  const totalGames = movie.totalWins + movie.totalLosses;
  const winPercentage = totalGames > 0
    ? Math.round((movie.totalWins / totalGames) * 100)
    : 0;

  // Render stars based on beta (0-5 stars for -4 to +4 beta range)
  const starCount = Math.max(0, Math.min(5, Math.round((movie.beta + 4) / 1.6)));
  const stars = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
    >
      <Animated.View
        style={[
          styles.container,
          isTopTen && styles.topTenContainer,
          isTopThree && styles.topThreeContainer,
          animatedStyle,
        ]}
      >
        {/* Rank Badge */}
        <View
          style={[
            styles.rankBadge,
            isTopThree && medalConfig && { backgroundColor: medalConfig.bg },
          ]}
        >
          {isTopThree ? (
            <Text style={styles.medalEmoji}>{medalConfig?.emoji}</Text>
          ) : (
            <Text style={[styles.rankText, isTopTen && styles.topTenRankText]}>
              #{rank}
            </Text>
          )}
        </View>

        {/* Movie Poster */}
        <View style={[styles.poster, { backgroundColor: movie.posterColor }]}>
          {movie.posterUrl && !imageError ? (
            <Image
              source={{ uri: movie.posterUrl }}
              style={styles.posterImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <Text style={styles.posterEmoji}>{movie.emoji || '🎬'}</Text>
          )}
        </View>

        {/* Movie Info */}
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {movie.title}
            </Text>
            <Text style={styles.statusBadge}>{getStatusEmoji(movie.status)}</Text>
          </View>

          <Text style={styles.meta}>
            {movie.year} • {movie.genres.slice(0, 2).join(', ')}
          </Text>

          <View style={styles.statsRow}>
            <Text style={[styles.stars, isTopThree && styles.topThreeStars]}>
              {stars}
            </Text>
            <Text style={styles.record}>
              {movie.totalWins}W - {movie.totalLosses}L
              {totalGames > 0 && (
                <Text style={styles.percentage}> ({winPercentage}%)</Text>
              )}
            </Text>
          </View>
        </View>

        {/* Beta Score (Debug/Power Users) */}
        <View style={styles.betaContainer}>
          <Text style={styles.betaValue}>
            {movie.beta >= 0 ? '+' : ''}{movie.beta.toFixed(2)}
          </Text>
          <Text style={styles.betaLabel}>β</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  topTenContainer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  topThreeContainer: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
  },

  // Rank Badge
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  topTenRankText: {
    color: '#fff',
    fontWeight: '700',
  },
  medalEmoji: {
    fontSize: 20,
  },

  // Poster
  poster: {
    width: 48,
    height: 72,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterEmoji: {
    fontSize: 24,
  },

  // Info
  info: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  statusBadge: {
    fontSize: 10,
  },
  meta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stars: {
    fontSize: 11,
    color: '#fbbf24',
    letterSpacing: 1,
  },
  topThreeStars: {
    fontSize: 12,
  },
  record: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  percentage: {
    color: '#4ade80',
  },

  // Beta
  betaContainer: {
    alignItems: 'center',
    marginLeft: 8,
  },
  betaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  betaLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
  },
});
