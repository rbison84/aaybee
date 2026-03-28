import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export type QualityLevel = 'high' | 'multiple' | 'new' | 'standard';

interface QualityIndicatorProps {
  level: QualityLevel;
  count?: number; // For 'multiple' - how many users
}

export function QualityIndicator({ level, count }: QualityIndicatorProps) {
  const config = {
    high: {
      emoji: '🔥',
      text: 'Highly recommended',
      color: colors.orange,
    },
    multiple: {
      emoji: '👥',
      text: `${count || 'Multiple'} similar users loved this`,
      color: colors.magenta,
    },
    new: {
      emoji: '✨',
      text: 'New recommendation',
      color: colors.cyan,
    },
    standard: {
      emoji: '👍',
      text: 'Recommended for you',
      color: colors.cream,
    },
  };

  const { emoji, text, color } = config[level];

  return (
    <View style={[styles.container, { backgroundColor: color }]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 5,
    alignSelf: 'flex-start',
  },
  emoji: {
    fontSize: 12,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.black,
  },
});
