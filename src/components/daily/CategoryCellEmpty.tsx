import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import Svg, { Path, Circle, Ellipse, Line, Rect } from 'react-native-svg';
import { DailyCategory } from '../../data/dailyCategories';
import { Movie } from '../../types';
import { colors, borderRadius, typography } from '../../theme/cinematic';

interface CategoryCellEmptyProps {
  category: DailyCategory;
  movies: Map<string, Movie>;
  /** Fixed pixel size for shareable images (omit for flex layout) */
  cellSize?: number;
}

const DIRECTOR_IDS = new Set(['tom-hanks', 'spielberg', 'tarantino', 'nolan-vs-villeneuve']);

const DECADE_MAP: Record<string, string> = {
  '90s-action': '1990s',
  '80s-classics': '1980s',
  '2010s-best': '2010s',
  '2020s-best': '2020s',
};

const sw = 1.75;

function CategoryIcon({ categoryId, size, color }: { categoryId: string; size: number; color: string }) {
  switch (categoryId) {
    case 'mind-benders':
      // Brain
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2a7 7 0 0 0-5 2C5 6 5 9 6 11c1 2 1 4 0 6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 2a7 7 0 0 1 5 2c2 2 2 5 1 7-1 2-1 4 0 6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 2v20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M8 8c2 1 4 1 6 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M7 14c2-1 5-1 8 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'pixar':
      // Desk lamp
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M9 21h6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 21v-4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 17l-5-8" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M7 9l3-5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10 4a3 3 0 0 1 5 1l-4 6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M14 8l1 3" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'horror-classics':
      // Skull (reuse GenreIcon horror)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M8 20v-3a8 8 0 0 1 0-12h8a8 8 0 0 1 0 12v3H8z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="9.5" cy="11" r="1.5" stroke={color} strokeWidth={sw} />
          <Circle cx="14.5" cy="11" r="1.5" stroke={color} strokeWidth={sw} />
          <Path d="M10 20v-2M14 20v-2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'scifi-greats':
      // Planet with ring (reuse GenreIcon scifi)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={sw} />
          <Ellipse cx="12" cy="12" rx="11" ry="4" stroke={color} strokeWidth={sw} transform="rotate(-30 12 12)" />
        </Svg>
      );

    case 'animated-classics':
      // Sparkle/star
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M18 14l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
        </Svg>
      );

    case 'superhero-showdown':
      // Lightning bolt
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'crime-and-gangster':
      // Gun/pistol
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3 10h14l2-2h2v4h-2l-1 1v5h-4v-5l-1-1H3v-2z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M7 12v4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'best-picture':
      // Trophy
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M8 2h8v10a4 4 0 0 1-8 0V2z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M16 4h2a2 2 0 0 1 0 4h-2M8 4H6a2 2 0 0 0 0 4h2" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 14v3" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M8 21h8v-2a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'war-films':
      // Medal/badge
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M8 2l4 6 4-6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx="12" cy="14" r="6" stroke={color} strokeWidth={sw} />
          <Path d="M12 11v4M10 13h4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'rom-coms':
      // Heart (reuse GenreIcon romance)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 7.5C10.5 4 5 4 5 8.5c0 5 7 10 7 10s7-5 7-10c0-4.5-5.5-4.5-7-1z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'coming-of-age':
      // Sunrise/horizon
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3 18h18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M5 14a7 7 0 0 1 14 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 3v4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M5.6 5.6l2 2M18.4 5.6l-2 2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'fantasy-adventure':
      // Sword (reuse GenreIcon fantasy)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2v14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 2l3 6H9l3-6z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M8 14h8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M10 16h4v3H10v-3z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'harry-potter':
      // Wand + sparkle (reuse GenreIcon animation)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="6" y1="18" x2="16" y2="8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M18 2l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5L18 2z" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
          <Path d="M10 3l.3 1.2 1.2.3-1.2.3L10 6l-.3-1.2L8.5 4.5l1.2-.3L10 3z" stroke={color} strokeWidth={1} strokeLinejoin="round" />
        </Svg>
      );

    case 'thriller-suspense':
      // Eye (reuse GenreIcon thriller)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'comedy-legends':
      // Smiley (reuse GenreIcon comedy)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
          <Circle cx="9" cy="10" r="1" fill={color} />
          <Circle cx="15" cy="10" r="1" fill={color} />
          <Path d="M8 15c1 2 7 2 8 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'star-wars-universe':
      // Lightsaber
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="11" y="2" width="2" height="12" rx="1" stroke={color} strokeWidth={sw} />
          <Rect x="9" y="14" width="6" height="3" rx="1" stroke={color} strokeWidth={sw} />
          <Path d="M10 17v2h4v-2" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'sports-movies':
      // Trophy/ball
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={sw} />
          <Path d="M12 4c-2 3-2 5 0 8s2 5 0 8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M4.5 9h15M4.5 15h15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'lotr-vs-potter':
      // Ring (circle)
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={sw} />
          <Circle cx="12" cy="12" r="5.5" stroke={color} strokeWidth={sw} />
          <Path d="M7 9.5c2 .5 5 .5 7.5-.5" stroke={color} strokeWidth={1.25} strokeLinecap="round" />
          <Path d="M7 14.5c2-.5 5-.5 7.5.5" stroke={color} strokeWidth={1.25} strokeLinecap="round" />
        </Svg>
      );

    case 'twist-endings':
      // Spiral/question
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 22c-5.5 0-10-4.5-10-10S6.5 2 12 2s8 3.5 8 8-3.5 6-6 6-4-1.5-4-4 1.5-4 4-4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'sequels-ranked':
      // Arrows/repeat
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M17 2l4 4-4 4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M3 11V9a4 4 0 0 1 4-4h14" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M7 22l-4-4 4-4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M21 13v2a4 4 0 0 1-4 4H3" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'villains':
      // Horned mask
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M4 4l3 8M20 4l-3 8" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M5 12a7 7 0 0 0 14 0" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M5 12h14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="9.5" cy="15" r="1.25" stroke={color} strokeWidth={sw} />
          <Circle cx="14.5" cy="15" r="1.25" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'heist-movies':
      // Diamond
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M6 3h12l4 7-10 12L2 10l4-7z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M2 10h20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M12 22l-2-12M12 22l2-12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M6 3l4 7M18 3l-4 7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'tear-jerkers':
      // Teardrop
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 3c0 0-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M10 16a2.5 2.5 0 0 0 2.5 2.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'cult-classics':
      // Flame
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M12 12c0 2-1.5 3-1.5 4.5a1.5 1.5 0 0 0 3 0c0-1.5-1.5-2.5-1.5-4.5z" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
        </Svg>
      );

    case 'dad-movies':
      // Armchair/recliner
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M3 11a2 2 0 0 1 2 2v1h14v-1a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M5 18v2M19 18v2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    default:
      return null;
  }
}

