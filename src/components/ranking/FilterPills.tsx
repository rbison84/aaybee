import React from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';
import { Genre } from '../../types';

export type FilterType = 'top10' | 'top25' | 'all';
export type SortType = 'beta' | 'winRate' | 'comparisons';

interface FilterPillsProps {
  activeFilter: FilterType;
  activeSort: SortType;
  selectedGenre: Genre | null;
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  onGenreChange: (genre: Genre | null) => void;
}

const FILTERS: { id: FilterType; label: string; emoji: string }[] = [
  { id: 'top10', label: 'Top 10', emoji: '🏆' },
  { id: 'top25', label: 'Top 25', emoji: '🎬' },
  { id: 'all', label: 'All', emoji: '📋' },
];

const SORT_OPTIONS: { id: SortType; label: string }[] = [
  { id: 'beta', label: 'Strength' },
  { id: 'winRate', label: 'Win %' },
  { id: 'comparisons', label: 'Most Compared' },
];

const GENRES: { id: Genre; label: string; emoji: string }[] = [
  { id: 'action', label: 'Action', emoji: '💥' },
  { id: 'comedy', label: 'Comedy', emoji: '😂' },
  { id: 'drama', label: 'Drama', emoji: '🎭' },
  { id: 'scifi', label: 'Sci-Fi', emoji: '🚀' },
  { id: 'horror', label: 'Horror', emoji: '👻' },
  { id: 'romance', label: 'Romance', emoji: '💕' },
  { id: 'thriller', label: 'Thriller', emoji: '😱' },
  { id: 'animation', label: 'Animation', emoji: '🎨' },
  { id: 'fantasy', label: 'Fantasy', emoji: '🧙' },
  { id: 'adventure', label: 'Adventure', emoji: '🗺️' },
];

function Pill({
  label,
  emoji,
  isActive,
  onPress,
}: {
  label: string;
  emoji?: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const haptics = useHaptics();

  const handlePress = () => {
    haptics.selection();
    onPress();
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          styles.pill,
          isActive && styles.pillActive,
        ]}
      >
        {emoji && <Text style={styles.pillEmoji}>{emoji}</Text>}
        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function FilterPills({
  activeFilter,
  activeSort,
  selectedGenre,
  onFilterChange,
  onSortChange,
  onGenreChange,
}: FilterPillsProps) {
  return (
    <View style={styles.container}>
      {/* Main Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FILTERS.map((filter) => (
          <Pill
            key={filter.id}
            label={filter.label}
            emoji={filter.emoji}
            isActive={activeFilter === filter.id}
            onPress={() => onFilterChange(filter.id)}
          />
        ))}
      </ScrollView>

      {/* Sort Options */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        {SORT_OPTIONS.map((sort) => (
          <Pressable
            key={sort.id}
            onPress={() => onSortChange(sort.id)}
            style={[
              styles.sortButton,
              activeSort === sort.id && styles.sortButtonActive,
            ]}
          >
            <Text
              style={[
                styles.sortText,
                activeSort === sort.id && styles.sortTextActive,
              ]}
            >
              {sort.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  genreScroll: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },

  // Pills
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    gap: 6,
  },
  pillActive: {
    backgroundColor: '#3b82f6',
  },
  pillEmoji: {
    fontSize: 14,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  pillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // Sort
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  sortButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sortButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  sortText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  sortTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
