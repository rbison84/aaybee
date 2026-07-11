// ============================================
// TASTE ENGINE PROGRESS — makes the funnel legible
// ============================================
// The game → data → recommendations pipeline, shown to the user: every
// game feeds the engine, and recommendations unlock when there's enough
// data to make them good. Never show a bad rec; show progress instead.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing, borderRadius } from '../theme/cinematic';

/** Comparisons needed before personal recommendations switch on */
export const ENGINE_UNLOCK_THRESHOLD = 50;

/**
 * One-line footer for game result screens:
 * "+15 rankings → your taste engine got smarter (34/50)"
 */
export function EngineProgressLine({ added }: { added?: number }) {
  const { totalComparisons } = useAppStore();
  const unlocked = totalComparisons >= ENGINE_UNLOCK_THRESHOLD;

  const prefix = added && added > 0 ? `+${added} rankings → ` : '';
  const text = unlocked
    ? `${prefix}your taste engine: ${totalComparisons} rankings strong`
    : `${prefix}your taste engine got smarter (${Math.min(totalComparisons, ENGINE_UNLOCK_THRESHOLD)}/${ENGINE_UNLOCK_THRESHOLD})`;

  return <Text style={styles.line}>{text.toUpperCase()}</Text>;
}

/**
 * Gate card for recommendation surfaces below the data threshold.
 */
export function EngineMeter({ subtitle }: { subtitle?: string }) {
  const { totalComparisons } = useAppStore();
  const progress = Math.min(totalComparisons / ENGINE_UNLOCK_THRESHOLD, 1);

  return (
    <View style={styles.meterCard}>
      <Text style={styles.meterTitle}>YOUR TASTE ENGINE</Text>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={styles.meterCount}>
        {Math.min(totalComparisons, ENGINE_UNLOCK_THRESHOLD)}/{ENGINE_UNLOCK_THRESHOLD} RANKINGS
      </Text>
      <Text style={styles.meterSubtitle}>
        {subtitle || 'PERSONAL RECOMMENDATIONS UNLOCK AT 50 — EVERY GAME YOU PLAY MAKES THEM SMARTER'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  meterCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  meterTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  meterTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  meterCount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  meterSubtitle: {
    fontSize: 9,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 14,
  },
});
