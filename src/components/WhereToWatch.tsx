// ============================================
// WHERE TO WATCH — availability chips + click-through
// ============================================
// The revenue surface: shows streaming providers for a movie and opens the
// JustWatch page on tap, logging the intent event to watch_clicks.
// Renders nothing when availability is unknown/empty.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Image } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import {
  getWatchAvailability,
  openWatchLink,
  WatchAvailability,
  WatchClickSource,
} from '../services/watchProviders';
import { colors, spacing, borderRadius } from '../theme/cinematic';

interface WhereToWatchProps {
  movieId: string;
  tmdbId?: number;
  source: WatchClickSource;
  /** compact renders a single-row pill (for cards); default is a full section */
  compact?: boolean;
}

export function WhereToWatch({ movieId, tmdbId, source, compact }: WhereToWatchProps) {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<WatchAvailability | null>(null);

  useEffect(() => {
    let mounted = true;
    getWatchAvailability(tmdbId).then(data => {
      if (mounted) setAvailability(data);
    });
    return () => { mounted = false; };
  }, [tmdbId]);

  if (!availability || availability.providers.length === 0 || !availability.link) {
    return null;
  }

  const streaming = availability.providers.filter(p => p.kind === 'stream');
  const shown = (streaming.length > 0 ? streaming : availability.providers).slice(0, 4);
  const label = streaming.length > 0
    ? `WATCH ON ${streaming[0].name.toUpperCase()}`
    : 'WHERE TO WATCH';

  const handlePress = () => {
    openWatchLink(availability, user?.id, movieId, source, shown[0]?.name);
  };

  if (compact) {
    return (
      <Pressable style={styles.compactPill} onPress={handlePress}>
        {shown[0]?.logoUrl ? (
          <Image source={{ uri: shown[0].logoUrl }} style={styles.compactLogo} />
        ) : null}
        <Text style={styles.compactText} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.section}>
      <Pressable style={styles.watchButton} onPress={handlePress}>
        <View style={styles.logoRow}>
          {shown.map(p => (
            p.logoUrl ? (
              <Image key={p.providerId} source={{ uri: p.logoUrl }} style={styles.logo} />
            ) : null
          ))}
        </View>
        <Text style={styles.watchText}>{label}</Text>
      </Pressable>
      <Text style={styles.attribution}>streaming data by JustWatch</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: borderRadius.xxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    width: '100%',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  logo: {
    width: 24,
    height: 24,
    borderRadius: 5,
  },
  watchText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  attribution: {
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  compactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: borderRadius.round,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  compactLogo: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  compactText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
});
