import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Movie } from '../types';
import { DailyCategory } from '../data/dailyCategories';
import { DailyCollectionEntry } from '../services/dailyStreakService';
import { VsPair } from '../services/vsService';
import { colors } from '../theme/cinematic';
import { CategoryCellEmpty } from './daily/CategoryCellEmpty';

// ============================================
// SHAREABLE TOP 3 (1080x1080 square)
// ============================================

interface ShareableTop3Props {
  movies: Movie[];
}

export function ShareableTop3({ movies }: ShareableTop3Props) {
  const top3 = movies.slice(0, 3);

  return (
    <View style={top3Styles.container}>
      {/* Title */}
      <Text style={top3Styles.title}>my top 3</Text>

      {/* Posters row */}
      <View style={top3Styles.postersRow}>
        {top3.map((movie, index) => (
          <View key={movie.id} style={top3Styles.movieColumn}>
            {/* Poster with badge */}
            <View style={top3Styles.posterWrapper}>
              {movie.posterUrl ? (
                <Image source={{ uri: movie.posterUrl }} style={top3Styles.poster} />
              ) : (
                <View style={[top3Styles.poster, top3Styles.posterFallback]}>
                  <Text style={top3Styles.posterFallbackText}>{movie.title.slice(0, 2)}</Text>
                </View>
              )}
              {/* Rank badge */}
              <View style={[
                top3Styles.rankBadge,
                index === 0 && top3Styles.rankBadgeGold,
                index === 1 && top3Styles.rankBadgeSilver,
                index === 2 && top3Styles.rankBadgeBronze,
              ]}>
                <Text style={top3Styles.rankBadgeText}>#{index + 1}</Text>
              </View>
            </View>
            {/* Movie title */}
            <Text style={top3Styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
            <Text style={top3Styles.movieYear}>{movie.year}</Text>
          </View>
        ))}
      </View>

      {/* Branding */}
      <Text style={top3Styles.branding}>aaybee</Text>
    </View>
  );
}

const top3Styles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1080,
    backgroundColor: '#0D0D0F',
    padding: 80,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 72,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 40,
  },
  postersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 40,
    flex: 1,
    paddingTop: 60,
  },
  movieColumn: {
    alignItems: 'center',
    width: 280,
  },
  posterWrapper: {
    position: 'relative',
    marginBottom: 24,
  },
  poster: {
    width: 260,
    height: 390,
    borderRadius: 16,
  },
  posterFallback: {
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFallbackText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#666',
  },
  rankBadge: {
    position: 'absolute',
    top: -20,
    left: -20,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#0D0D0F',
  },
  rankBadgeGold: {
    backgroundColor: colors.gold,
  },
  rankBadgeSilver: {
    backgroundColor: colors.silver,
  },
  rankBadgeBronze: {
    backgroundColor: colors.bronze,
  },
  rankBadgeText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0D0D0F',
  },
  movieTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  movieYear: {
    fontSize: 22,
    color: '#888888',
    textAlign: 'center',
  },
  branding: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 40,
  },
});

// ============================================
// SHAREABLE AAYBEE CLASSIC (1080x1080 square, 3x3 grid)
// ============================================

interface ShareableClassicProps {
  movies: Movie[];
}

export function ShareableClassic({ movies }: ShareableClassicProps) {
  const top9 = movies.slice(0, 9);

  return (
    <View style={classicStyles.container}>
      {/* Title */}
      <Text style={classicStyles.title}>my aaybee classic</Text>

      {/* 3x3 poster grid */}
      <View style={classicStyles.grid}>
        {top9.map((movie, index) => {
          const rank = index + 1;
          const isTopThree = rank <= 3;

          return (
            <View key={movie.id} style={classicStyles.cell}>
              {movie.posterUrl ? (
                <Image source={{ uri: movie.posterUrl }} style={classicStyles.poster} />
              ) : (
                <View style={[classicStyles.poster, classicStyles.posterFallback]}>
                  <Text style={classicStyles.posterFallbackText}>{movie.title.slice(0, 2)}</Text>
                </View>
              )}
              {/* Rank badge */}
              <View style={[
                classicStyles.rankBadge,
                isTopThree && (
                  rank === 1 ? classicStyles.rankBadgeGold
                  : rank === 2 ? classicStyles.rankBadgeSilver
                  : classicStyles.rankBadgeBronze
                ),
              ]}>
                <Text style={[
                  classicStyles.rankText,
                  isTopThree && classicStyles.rankTextTop,
                ]}>#{rank}</Text>
              </View>
              {/* Movie title */}
              <View style={classicStyles.titleBar}>
                <Text style={classicStyles.movieTitle} numberOfLines={1}>{movie.title}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Branding */}
      <Text style={classicStyles.branding}>aaybee</Text>
    </View>
  );
}

const CLASSIC_CELL = 300;
const CLASSIC_GAP = 20;

const classicStyles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1080,
    backgroundColor: '#0D0D0F',
    padding: 60,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 56,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 10,
  },
  grid: {
    width: 3 * CLASSIC_CELL + 2 * CLASSIC_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CLASSIC_GAP,
  },
  cell: {
    width: CLASSIC_CELL,
    height: CLASSIC_CELL * 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  posterFallback: {
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFallbackText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#666',
  },
  rankBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0D0D0F',
  },
  rankBadgeGold: {
    backgroundColor: colors.gold,
  },
  rankBadgeSilver: {
    backgroundColor: colors.silver,
  },
  rankBadgeBronze: {
    backgroundColor: colors.bronze,
  },
  rankText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  rankTextTop: {
    color: '#0D0D0F',
  },
  titleBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  movieTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  branding: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 10,
  },
});

