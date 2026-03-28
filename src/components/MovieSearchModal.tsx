import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { getPosterUrl } from '../services/tmdb';
import { searchMoviesByTitle, DBMovie } from '../services/database';
import { useAppStore } from '../store/useAppStore';
import { useMovieDetail } from '../contexts/MovieDetailContext';
import type { Genre, Movie } from '../types';

interface MovieSearchModalProps {
  onClose: () => void;
}

type SearchResult = DBMovie;

function CloseIcon({ size = 24, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MovieSearchModal({ onClose }: MovieSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const { movies, markMovieAsKnown } = useAppStore();
  const { openMovieDetail } = useMovieDetail();

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (text.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults = await searchMoviesByTitle(text.trim());
        setResults(searchResults);
        setSearched(true);
      } catch (error) {
        console.error('[Search] Error:', error);
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleSelectMovie = useCallback((item: SearchResult) => {
    Keyboard.dismiss();

    const movieId = item.id;
    const posterUrl = item.poster_url || getPosterUrl(item.poster_path);

    markMovieAsKnown(movieId, {
      title: item.title,
      year: item.year,
      posterUrl,
      genres: item.genres as Genre[],
      posterColor: item.poster_color,
      overview: item.overview || '',
      voteAverage: item.vote_average,
      voteCount: item.vote_count,
      directorName: item.director_name || undefined,
      directorId: item.director_id ? String(item.director_id) : undefined,
      collectionId: item.collection_id || undefined,
      collectionName: item.collection_name || undefined,
      certification: item.certification || undefined,
      tmdbId: item.tmdb_id || undefined,
      posterPath: item.poster_path || undefined,
    });

    const movie: Movie = {
      id: movieId,
      title: item.title,
      year: item.year,
      posterUrl: posterUrl || '',
      genres: item.genres as Genre[],
      posterColor: item.poster_color || '',
      overview: item.overview || '',
      voteAverage: item.vote_average,
      voteCount: item.vote_count,
      directorName: item.director_name || undefined,
      directorId: item.director_id ? String(item.director_id) : undefined,
      collectionId: item.collection_id || undefined,
      collectionName: item.collection_name || undefined,
      certification: item.certification || undefined,
      tmdbId: item.tmdb_id || undefined,
      posterPath: item.poster_path || undefined,
      beta: 0,
      totalComparisons: 0,
      totalWins: 0,
      totalLosses: 0,
      timesShown: 0,
      lastShownAt: 0,
      status: 'known',
    };

    openMovieDetail(movie);
    onClose();
  }, [markMovieAsKnown, openMovieDetail, onClose]);

  const getMovieBadge = useCallback((movieId: string): string | null => {
    const movie = movies.get(movieId);
    if (!movie || movie.totalComparisons === 0) return null;
    if (movie.totalComparisons >= 2) return 'ranked';
    return '1 more';
  }, [movies]);

  const renderItem = useCallback(({ item }: { item: SearchResult }) => {
    const year = item.year ? String(item.year) : '';
    const posterUrl = getPosterUrl(item.poster_path, 'small');
    const badge = getMovieBadge(item.id);

    return (
      <Pressable
        style={({ pressed }) => [styles.resultItem, pressed && styles.resultItemPressed]}
        onPress={() => handleSelectMovie(item)}
      >
        <View style={styles.resultPoster}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.resultPosterImage} />
          ) : (
            <View style={styles.resultPosterFallback}>
              <Text style={styles.resultPosterFallbackText}>
                {item.title.slice(0, 2)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.resultYear}>{year}</Text>
        </View>
        {badge && (
          <View style={styles.rankedBadge}>
            <Text style={styles.rankedBadgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
    );
  }, [handleSelectMovie, getMovieBadge]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Text style={styles.title}>find a movie</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' as const }}>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <CloseIcon />
          </Pressable>
        </View>
      </View>

      {/* Search input */}
      <View style={styles.searchBar}>
        <SearchIcon color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="search by title..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => handleSearch('')}>
            <CloseIcon size={20} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      ) : searched ? (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>no movies found</Text>
        </View>
      ) : (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>search for any movie to rank it</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  closeButton: {
    padding: spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    height: '100%',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  resultsList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  resultItemPressed: {
    opacity: 0.7,
  },
  resultPoster: {
    width: 40,
    height: 60,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  resultPosterImage: {
    width: '100%',
    height: '100%',
  },
  resultPosterFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultPosterFallbackText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  resultYear: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
  rankedBadge: {
    backgroundColor: colors.accentSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  rankedBadgeText: {
    ...typography.tiny,
    color: colors.accent,
    fontWeight: '600',
  },
});
