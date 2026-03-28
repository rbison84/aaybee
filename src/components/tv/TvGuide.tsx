import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TvChannel, TvGuideSection, DECADE_CONFIG, GENRE_CONFIG, getFilteredMovieIds } from '../../data/tvChannels';
import { Movie, Genre } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';
import { GenreIcon } from './GenreIcon';

interface TvGuideProps {
  activeChannelId: string;
  curatedSections: TvGuideSection[];
  forYouChannel: TvChannel;
  onSelectChannel: (channel: TvChannel) => void;
  onPlayFilters: (decades: string[], genres: Genre[], movieIds: string[]) => void;
  onClose: () => void;
  allMovies: Map<string, Movie>;
  rankedMovies: Movie[];
}

export function TvGuide({
  activeChannelId,
  curatedSections,
  forYouChannel,
  onSelectChannel,
  onPlayFilters,
  onClose,
  allMovies,
  rankedMovies,
}: TvGuideProps) {
  const [selectedDecades, setSelectedDecades] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<Genre[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set()
  );

  // Only show decades/genres that have 3+ movies
  const availableDecades = useMemo(() => {
    return DECADE_CONFIG.filter(d => {
      let count = 0;
      allMovies.forEach(m => {
        if (m.year >= d.startYear && m.year <= d.endYear) count++;
      });
      return count >= 3;
    });
  }, [allMovies]);

  const availableGenres = useMemo(() => {
    return GENRE_CONFIG.filter(g => {
      let count = 0;
      allMovies.forEach(m => {
        if (m.genres.includes(g.genre)) count++;
      });
      return count >= 3;
    });
  }, [allMovies]);

  // Compute filtered movie IDs when any filter is active
  const filtersActive = selectedDecades.length > 0 || selectedGenres.length > 0;

  const filteredMovieIds = useMemo(() => {
    if (!filtersActive) return [];
    return getFilteredMovieIds(allMovies, rankedMovies, selectedDecades, selectedGenres);
  }, [allMovies, rankedMovies, selectedDecades, selectedGenres, filtersActive]);

  const toggleDecade = (id: string) => {
    setSelectedDecades(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const toggleGenre = (genre: Genre) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handlePlayFilters = () => {
    onPlayFilters(selectedDecades, selectedGenres, filteredMovieIds);
  };

  return (
    <View style={styles.overlay}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>tv guide</Text>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M18 6L6 18M6 6l12 12" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>

      {/* Body */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- For You ---- */}
        <Pressable
          style={[styles.forYouRow, activeChannelId === 'for-you' && styles.forYouRowActive]}
          onPress={() => onSelectChannel(forYouChannel)}
        >
          <View style={styles.forYouLeft}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M12 2l1 4 4 1-4 1-1 4-1-4-4-1 4-1 1-4z" stroke={colors.textPrimary} strokeWidth={1.75} strokeLinejoin="round" />
              <Path d="M19 10l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" stroke={colors.textPrimary} strokeWidth={1.25} strokeLinejoin="round" />
              <Path d="M5 16l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" stroke={colors.textPrimary} strokeWidth={1.25} strokeLinejoin="round" />
            </Svg>
            <Text style={styles.forYouLabel}>for you</Text>
          </View>
          <Text style={styles.forYouPlay}>▶</Text>
        </Pressable>

        {/* ---- Filters divider ---- */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>filters</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* By Decade */}
        <SectionHeader
          title="by decade"
          expanded={expandedSections.has('by-decade')}
          onToggle={() => toggleSection('by-decade')}
        />
        {expandedSections.has('by-decade') && (
          <View style={styles.chipGrid}>
            {availableDecades.map(d => (
              <Pressable
                key={d.id}
                style={[styles.chip, selectedDecades.includes(d.id) && styles.chipSelected]}
                onPress={() => toggleDecade(d.id)}
              >
                <Text style={[styles.chipText, selectedDecades.includes(d.id) && styles.chipTextSelected]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* By Genre */}
        <SectionHeader
          title="by genre"
          expanded={expandedSections.has('by-genre')}
          onToggle={() => toggleSection('by-genre')}
        />
        {expandedSections.has('by-genre') && (
          <View style={styles.chipGrid}>
            {availableGenres.map(g => (
              <Pressable
                key={g.genre}
                style={[styles.chip, selectedGenres.includes(g.genre) && styles.chipSelected]}
                onPress={() => toggleGenre(g.genre)}
              >
                <View style={styles.chipContent}>
                  <GenreIcon
                    genre={g.genre}
                    size={14}
                    color={selectedGenres.includes(g.genre) ? '#fff' : colors.textSecondary}
                  />
                  <Text style={[styles.chipText, selectedGenres.includes(g.genre) && styles.chipTextSelected]}>
                    {g.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Play button — only when filters active */}
        {filtersActive && (
          <Pressable style={styles.playButton} onPress={handlePlayFilters}>
            <Text style={styles.playButtonText}>
              ▶  play {filteredMovieIds.length} {filteredMovieIds.length === 1 ? 'movie' : 'movies'}
            </Text>
          </Pressable>
        )}

        {/* ---- Channels divider ---- */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>channels</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Curated sections */}
        {curatedSections.map(section => (
          <View key={section.id}>
            <SectionHeader
              title={section.title}
              expanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
            {expandedSections.has(section.id) && (
              <View style={styles.grid}>
                {section.channels.map(channel => {
                  const isActive = channel.id === activeChannelId;
                  return (
                    <Pressable
                      key={channel.id}
                      style={[styles.card, isActive && styles.cardActive]}
                      onPress={() => onSelectChannel(channel)}
                    >
                      <Text style={styles.cardLabel} numberOfLines={1}>{channel.label}</Text>
                      <Text style={styles.cardCount}>
                        {channel.movieIds.length} {channel.movieIds.length === 1 ? 'movie' : 'movies'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ))}

        {/* Bottom padding */}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

/** Collapsible section header with chevron */
function SectionHeader({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
  },

  // ---- For You ----
  forYouRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  forYouRowActive: {
    borderColor: colors.accent,
  },
  forYouLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  forYouLabel: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  forYouPlay: {
    fontSize: 18,
    color: colors.textMuted,
  },

  // ---- Dividers ----
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // ---- Section headers ----
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'lowercase',
  },
  chevron: {
    fontSize: 16,
    color: colors.textMuted,
  },

  // ---- Filter chips ----
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.round,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },

  // ---- Play button ----
  playButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  playButtonText: {
    ...typography.bodyMedium,
    color: '#fff',
    fontWeight: '600',
  },

  // ---- Channel cards (curated) ----
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardActive: {
    borderColor: colors.accent,
  },
  cardLabel: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  cardCount: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
});
