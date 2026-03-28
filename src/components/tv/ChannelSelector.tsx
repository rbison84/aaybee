import React, { useRef, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { TvChannel } from '../../data/tvChannels';
import { colors, spacing, borderRadius, typography } from '../../theme/cinematic';

interface ChannelSelectorProps {
  channels: TvChannel[];
  activeChannelId: string;
  onSelect: (id: string) => void;
  onOpenGuide: () => void;
}

export function ChannelSelector({ channels, activeChannelId, onSelect, onOpenGuide }: ChannelSelectorProps) {
  const scrollRef = useRef<ScrollView>(null);

  const handleSelect = useCallback((id: string, index: number) => {
    onSelect(id);
    // Scroll to keep the selected pill visible
    scrollRef.current?.scrollTo({ x: Math.max(0, index * 120 - 40), animated: true });
  }, [onSelect]);

  return (
    <View style={styles.container}>
      <View style={styles.backdrop} />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {channels.map((channel, index) => {
          const isActive = channel.id === activeChannelId;
          return (
            <Pressable
              key={channel.id}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => handleSelect(channel.id, index)}
            >
              <Text style={[styles.pillLabel, isActive && styles.pillLabelActive]}>
                {channel.label}
              </Text>
            </Pressable>
          );
        })}
        {/* Guide button */}
        <Pressable style={styles.guidePill} onPress={onOpenGuide}>
          <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
            <Rect x={1} y={1} width={6} height={6} rx={1.5} fill={colors.textSecondary} />
            <Rect x={9} y={1} width={6} height={6} rx={1.5} fill={colors.textSecondary} />
            <Rect x={1} y={9} width={6} height={6} rx={1.5} fill={colors.textSecondary} />
            <Rect x={9} y={9} width={6} height={6} rx={1.5} fill={colors.textSecondary} />
          </Svg>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.round,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
  },
  pillLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pillLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  guidePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.round,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