// ============================================
// SHAREABLE COLLECTIONS GRID (1080x1080 square)
// ============================================

interface ShareableCollectionsGridProps {
  categories: DailyCategory[];
  collections: DailyCollectionEntry[];
  movies: Map<string, Movie>;
}

export function ShareableCollectionsGrid({
  categories,
  collections,
  movies,
}: ShareableCollectionsGridProps) {
  // Build map: categoryId -> latest collection entry
  const collectionMap = new Map<string, DailyCollectionEntry>();
  for (const entry of collections) {
    const existing = collectionMap.get(entry.categoryId);
    if (!existing || entry.dailyNumber > existing.dailyNumber) {
      collectionMap.set(entry.categoryId, entry);
    }
  }

  const filledCount = collectionMap.size;
  const columns = filledCount <= 9 ? 3 : filledCount <= 16 ? 4 : 5;
  const cellSize = Math.floor((1080 - 120 - (columns - 1) * 12) / columns);

  return (
    <View style={gridStyles.container}>
      <Text style={gridStyles.title}>my aaybee collection</Text>
      <Text style={gridStyles.subtitle}>{filledCount} / {categories.length}</Text>

      <View style={gridStyles.grid}>
        {categories.map((category) => {
          const entry = collectionMap.get(category.id);
          const championMovie = entry ? movies.get(entry.championId) : null;

          return (
            <View
              key={category.id}
              style={[gridStyles.cell, { width: cellSize, height: cellSize * 1.5 }]}
            >
              {championMovie?.posterUrl ? (
                <View style={gridStyles.filledCell}>
                  <Image
                    source={{ uri: championMovie.posterUrl }}
                    style={gridStyles.poster}
                  />
                </View>
              ) : (
                <CategoryCellEmpty category={category} movies={movies} cellSize={cellSize} />
              )}
            </View>
          );
        })}
      </View>

      <Text style={gridStyles.branding}>aaybee</Text>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1080,
    backgroundColor: '#0D0D0F',
    padding: 60,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 56,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 28,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    flex: 1,
  },
  cell: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  filledCell: {
    flex: 1,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  branding: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 20,
  },
});

// ============================================
// SHAREABLE VS RESULT CARD (1080x1080)
// ============================================

interface ShareableVsResultProps {
  score: number;
  scoreLabel: string;
  challengerName: string;
  challengedName: string;
  pairs: VsPair[];
}

export function ShareableVsResult({ score, scoreLabel, challengerName, challengedName, pairs }: ShareableVsResultProps) {
  return (
    <View style={vsStyles.container}>
      <Text style={vsStyles.title}>aaybee vs</Text>

      <View style={vsStyles.scoreContainer}>
        <Text style={vsStyles.scoreNumber}>{score}</Text>
        <Text style={vsStyles.scoreOf}>/10</Text>
      </View>
      <Text style={vsStyles.scoreLabel}>{scoreLabel}</Text>

      <Text style={vsStyles.names}>{challengerName} vs {challengedName}</Text>

      <View style={vsStyles.pairGrid}>
        {pairs.slice(0, 10).map((pair, i) => (
          <View key={i} style={[vsStyles.pairRow, pair.match ? vsStyles.pairMatch : vsStyles.pairMiss]}>
            <Text style={vsStyles.pairIndex}>{i + 1}</Text>
            <Text style={vsStyles.pairMovie} numberOfLines={1}>{pair.movieA.title}</Text>
            <Text style={vsStyles.pairVs}>vs</Text>
            <Text style={vsStyles.pairMovie} numberOfLines={1}>{pair.movieB.title}</Text>
            <Text style={[vsStyles.pairResult, pair.match ? vsStyles.pairResultMatch : vsStyles.pairResultMiss]}>
              {pair.match ? '✓' : '✗'}
            </Text>
          </View>
        ))}
      </View>

      <Text style={vsStyles.branding}>aaybee</Text>
    </View>
  );
}

