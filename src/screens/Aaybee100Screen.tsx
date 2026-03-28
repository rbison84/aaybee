import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  FlatList,
  Image,
  Share,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Line } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { useAppStore } from '../store/useAppStore';
import { Movie } from '../types';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

// ============================================
// Types
// ============================================

interface Aaybee100ScreenProps {
  onClose: () => void;
}

type SortMode = 'global' | 'yours' | 'deviation' | 'genre' | 'decade';
type FilterMode = 'all' | 'hot' | 'cold' | 'not-seen' | 'consensus';
type ViewMode = 'home' | 'explore';
type CellState = 'ranked-up' | 'ranked-down' | 'ranked-even' | 'not-seen' | 'unknown';

interface CellData {
  movie: Movie;
  globalRank: number;           // position in full 100
  subsetGlobalRank: number | null; // position among ranked movies by global order
  userRank: number | null;      // position in user's beta-sorted tier1 list
  state: CellState;
  deviation: number | null;     // userRank - subsetGlobalRank (same denominator, no bias)
}

// ============================================
// Icons
// ============================================

function CloseIcon({ size = 24, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function BackIcon({ size = 24, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronIcon({ direction = 'right', size = 20, color = colors.textMuted }: { direction?: 'left' | 'right'; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function EyeSlashIcon({ size = 16, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M1 1l22 22" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ============================================
// Helpers
// ============================================

function lerpColor(from: string, to: string, t: number): string {
  const fv = parseInt(from.slice(1), 16);
  const tv = parseInt(to.slice(1), 16);
  const fr = (fv >> 16) & 0xFF, fg = (fv >> 8) & 0xFF, fb = fv & 0xFF;
  const tr = (tv >> 16) & 0xFF, tg = (tv >> 8) & 0xFF, tb = tv & 0xFF;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Intensity-based color — shades green/red by deviation magnitude
function getCellColor(state: CellState, deviation: number | null, rankedCount: number): string {
  switch (state) {
    case 'not-seen': return '#4A4858';
    case 'unknown': return colors.surface;
    case 'ranked-even': return colors.accent;
    case 'ranked-up':
    case 'ranked-down': {
      const absDev = Math.abs(deviation ?? 0);
      const maxDev = Math.max(rankedCount - 1, 1);
      // sqrt curve so small diffs are still visible
      const intensity = Math.min(1, Math.sqrt(absDev / (maxDev * 0.5)));
      const t = 0.25 + intensity * 0.75; // range [0.25, 1.0]
      const target = state === 'ranked-up' ? colors.success : colors.error;
      return lerpColor(colors.background, target, t);
    }
  }
}

function isCollected(state: CellState): boolean {
  return state !== 'unknown';
}

// ============================================
// Witty take pools
// ============================================

const TAKE_POOLS = {
  hotExtreme: [
    'the world is sleeping on this',
    'hill you\'d die on',
    'you\'re fighting for this one',
    'cinema justice warrior',
    'you would write the appeal',
    'underrated is an understatement',
    'this is your crusade',
    'criminally slept on',
  ],
  hotModerate: [
    'you see something they don\'t',
    'ahead of the curve',
    'your guilty pleasure (except you\'re right)',
    'championing the underdog',
    'you\'d write the recommendation',
    'evangelist energy',
    'this one deserves better',
    'your secret weapon pick',
  ],
  hotSlight: [
    'quiet disagreement',
    'soft spot',
    'you\'d bump it up a few',
    'gentle nudge upward',
    'a little more love than most',
    'you see the appeal',
    'sneaky favorite',
    'slightly warmer on this one',
  ],
  consensus: [
    'no notes',
    'the rare consensus',
    'you and the world agree',
    'perfectly calibrated',
    'exactly where it belongs',
    'your taste is showing',
    'mainstream for a reason',
    'everyone\'s right on this one',
  ],
  coldSlight: [
    'not quite buying it',
    'slightly overhyped',
    'you\'d bump it down a few',
    'gentle nudge downward',
    'a little less love than most',
    'doesn\'t quite land for you',
    'fine but not that fine',
    'lukewarm take',
  ],
  coldModerate: [
    'the hype lost you',
    'respectfully, no',
    'contrarian energy',
    'they love it, you don\'t',
    'overhyped and you know it',
    'immune to the buzz',
    'you\'d skip the rewatch',
    'politely disagree',
  ],
  coldExtreme: [
    'your nemesis movie',
    'the world is wrong about this one',
    'you chose violence',
    'scorched earth take',
    'the anti-recommendation',
    'personal grudge territory',
    'you\'d uninvent this one',
    'cinema enemy number one',
  ],
};

function getWittyTake(deviation: number, rankedCount: number, movieId: string): { text: string; color: string } {
  // Deterministic pick based on movie ID so it's consistent but varied
  let hash = 0;
  for (let i = 0; i < movieId.length; i++) {
    hash = ((hash << 5) - hash + movieId.charCodeAt(i)) | 0;
  }
  const pick = (arr: string[]) => arr[Math.abs(hash) % arr.length];

  const BAND = 5;
  if (Math.abs(deviation) <= BAND) {
    return { text: pick(TAKE_POOLS.consensus), color: colors.accent };
  }

  const absDev = Math.abs(deviation);
  const maxDev = Math.max(rankedCount - 1, 1);
  const intensity = Math.min(1, Math.sqrt(absDev / (maxDev * 0.5)));
  const isHot = deviation < 0;

  let pool: string[];
  if (intensity > 0.66) {
    pool = isHot ? TAKE_POOLS.hotExtreme : TAKE_POOLS.coldExtreme;
  } else if (intensity > 0.33) {
    pool = isHot ? TAKE_POOLS.hotModerate : TAKE_POOLS.coldModerate;
  } else {
    pool = isHot ? TAKE_POOLS.hotSlight : TAKE_POOLS.coldSlight;
  }

  return { text: pick(pool), color: isHot ? colors.success : colors.error };
}

// Tracks collected IDs from last explore visit — used to compute "new" dots
const lastSeenIdsStore = new Set<string>();

// ============================================
// Component
// ============================================

export function Aaybee100Screen({ onClose }: Aaybee100ScreenProps) {
  const { movies, getRankedMovies } = useAppStore();
  const { width: screenWidth } = useWindowDimensions();
  const [view, setView] = useState<ViewMode>('home');
  const [sortMode, setSortMode] = useState<SortMode>('global');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const viewShotRef = useRef<ViewShot>(null);

  // ---- Data ----

  // Tier 1 movies sorted by global consensus (voteAverage)
  const tier1 = useMemo(() => {
    return Array.from(movies.values())
      .filter(m => (m.sourceTier || m.tier || 99) === 1)
      .sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0))
      .slice(0, 100);
  }, [movies]);

  // User's ranked tier1 movies (beta-sorted, same criteria as getRankedMovies)
  const userRankedTier1 = useMemo(() => {
    const tier1Ids = new Set(tier1.map(m => m.id));
    return getRankedMovies().filter(m => tier1Ids.has(m.id));
  }, [tier1, getRankedMovies]);

  // Enriched cell data for the 100 grid
  const cells: CellData[] = useMemo(() => {
    // userRankedTier1 is beta-sorted — index = user's ranking
    const userRankMap = new Map<string, number>();
    userRankedTier1.forEach((m, i) => userRankMap.set(m.id, i));

    // Subset global ranks: among only ranked movies, what's their global ordering?
    // This removes bias from comparing partial rankings against the full 100.
    const rankedIds = new Set(userRankedTier1.map(m => m.id));
    const subsetGlobalRankMap = new Map<string, number>();
    let subsetIdx = 0;
    tier1.forEach(m => {
      if (rankedIds.has(m.id)) {
        subsetGlobalRankMap.set(m.id, subsetIdx++);
      }
    });

    return tier1.map((movie, globalRank) => {
      const isRanked = movie.status === 'known' && movie.totalComparisons >= 2;
      const isNotSeen = movie.status === 'unknown';
      const userRank = userRankMap.get(movie.id) ?? null;
      const subsetGlobalRank = subsetGlobalRankMap.get(movie.id) ?? null;

      let state: CellState;
      let deviation: number | null = null;

      if (isRanked && userRank !== null && subsetGlobalRank !== null) {
        // Same denominator — both are positions within the ranked subset
        deviation = userRank - subsetGlobalRank;
        const BAND = 5;
        state = Math.abs(deviation) <= BAND ? 'ranked-even' : deviation < 0 ? 'ranked-up' : 'ranked-down';
      } else if (isNotSeen) {
        state = 'not-seen';
      } else {
        state = 'unknown';
      }

      return { movie, globalRank, subsetGlobalRank, userRank, state, deviation };
    });
  }, [tier1, userRankedTier1]);

  // Counts
  const rankedCount = cells.filter(c => c.state.startsWith('ranked')).length;
  const notSeenCount = cells.filter(c => c.state === 'not-seen').length;
  const remainingCount = 100 - rankedCount - notSeenCount;

  // Stats (only when 75+ ranked)
  const stats = useMemo(() => {
    if (rankedCount < 75) return null;
    const ranked = cells.filter(c => c.deviation !== null);
    if (ranked.length === 0) return null;

    const avgDev = ranked.reduce((s, c) => s + Math.abs(c.deviation!), 0) / ranked.length;

    let hotTake: CellData | null = null;
    let coldTake: CellData | null = null;
    for (const c of ranked) {
      if (!hotTake || c.deviation! < hotTake.deviation!) hotTake = c;
      if (!coldTake || c.deviation! > coldTake.deviation!) coldTake = c;
    }

    const unranked = cells.filter(c => c.state === 'unknown');
    const decadeCounts: Record<string, number> = {};
    const genreCounts: Record<string, number> = {};
    for (const c of unranked) {
      const dec = `${Math.floor(c.movie.year / 10) * 10}s`;
      decadeCounts[dec] = (decadeCounts[dec] || 0) + 1;
      for (const g of c.movie.genres) {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      }
    }
    const blindspotDecade = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const blindspotGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      contrarian: Math.round(avgDev * 10) / 10,
      hotTake,
      coldTake,
      blindspotDecade,
      blindspotGenre,
    };
  }, [cells, rankedCount]);

  // Filtered + sorted list for explore view
  const sortedCells = useMemo((): CellData[] => {
    // Filter first
    let arr = [...cells];
    if (filterMode !== 'all') {
      const targetState: CellState =
        filterMode === 'hot' ? 'ranked-up' :
        filterMode === 'cold' ? 'ranked-down' :
        filterMode === 'consensus' ? 'ranked-even' :
        'not-seen';
      arr = arr.filter(c => c.state === targetState);
    }

    // Then sort
    switch (sortMode) {
      case 'global':
        return arr;
      case 'yours':
        return arr.sort((a, b) => {
          if (a.userRank === null && b.userRank === null) return a.globalRank - b.globalRank;
          if (a.userRank === null) return 1;
          if (b.userRank === null) return -1;
          return a.userRank - b.userRank;
        });
      case 'deviation':
        return arr.sort((a, b) => {
          const da = a.deviation !== null ? Math.abs(a.deviation) : -1;
          const db = b.deviation !== null ? Math.abs(b.deviation) : -1;
          return db - da;
        });
      case 'genre':
        return arr.sort((a, b) => {
          const ga = a.movie.genres[0] || 'zzz';
          const gb = b.movie.genres[0] || 'zzz';
          return ga !== gb ? ga.localeCompare(gb) : a.globalRank - b.globalRank;
        });
      case 'decade':
        return arr.sort((a, b) => {
          const da = Math.floor(a.movie.year / 10) * 10;
          const db = Math.floor(b.movie.year / 10) * 10;
          return da !== db ? da - db : a.globalRank - b.globalRank;
        });
      default:
        return arr;
    }
  }, [cells, sortMode, filterMode]);

  // Selected cell for detail modal
  const selectedCell = selectedIndex !== null ? sortedCells[selectedIndex] : null;
  const wittyTake = selectedCell && selectedCell.deviation !== null
    ? getWittyTake(selectedCell.deviation, rankedCount, selectedCell.movie.id)
    : null;

  // ---- Handlers ----

  const handleShare = useCallback(async () => {
    if (Platform.OS !== 'web') {
      try {
        setIsCapturing(true);
        await new Promise(r => setTimeout(r, 100));
        if (viewShotRef.current) {
          const uri = await (viewShotRef.current as any).capture();
          if (uri) {
            const msg = `my aaybee 100 fingerprint${stats ? ` · contrarian: ${stats.contrarian}` : ''} → aaybee.netlify.app`;
            await Share.share(Platform.OS === 'ios' ? { url: uri, message: msg } : { message: msg });
            setIsCapturing(false);
            return;
          }
        }
      } catch (e) {
        console.error('ViewShot capture error:', e);
      } finally {
        setIsCapturing(false);
      }
    }
    const text = `my aaybee 100\n${rankedCount}/100 ranked${stats ? ` · contrarian: ${stats.contrarian}` : ''}\n\naaybee.netlify.app`;
    if (Platform.OS === 'web') {
      if (navigator.share) {
        await navigator.share({ text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } else {
      await Share.share({ message: text });
    }
  }, [stats, rankedCount]);

  // ---- Collected navigation helpers ----

  // Indices of collected movies in sortedCells
  const collectedIndices = useMemo(() =>
    sortedCells.map((c, i) => isCollected(c.state) ? i : -1).filter(i => i >= 0),
    [sortedCells]
  );
  const collectedCount = collectedIndices.length;

  const prevCollectedIndex = (current: number | null): number | null => {
    if (current === null) return null;
    for (let i = collectedIndices.length - 1; i >= 0; i--) {
      if (collectedIndices[i] < current) return collectedIndices[i];
    }
    return null;
  };

  const nextCollectedIndex = (current: number | null): number | null => {
    if (current === null) return null;
    for (let i = 0; i < collectedIndices.length; i++) {
      if (collectedIndices[i] > current) return collectedIndices[i];
    }
    return null;
  };

  const collectedIndexOf = (current: number | null): number => {
    if (current === null) return 0;
    const idx = collectedIndices.indexOf(current);
    return idx >= 0 ? idx : 0;
  };

  // ---- Grid renderer ----

  const renderGrid = (forShare = false) => {
    const sq = forShare ? 90 : 28;
    const gap = forShare ? 8 : 3;
    return (
      <View style={{ alignItems: 'center' }}>
        {Array.from({ length: 10 }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row', marginBottom: row < 9 ? gap : 0 }}>
            {Array.from({ length: 10 }, (_, col) => {
              const item = cells[row * 10 + col];
              if (!item) return <View key={col} style={{ width: sq, height: sq, marginRight: col < 9 ? gap : 0 }} />;
              return (
                <View
                  key={col}
                  accessibilityLabel={`${item.movie.title}, ${item.state === 'not-seen' ? 'not seen' : item.state === 'unknown' ? 'not ranked' : item.state.replace('-', ' ')}`}
                  style={{
                    width: sq,
                    height: sq,
                    backgroundColor: getCellColor(item.state, item.deviation, rankedCount),
                    borderRadius: forShare ? 6 : 3,
                    marginRight: col < 9 ? gap : 0,
                    overflow: 'hidden',
                  }}
                >
                  {item.state === 'not-seen' && (
                    <Svg width={sq} height={sq} style={{ position: 'absolute' }}>
                      <Line x1={sq * 0.8} y1={sq * 0.2} x2={sq * 0.2} y2={sq * 0.8} stroke="rgba(255,255,255,0.18)" strokeWidth={forShare ? 4.5 : 1.5} strokeLinecap="round" />
                    </Svg>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // Poster width for explore view (5 columns)
  const posterWidth = Math.floor((screenWidth - spacing.lg * 2 - spacing.xs * 4) / 5);

  // ==============================
  // HOME VIEW
  // ==============================
  if (view === 'home') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.homeContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }} />
            <Text style={styles.title}>aaybee 100</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' as const }}>
              <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
                <CloseIcon />
              </Pressable>
            </View>
          </View>

          {/* Fingerprint Grid */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.gridWrapper}>
            {renderGrid()}
          </Animated.View>

          {/* Progress */}
          <Text style={styles.progress}>
            {rankedCount}/100 · {notSeenCount} unseen · {remainingCount} remaining
          </Text>

          {/* Explore CTA */}
          <Pressable style={styles.exploreBtn} onPress={() => {
            const collectedIds = cells.filter(c => isCollected(c.state)).map(c => c.movie.id);
            const fresh = new Set(collectedIds.filter(id => !lastSeenIdsStore.has(id)));
            setNewIds(fresh);
            collectedIds.forEach(id => lastSeenIdsStore.add(id));
            setView('explore');
          }}>
            <Text style={styles.exploreBtnText}>explore</Text>
          </Pressable>

          {/* Stats (75+ ranked) */}
          {stats && (
            <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.statsCard}>
              <Text style={styles.statsHeading}>your taste profile</Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>contrarian score</Text>
                <Text style={styles.statValue}>{stats.contrarian}</Text>
              </View>

              {stats.hotTake && stats.hotTake.deviation !== null && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>hot take</Text>
                  <Text style={styles.statValueSm} numberOfLines={1}>
                    {stats.hotTake.movie.title} ↑{Math.abs(stats.hotTake.deviation!)}
                  </Text>
                </View>
              )}

              {stats.coldTake && stats.coldTake.deviation !== null && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>cold take</Text>
                  <Text style={styles.statValueSm} numberOfLines={1}>
                    {stats.coldTake.movie.title} ↓{stats.coldTake.deviation!}
                  </Text>
                </View>
              )}

              {stats.blindspotDecade && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>blindspot decade</Text>
                  <Text style={styles.statValue}>{stats.blindspotDecade}</Text>
                </View>
              )}

              {stats.blindspotGenre && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>blindspot genre</Text>
                  <Text style={styles.statValue}>{stats.blindspotGenre}</Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Share */}
          <Pressable style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>share</Text>
          </Pressable>
        </ScrollView>

        {/* Off-screen ViewShot for share capture */}
        {Platform.OS !== 'web' && isCapturing && (
          <View style={styles.captureWrapper}>
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, width: 1080, height: 1080 }}>
              <View style={styles.shareCanvas}>
                <Text style={styles.shareTitle}>aaybee 100</Text>
                {renderGrid(true)}
                {stats && <Text style={styles.shareScore}>contrarian score: {stats.contrarian}</Text>}
                <Text style={styles.shareBrand}>aaybee</Text>
              </View>
            </ViewShot>
          </View>
        )}
      </View>
    );
  }

  // ==============================
  // EXPLORE VIEW
  // ==============================
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.exploreHeader}>
        <Pressable onPress={() => { setFilterMode('all'); setView('home'); }} hitSlop={8} style={styles.backBtn} accessibilityLabel="Back to home" accessibilityRole="button">
          <BackIcon />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
            {(['global', 'yours', 'deviation', 'genre', 'decade'] as SortMode[]).map(m => (
              <Pressable
                key={m}
                style={[styles.sortChip, sortMode === m && styles.sortChipActive]}
                onPress={() => setSortMode(m)}
                accessibilityLabel={`Sort by ${m === 'global' ? 'global rank' : m === 'yours' ? 'your rank' : m}`}
                accessibilityRole="button"
                accessibilityState={{ selected: sortMode === m }}
              >
                <Text style={[styles.sortChipText, sortMode === m && styles.sortChipTextActive]}>
                  {m === 'global' ? 'global rank' : m === 'yours' ? 'your rank' : m}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(['all', 'hot', 'cold', 'consensus', 'not-seen'] as FilterMode[]).map(f => (
              <Pressable
                key={f}
                style={[styles.sortChip, filterMode === f && styles.filterChipActive]}
                onPress={() => { setFilterMode(f); setSelectedIndex(null); }}
                accessibilityLabel={`Filter ${f === 'not-seen' ? 'unseen' : f}`}
                accessibilityRole="button"
                accessibilityState={{ selected: filterMode === f }}
              >
                <Text style={[styles.sortChipText, filterMode === f && styles.filterChipTextActive]}>
                  {f === 'not-seen' ? 'unseen' : f}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Poster grid */}
      {sortedCells.length === 0 ? (
        <View style={styles.emptyFilter}>
          <Text style={styles.emptyFilterText}>no movies match</Text>
        </View>
      ) : (
        <FlatList
          data={sortedCells}
          keyExtractor={item => item.movie.id}
          numColumns={5}
          contentContainerStyle={styles.posterGridContent}
          columnWrapperStyle={styles.posterRow}
          initialNumToRender={15}
          windowSize={5}
          renderItem={({ item: cell, index: idx }) => {
            const collected = isCollected(cell.state);
            const circleSize = Math.round(posterWidth * 0.42);
            return (
              <Pressable
                onPress={() => {
                  if (collected) {
                    setSelectedIndex(idx);
                  }
                }}
                style={[styles.posterItem, { width: posterWidth }]}
                accessibilityLabel={`${cell.movie.title}, rank ${cell.globalRank + 1}${cell.state === 'not-seen' ? ', not seen' : cell.state === 'unknown' ? ', not ranked' : ''}`}
                accessibilityRole="button"
              >
                <View style={[styles.posterBorder, { borderColor: getCellColor(cell.state, cell.deviation, rankedCount), height: posterWidth * 1.5 }]}>
                  {collected ? (
                    // Collected — show poster (dimmed if not-seen)
                    <>
                      {cell.movie.posterUrl ? (
                        <Image source={{ uri: cell.movie.posterUrl }} style={styles.posterImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.posterImg, { backgroundColor: cell.movie.posterColor || colors.surface }]}>
                          <Text style={styles.posterFallback}>{cell.movie.title.slice(0, 2)}</Text>
                        </View>
                      )}
                      {cell.state === 'not-seen' && <View style={styles.notSeenDim} />}
                      {/* New dot for recently collected */}
                      {newIds.has(cell.movie.id) && (
                        <View style={[styles.newDot, { backgroundColor: getCellColor(cell.state, cell.deviation, rankedCount) }]} />
                      )}
                    </>
                  ) : (
                    // Locked — dark background
                    <View style={[styles.posterImg, styles.lockedPoster, { backgroundColor: cell.movie.posterColor ? cell.movie.posterColor + '15' : colors.surface }]} />
                  )}

                  {/* Centered rank circle overlay */}
                  <View style={styles.rankCircleWrapper}>
                    <View style={[styles.rankCircle, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }]}>
                      {cell.state === 'not-seen' ? (
                        <EyeSlashIcon size={circleSize * 0.5} color={colors.textMuted} />
                      ) : (
                        <Text style={[styles.rankCircleText, { fontSize: circleSize * 0.38 }]}>
                          {cell.globalRank + 1}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Detail modal overlay — only for collected movies */}
      {selectedCell && isCollected(selectedCell.state) && (() => {
        const prevIdx = prevCollectedIndex(selectedIndex);
        const nextIdx = nextCollectedIndex(selectedIndex);
        return (
        <View style={styles.detailOverlay} accessibilityRole="none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedIndex(null)} accessibilityLabel="Close details" />
          <View style={styles.detailCard} accessibilityRole="summary">
            <Pressable style={styles.detailClose} onPress={() => setSelectedIndex(null)} hitSlop={8} accessibilityLabel="Close" accessibilityRole="button">
              <CloseIcon size={20} />
            </Pressable>

            {selectedCell.movie.posterUrl ? (
              <Image source={{ uri: selectedCell.movie.posterUrl }} style={styles.detailPoster} resizeMode="cover" accessibilityLabel={`${selectedCell.movie.title} poster`} />
            ) : (
              <View style={[styles.detailPoster, { backgroundColor: selectedCell.movie.posterColor || colors.surface }]}>
                <Text style={styles.posterFallback}>{selectedCell.movie.title.slice(0, 2)}</Text>
              </View>
            )}

            <Text style={styles.detailTitle}>{selectedCell.movie.title}</Text>
            <Text style={styles.detailYear}>{selectedCell.movie.year}</Text>

            {wittyTake ? (
              <Text style={[styles.wittyTake, { color: wittyTake.color }]}>
                {wittyTake.text}
              </Text>
            ) : selectedCell.state === 'not-seen' ? (
              <Text style={[styles.wittyTake, { color: colors.textMuted }]}>
                haven't seen this one
              </Text>
            ) : null}

            {/* Navigation — skips uncollected movies */}
            <View style={styles.detailNav}>
              <Pressable
                style={[styles.navBtn, prevIdx === null && styles.navBtnDisabled]}
                onPress={() => { if (prevIdx !== null) setSelectedIndex(prevIdx); }}
                disabled={prevIdx === null}
                accessibilityLabel="Previous movie"
                accessibilityRole="button"
              >
                <ChevronIcon direction="left" color={prevIdx === null ? colors.textMuted : colors.textPrimary} />
              </Pressable>
              <Text style={styles.navCount} accessibilityLabel={`Movie ${collectedIndexOf(selectedIndex) + 1} of ${collectedCount}`}>
                {collectedCount > 0 ? `${collectedIndexOf(selectedIndex) + 1} / ${collectedCount}` : ''}
              </Text>
              <Pressable
                style={[styles.navBtn, nextIdx === null && styles.navBtnDisabled]}
                onPress={() => { if (nextIdx !== null) setSelectedIndex(nextIdx); }}
                disabled={nextIdx === null}
                accessibilityLabel="Next movie"
                accessibilityRole="button"
              >
                <ChevronIcon direction="right" color={nextIdx === null ? colors.textMuted : colors.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>
        );
      })()}
    </View>
  );
}

// ============================================
// Styles
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // -- Home view --
  homeContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  closeButton: {
    padding: spacing.xs,
  },
  gridWrapper: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  progress: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  exploreBtn: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exploreBtnText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },

  // -- Stats --
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsHeading: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  statValue: {
    ...typography.stat,
    color: colors.textPrimary,
  },
  statValueSm: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'right',
  },

  // -- Share --
  shareBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  shareBtnText: {
    ...typography.bodyMedium,
    color: colors.background,
  },
  captureWrapper: {
    position: 'absolute',
    left: -9999,
    top: -9999,
  },
  shareCanvas: {
    width: 1080,
    height: 1080,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 54,
  },
  shareTitle: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 40,
    letterSpacing: -1,
  },
  shareScore: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 32,
  },
  shareBrand: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 24,
    letterSpacing: -1.5,
  },

  // -- Explore view --
  exploreHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
    marginTop: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.success + '20',
    borderColor: colors.success,
  },
  filterChipTextActive: {
    color: colors.success,
    fontWeight: '600',
  },
  sortChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.round,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  sortChipText: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  sortChipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  posterGridContent: {
    padding: spacing.lg,
  },
  posterRow: {
    justifyContent: 'space-between',
  },
  posterItem: {
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  posterBorder: {
    borderWidth: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    width: '100%',
  },
  posterImg: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankCircleWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankCircle: {
    backgroundColor: 'rgba(19, 17, 28, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankCircleText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  notSeenDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(19, 17, 28, 0.55)',
  },
  newDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  lockedPoster: {
    borderWidth: 0,
  },
  posterFallback: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  emptyFilter: {
    width: '100%',
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  emptyFilterText: {
    ...typography.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  // -- Detail modal --
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    width: '85%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailClose: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
    zIndex: 10,
  },
  detailPoster: {
    width: 120,
    height: 180,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  detailYear: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  wittyTake: {
    ...typography.bodyMedium,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: spacing.lg,
  },
  detailNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  navBtn: {
    padding: spacing.sm,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
