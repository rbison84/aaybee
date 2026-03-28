import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  Pressable,
  Share,
  Platform,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { useHaptics } from '../../hooks/useHaptics';
import { useRecommendationTracking } from '../../contexts/RecommendationTrackingContext';
import { useAlert } from '../../contexts/AlertContext';
import { useDevSettings } from '../../contexts/DevSettingsContext';
import { useAppDimensions } from '../../contexts/DimensionsContext';
import { getCurrentTier } from '../../utils/pairSelector';
import { triggerDailyRefresh } from '../../screens/DailyScreen';

// Conditionally import Accelerometer only on native
let Accelerometer: any = null;
if (Platform.OS !== 'web') {
  Accelerometer = require('expo-sensors').Accelerometer;
}

interface DebugPanelProps {
  visible: boolean;
  onClose: () => void;
}

// Shake detection threshold
const SHAKE_THRESHOLD = 1.5;

function PoolSection({ movies, userSession, totalComparisons }: {
  movies: Map<string, any>;
  userSession: any;
  totalComparisons: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const allMovies = Array.from(movies.values());
  const currentTier = getCurrentTier(totalComparisons, userSession.poolUnlockedTier);

  // Eligible pool: movies the pair selector can pick from
  const eligible = allMovies.filter(m =>
    m.status !== 'unknown' &&
    (m.tier || 1) <= currentTier
  );
  const uncompared = eligible.filter(m => m.status === 'uncompared');
  const known = eligible.filter(m => m.status === 'known');

  // Tier breakdown of eligible pool
  const tierCounts: Record<number, { total: number; uncompared: number }> = {};
  for (let t = 1; t <= 4; t++) {
    const tierMovies = eligible.filter(m => (m.tier || 1) === t);
    tierCounts[t] = {
      total: tierMovies.length,
      uncompared: tierMovies.filter(m => m.status === 'uncompared').length,
    };
  }

  // Promoted movies (sourceTier differs from tier)
  const promoted = allMovies.filter(m => m.sourceTier && m.sourceTier !== m.tier);

  // Sort uncompared by tier then title for the expanded list
  const sortedUncompared = [...uncompared].sort((a, b) => {
    const tierDiff = (a.tier || 1) - (b.tier || 1);
    if (tierDiff !== 0) return tierDiff;
    return a.title.localeCompare(b.title);
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Eligible Pool</Text>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Current Tier:</Text>
        <Text style={styles.statValue}>{currentTier}</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Pool Unlocked Tier:</Text>
        <Text style={styles.statValue}>{userSession.poolUnlockedTier || 1}</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Eligible (non-unknown, ≤ tier):</Text>
        <Text style={styles.statValue}>{eligible.length}</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Uncompared in pool:</Text>
        <Text style={[styles.statValue, uncompared.length < 30 && styles.dangerText]}>
          {uncompared.length}{uncompared.length < 30 ? ' (LOW)' : ''}
        </Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>Known in pool:</Text>
        <Text style={styles.statValue}>{known.length}</Text>
      </View>
      {promoted.length > 0 && (
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Promoted from higher tier:</Text>
          <Text style={[styles.statValue, { color: '#f59e0b' }]}>{promoted.length}</Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 12, marginBottom: 8 }]}>By Tier</Text>
      {[1, 2, 3, 4].map(t => (
        tierCounts[t].total > 0 ? (
          <View key={t} style={styles.statRow}>
            <Text style={styles.statLabel}>Tier {t}:</Text>
            <Text style={styles.statValue}>
              {tierCounts[t].total} total, {tierCounts[t].uncompared} uncompared
            </Text>
          </View>
        ) : null
      ))}

      <Pressable
        style={[styles.button, { marginTop: 12, paddingVertical: 8 }]}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.buttonText}>
          {expanded ? 'Hide' : 'Show'} Uncompared Movies ({uncompared.length})
        </Text>
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 8, maxHeight: 300 }}>
          <ScrollView nestedScrollEnabled>
            {sortedUncompared.map(m => (
              <View key={m.id} style={[styles.statRow, { marginBottom: 2 }]}>
                <Text style={[styles.statLabel, { flex: 1 }]} numberOfLines={1}>
                  {m.title} ({m.year})
                </Text>
                <Text style={[styles.statValue, {
                  color: (m.tier || 1) === 1 ? '#22c55e' :
                         (m.tier || 1) === 2 ? '#3b82f6' :
                         (m.tier || 1) === 3 ? '#f59e0b' : '#ef4444',
                  minWidth: 30,
                  textAlign: 'right',
                }]}>
                  T{m.tier || 1}{m.sourceTier ? ` (←T${m.sourceTier})` : ''}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export function DebugPanel({ visible, onClose }: DebugPanelProps) {
  const {
    userSession,
    movies,
    comparisonHistory,
    totalComparisons,
    getStats,
    getRankedMovies,
    resetAllData,
    exportData,
  } = useAppStore();
  const haptics = useHaptics();
  const { resetTracking } = useRecommendationTracking();
  const { showAlert } = useAlert();
  const { showSelectionLogic, toggleSelectionLogic, unlockAllFeatures, toggleUnlockAllFeatures } = useDevSettings();
  const { height: windowHeight } = useWindowDimensions();
  const { isConstrained, height: appHeight } = useAppDimensions();
  const effectiveHeight = isConstrained ? Math.round(appHeight * 0.9) : windowHeight;

  const stats = getStats();
  const rankedMovies = getRankedMovies();
  const topMovie = rankedMovies[0];

  // Get last comparison details
  const lastComparison = comparisonHistory[comparisonHistory.length - 1];
  const lastMovieA = lastComparison ? movies.get(lastComparison.movieAId) : null;
  const lastMovieB = lastComparison ? movies.get(lastComparison.movieBId) : null;

  // Calculate algorithm metrics
  const allMovies = Array.from(movies.values());
  const comparedMovies = allMovies.filter(m => m.totalComparisons > 0);
  const avgComparisonsPerMovie = comparedMovies.length > 0
    ? comparedMovies.reduce((sum, m) => sum + m.totalComparisons, 0) / comparedMovies.length
    : 0;

  // Learning rate decreases as we get more data
  const learningRate = 0.4 / (1 + totalComparisons * 0.01);

  // Handle reset all data
  const handleResetAll = useCallback(() => {
    showAlert(
      'Reset All Data',
      'This will delete ALL your data including rankings, comparisons, and preferences. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            haptics.heavy();
            await resetAllData();
            await resetTracking();
            onClose();
          },
        },
      ]
    );
  }, [haptics, resetAllData, resetTracking, onClose, showAlert]);

  // Handle reset session only (keep movie rankings)
  const handleResetSession = useCallback(() => {
    showAlert(
      'Reset Session',
      'This will reset your session stats but keep movie rankings. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Session',
          style: 'destructive',
          onPress: () => {
            haptics.medium();
            showAlert('Info', 'Session reset not implemented yet - use Reset All Data instead');
          },
        },
      ]
    );
  }, [haptics, showAlert]);

  // Handle export data
  const handleExport = useCallback(async () => {
    haptics.medium();
    try {
      const data = await exportData();
      if (Platform.OS === 'web') {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data);
        }
      } else {
        await Share.share({ message: data, title: 'Aaybee Debug Export' });
      }
    } catch (error) {
      console.error('Export failed:', error);
      showAlert('Export Failed', 'Could not export data');
    }
  }, [haptics, exportData]);

  // Handle reset daily data
  const [dailyResetDone, setDailyResetDone] = useState(false);
  const handleResetDaily = useCallback(async () => {
    haptics.medium();
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.removeItem('@aaybee/daily_streak');
    await AsyncStorage.removeItem('@aaybee/daily_session');
    await AsyncStorage.removeItem('@aaybee/daily_collections');
    triggerDailyRefresh();
    setDailyResetDone(true);
    setTimeout(() => setDailyResetDone(false), 2000);
  }, [haptics]);

  const formatBeta = (beta: number) => beta >= 0 ? `+${beta.toFixed(2)}` : beta.toFixed(2);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <View style={styles.backdrop} />
        <View style={[styles.panel, { height: effectiveHeight }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>DEBUG PANEL</Text>
            <Text style={styles.version}>v1.0.0</Text>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Session Stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Session Stats</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total Comparisons:</Text>
                <Text style={styles.statValue}>{totalComparisons}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Consecutive Skips:</Text>
                <Text style={styles.statValue}>{userSession.consecutiveSkips}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Onboarding:</Text>
                <Text style={[styles.statValue, userSession.onboardingComplete && styles.success]}>
                  {userSession.onboardingComplete ? 'Complete ✓' : 'Pending...'}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Birth Decade:</Text>
                <Text style={styles.statValue}>
                  {userSession.preferences.birthDecade ? `${userSession.preferences.birthDecade}s` : 'Not set'}
                </Text>
              </View>
            </View>

            {/* Movie Status Counts */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Movie Status Counts</Text>
              <View style={styles.statusGrid}>
                <View style={styles.statusItem}>
                  <Text style={styles.statusCount}>{stats.uncompared}</Text>
                  <Text style={styles.statusLabel}>Uncompared</Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={[styles.statusCount, styles.knownColor]}>{stats.known}</Text>
                  <Text style={styles.statusLabel}>Known</Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={[styles.statusCount, styles.uncertainColor]}>{stats.uncertain}</Text>
                  <Text style={styles.statusLabel}>Uncertain</Text>
                </View>
                <View style={styles.statusItem}>
                  <Text style={[styles.statusCount, styles.unknownColor]}>{stats.unknown}</Text>
                  <Text style={styles.statusLabel}>Unknown</Text>
                </View>
              </View>
            </View>

            {/* Last Comparison */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Last Comparison</Text>
              {lastComparison && lastMovieA && lastMovieB ? (
                <>
                  <View style={styles.comparisonRow}>
                    <Text style={styles.movieName}>{lastMovieA.emoji} {lastMovieA.title}</Text>
                    <Text style={styles.betaValue}>(β: {lastMovieA.beta.toFixed(2)})</Text>
                  </View>
                  <Text style={styles.vsLabel}>vs</Text>
                  <View style={styles.comparisonRow}>
                    <Text style={styles.movieName}>{lastMovieB.emoji} {lastMovieB.title}</Text>
                    <Text style={styles.betaValue}>(β: {lastMovieB.beta.toFixed(2)})</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Choice:</Text>
                    <Text style={styles.resultValue}>
                      {lastComparison.choice === 'skip'
                        ? 'Skipped'
                        : lastComparison.choice === 'A'
                          ? lastMovieA.title
                          : lastMovieB.title}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Beta Changes:</Text>
                    <Text style={styles.resultValue}>
                      {formatBeta(lastComparison.movieABetaAfter - lastComparison.movieABetaBefore)} / {formatBeta(lastComparison.movieBBetaAfter - lastComparison.movieBBetaBefore)}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Status:</Text>
                    <Text style={styles.resultValue}>
                      {lastMovieA.status} / {lastMovieB.status}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.emptyText}>No comparisons yet</Text>
              )}
            </View>

            {/* Algorithm Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Algorithm Metrics</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Current K Factor:</Text>
                <Text style={styles.statValue}>{learningRate.toFixed(3)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Avg Comparisons/Movie:</Text>
                <Text style={styles.statValue}>{avgComparisonsPerMovie.toFixed(1)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Movies Compared:</Text>
                <Text style={styles.statValue}>{comparedMovies.length} / {stats.total}</Text>
              </View>
              {topMovie && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Top Movie:</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {topMovie.emoji} {topMovie.title} (β: {topMovie.beta.toFixed(2)})
                  </Text>
                </View>
              )}
            </View>

            {/* Eligible Pool */}
            <PoolSection movies={movies} userSession={userSession} totalComparisons={totalComparisons} />

            {/* Genre Scores */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Genre Preferences</Text>
              <View style={styles.genreGrid}>
                {Object.entries(userSession.preferences.genreScores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([genre, score]) => (
                    <View key={genre} style={styles.genreItem}>
                      <Text style={styles.genreName}>{genre}</Text>
                      <Text style={[
                        styles.genreScore,
                        score > 0 && styles.positiveScore,
                        score < 0 && styles.negativeScore,
                      ]}>
                        {score > 0 ? '+' : ''}{score}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>

            {/* Dev Toggles */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dev Toggles</Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Show Selection Logic</Text>
                  <Text style={styles.toggleDescription}>
                    Display era, tier, TMDB rating, and pair selection reason on comparison screen
                  </Text>
                </View>
                <Switch
                  value={showSelectionLogic}
                  onValueChange={toggleSelectionLogic}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(59,130,246,0.5)' }}
                  thumbColor={showSelectionLogic ? '#3b82f6' : '#666'}
                />
              </View>
              <View style={[styles.toggleRow, { marginTop: 16 }]}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Unlock All Features</Text>
                  <Text style={styles.toggleDescription}>
                    Bypass comparison thresholds — unlock rankings, discover, taste profile, and all tiers
                  </Text>
                </View>
                <Switch
                  value={unlockAllFeatures}
                  onValueChange={toggleUnlockAllFeatures}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(34,197,94,0.5)' }}
                  thumbColor={unlockAllFeatures ? '#22c55e' : '#666'}
                />
              </View>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
              <Pressable style={styles.button} onPress={handleExport}>
                <Text style={styles.buttonText}>Export Data JSON</Text>
              </Pressable>
              <Pressable style={[styles.button, dailyResetDone ? styles.successButton : styles.warningButton]} onPress={handleResetDaily}>
                <Text style={[styles.buttonText, dailyResetDone ? styles.successText : styles.warningText]}>
                  {dailyResetDone ? 'Daily Reset \u2713' : 'Reset Aaybee Daily'}
                </Text>
              </Pressable>
              <Pressable style={[styles.button, styles.warningButton]} onPress={handleResetSession}>
                <Text style={[styles.buttonText, styles.warningText]}>Reset Session Only</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.dangerButton]} onPress={handleResetAll}>
                <Text style={[styles.buttonText, styles.dangerText]}>Reset All Data</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.closeButton]} onPress={onClose}>
                <Text style={[styles.buttonText, styles.closeText]}>Close Debug Panel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


// Hook for shake detection (native only - no-op on web)
export function useShakeDetection(onShake: () => void) {
  const [lastShake, setLastShake] = useState(0);

  useEffect(() => {
    // Shake detection only works on native platforms
    if (Platform.OS === 'web' || !Accelerometer) {
      return;
    }

    let subscription: any = null;

    const setupAccelerometer = async () => {
      try {
        await Accelerometer.setUpdateInterval(100);
        subscription = Accelerometer.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
          const totalForce = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();

          if (totalForce > SHAKE_THRESHOLD && now - lastShake > 1000) {
            setLastShake(now);
            onShake();
          }
        });
      } catch (error) {
        console.log('Accelerometer not available:', error);
      }
    };

    setupAccelerometer();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [onShake, lastShake]);
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a12',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      maxWidth: 430,
      alignSelf: 'center' as const,
      width: '100%' as any,
    } : {}),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  version: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  content: {
    flex: 1,
    padding: 16,
  },

  // Sections
  section: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Stats
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    maxWidth: '50%',
  },
  success: {
    color: '#22c55e',
  },

  // Status grid
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: {
    alignItems: 'center',
    flex: 1,
  },
  statusCount: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  statusLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  knownColor: {
    color: '#22c55e',
  },
  uncertainColor: {
    color: '#f59e0b',
  },
  unknownColor: {
    color: '#ef4444',
  },

  // Comparison
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  movieName: {
    fontSize: 13,
    color: '#fff',
    flex: 1,
  },
  betaValue: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 8,
  },
  vsLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginVertical: 4,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  resultLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  resultValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },

  // Genre grid
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  genreName: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'capitalize',
    marginRight: 6,
  },
  genreScore: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  positiveScore: {
    color: '#22c55e',
  },
  negativeScore: {
    color: '#ef4444',
  },

  // Controls
  controls: {
    marginTop: 8,
    gap: 10,
  },
  button: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  warningButton: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  warningText: {
    color: '#f59e0b',
  },
  successButton: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  successText: {
    color: '#22c55e',
  },
  dangerButton: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  dangerText: {
    color: '#ef4444',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  closeText: {
    color: 'rgba(255,255,255,0.7)',
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 15,
  },
});