const vsStyles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1080,
    backgroundColor: '#0D0D0F',
    padding: 60,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: '#888888',
    textAlign: 'center',
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 6,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreNumber: {
    fontSize: 180,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scoreOf: {
    fontSize: 60,
    fontWeight: '600',
    color: '#888888',
  },
  scoreLabel: {
    fontSize: 36,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginTop: -10,
  },
  names: {
    fontSize: 28,
    color: '#AAAAAA',
    textAlign: 'center',
    marginTop: 10,
  },
  pairGrid: {
    width: '100%',
    gap: 6,
    marginTop: 20,
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pairMatch: {
    backgroundColor: 'rgba(72, 187, 120, 0.1)',
  },
  pairMiss: {
    backgroundColor: 'rgba(245, 101, 101, 0.08)',
  },
  pairIndex: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666666',
    width: 36,
  },
  pairMovie: {
    fontSize: 22,
    color: '#DDDDDD',
    flex: 1,
  },
  pairVs: {
    fontSize: 18,
    color: '#555555',
    marginHorizontal: 12,
  },
  pairResult: {
    fontSize: 24,
    fontWeight: '700',
    width: 36,
    textAlign: 'center',
  },
  pairResultMatch: {
    color: '#48BB78',
  },
  pairResultMiss: {
    color: '#F56565',
  },
  branding: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 10,
  },
});

// ============================================
// SHAREABLE CHALLENGE RESULT CARD (1080x1080)
// ============================================

interface ShareableChallengeResultProps {
  matchPercent: number;
  tierName: string;
  tierSubtitle: string;
  creatorName: string;
  challengerName: string;
  agreements: { rank: number; title: string }[];
  disagreements: { title: string; creatorRank: number; challengerRank: number }[];
}

export function ShareableChallengeResult({
  matchPercent, tierName, tierSubtitle,
  creatorName, challengerName,
  agreements, disagreements,
}: ShareableChallengeResultProps) {
  return (
    <View style={challengeStyles.container}>
      <Text style={challengeStyles.header}>aaybee challenge</Text>

      <Text style={challengeStyles.percent}>{matchPercent}%</Text>
      <Text style={challengeStyles.tierName}>{tierName}</Text>
      <Text style={challengeStyles.tierSubtitle}>"{tierSubtitle}"</Text>
      <Text style={challengeStyles.names}>{creatorName} & {challengerName}</Text>

      {agreements.length > 0 && (
        <View style={challengeStyles.section}>
          <Text style={challengeStyles.sectionTitle}>agreed on</Text>
          {agreements.slice(0, 4).map((a, i) => (
            <Text key={i} style={challengeStyles.agreementRow}>#{a.rank} {a.title}</Text>
          ))}
        </View>
      )}

      {disagreements.length > 0 && (
        <View style={challengeStyles.section}>
          <Text style={challengeStyles.sectionTitle}>biggest disagreements</Text>
          {disagreements.slice(0, 4).map((d, i) => (
            <View key={i} style={challengeStyles.disagreementRow}>
              <Text style={challengeStyles.disagreementMovie} numberOfLines={1}>{d.title}</Text>
              <Text style={challengeStyles.disagreementRanks}>#{d.creatorRank} vs #{d.challengerRank}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={challengeStyles.branding}>aaybee</Text>
    </View>
  );
}

const challengeStyles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1080,
    backgroundColor: '#0D0D0F',
    padding: 60,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    fontSize: 40,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 6,
    marginTop: 10,
  },
  percent: {
    fontSize: 200,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: -20,
  },
  tierName: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.accent,
    textAlign: 'center',
    marginTop: -20,
  },
  tierSubtitle: {
    fontSize: 26,
    fontStyle: 'italic',
    color: '#AAAAAA',
    textAlign: 'center',
    marginTop: 8,
  },
  names: {
    fontSize: 28,
    color: '#888888',
    textAlign: 'center',
    marginTop: 12,
  },
  section: {
    width: '100%',
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginBottom: 10,
  },
  agreementRow: {
    fontSize: 26,
    color: '#CCCCCC',
    paddingVertical: 4,
  },
  disagreementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  disagreementMovie: {
    fontSize: 26,
    color: '#CCCCCC',
    flex: 1,
  },
  disagreementRanks: {
    fontSize: 24,
    color: '#F56565',
    fontWeight: '600',
  },
  branding: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 10,
  },
});
