import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { Genre } from '../../types';
import { useHaptics } from '../../hooks/useHaptics';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';
import { GENRE_LABELS } from '../../data/onboardingMovies';

const GENRES: Genre[] = [
  'action', 'comedy', 'drama',
  'scifi', 'romance', 'thriller',
  'animation', 'horror', 'adventure',
];

interface GenreSelectorProps {
  onSelect: (genres: Genre[]) => void;
  minSelection?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function GenreChip({
  genre,
  selected,
  onToggle,
}: {
  genre: Genre;
  selected: boolean;
  onToggle: () => void;
}) {
  const haptics = useHaptics();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    haptics.light();
    onToggle();
  };

  return (
    <AnimatedPressable
      style={[
        styles.chip,
        selected && styles.chipSelected,
        animatedStyle,
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {GENRE_LABELS[genre] || genre}
      </Text>
    </AnimatedPressable>
  );
}

export function GenreSelector({ onSelect, minSelection = 1 }: GenreSelectorProps) {
  const [selectedGenres, setSelectedGenres] = useState<Genre[]>([]);
  const haptics = useHaptics();

  const toggleGenre = (genre: Genre) => {
    setSelectedGenres(prev => {
      if (prev.includes(genre)) {
        return prev.filter(g => g !== genre);
      }
      return [...prev, genre];
    });
  };

  const handleContinue = () => {
    if (selectedGenres.length >= minSelection) {
      haptics.success();
      onSelect(selectedGenres);
    }
  };

  const canContinue = selectedGenres.length >= minSelection;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>what genres do you love?</Text>
      <Text style={styles.subtitle}>
        pick at least {minSelection} {minSelection === 1 ? 'genre' : 'genres'}
      </Text>

      <View style={styles.grid}>
        {GENRES.map(genre => (
          <GenreChip
            key={genre}
            genre={genre}
            selected={selectedGenres.includes(genre)}
            onToggle={() => toggleGenre(genre)}
          />
        ))}
      </View>

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!canContinue}
      >
        <Text style={[styles.continueButtonText, !canContinue && styles.continueButtonTextDisabled]}>
          continue
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxxl,
    maxWidth: 320,
  },
  chip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.background,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl + spacing.xl,
    borderRadius: borderRadius.lg,
  },
  continueButtonDisabled: {
    backgroundColor: colors.surface,
  },
  continueButtonText: {
    ...typography.bodyMedium,
    color: colors.background,
    fontWeight: '700',
  },
  continueButtonTextDisabled: {
    color: colors.textMuted,
  },
});