export function CategoryCellEmpty({ category, movies, cellSize }: CategoryCellEmptyProps) {
  const isDirector = DIRECTOR_IDS.has(category.id);
  const decadeLabel = DECADE_MAP[category.id];
  const isShareable = cellSize !== undefined;

  // --- Director cells: 2x2 mini poster grid ---
  if (isDirector) {
    const posterMovies = category.movieIds.slice(0, 4).map(id => movies.get(id));
    return (
      <View style={[
        styles.cell,
        isShareable && { width: cellSize, height: cellSize! * 1.5 },
      ]}>
        <View style={styles.posterMiniGrid}>
          {posterMovies.map((movie, i) => (
            <View key={i} style={styles.posterMiniCell}>
              {movie?.posterUrl ? (
                <Image source={{ uri: movie.posterUrl }} style={styles.posterMiniImage} />
              ) : (
                <View style={styles.posterMiniPlaceholder} />
              )}
            </View>
          ))}
        </View>
        <Text style={[styles.cellTitle, isShareable && styles.cellTitleShareable]} numberOfLines={1}>
          {category.title}
        </Text>
      </View>
    );
  }

  // --- Decade cells: large bold number ---
  if (decadeLabel) {
    return (
      <View style={[
        styles.cell,
        isShareable && { width: cellSize, height: cellSize! * 1.5 },
      ]}>
        <View style={styles.cellContent}>
          <Text style={[styles.decadeText, isShareable && styles.decadeTextShareable]}>
            {decadeLabel}
          </Text>
        </View>
        <Text style={[styles.cellTitle, isShareable && styles.cellTitleShareable]} numberOfLines={1}>
          {category.title}
        </Text>
      </View>
    );
  }

  // --- Icon cells: SVG icon ---
  const iconSize = isShareable ? 36 : 32;

  return (
    <View style={[
      styles.cell,
      isShareable && { width: cellSize, height: cellSize! * 1.5 },
    ]}>
      <View style={styles.cellContent}>
        <CategoryIcon categoryId={category.id} size={iconSize} color={colors.textMuted} />
      </View>
      <Text style={[styles.cellTitle, isShareable && styles.cellTitleShareable]} numberOfLines={1}>
        {category.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cellContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  cellTitleShareable: {
    fontSize: 10,
    paddingBottom: 6,
  },

  // Director: 2x2 mini poster grid
  posterMiniGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
  },
  posterMiniCell: {
    width: '49%',
    height: '49%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  posterMiniImage: {
    width: '100%',
    height: '100%',
  },
  posterMiniPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.border,
  },

  // Decade: large bold number
  decadeText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: -0.5,
  },
  decadeTextShareable: {
    fontSize: 18,
  },
});
