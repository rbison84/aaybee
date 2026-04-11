import React, { useState, Suspense } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { useAppStore } from '../store/useAppStore';
import { useLockedFeature } from '../contexts/LockedFeatureContext';
import { useDevSettings } from '../contexts/DevSettingsContext';
import { useHaptics } from '../hooks/useHaptics';
import { HeaderBar } from '../components/HeaderBar';
import { SettingsIcon, StarIcon, ChevronRightIcon } from '../components/icons';
import { CinematicButton } from '../components/cinematic';
import { SettingsScreen } from './SettingsScreen';
import { TasteProfileScreen } from './TasteProfileScreen';

const UnifiedRankingsScreen = React.lazy(() => import('./UnifiedRankingsScreen').then(m => ({ default: m.UnifiedRankingsScreen })));

const MIN_COMPARISONS_FOR_TASTE_PROFILE = 0;

interface ProfileScreenProps {
  onOpenDebug?: () => void;
  onClose?: () => void;
  isGuestMode?: boolean;
  onOpenAuth?: () => void;
  onOpenTv?: () => void;
  onOpenAaybee100?: () => void;
}

export function ProfileScreen({ onOpenDebug, onClose, isGuestMode, onOpenAuth, onOpenTv, onOpenAaybee100 }: ProfileScreenProps) {
  const { postOnboardingComparisons } = useAppStore();
  const { showLockedFeature } = useLockedFeature();
  const { unlockAllFeatures } = useDevSettings();
  const haptics = useHaptics();
  const [showSettings, setShowSettings] = useState(false);
  const [showTasteProfile, setShowTasteProfile] = useState(false);
  const [showRankings, setShowRankings] = useState(false);
  const [rankingsInitialTab, setRankingsInitialTab] = useState<'yours' | 'friends' | 'global'>('yours');
  const [rankingsInitialFilter, setRankingsInitialFilter] = useState<'classic' | 'top25' | 'all'>('classic');

  const isTasteProfileLocked = isGuestMode || (unlockAllFeatures ? false : postOnboardingComparisons < MIN_COMPARISONS_FOR_TASTE_PROFILE);
  const tasteProfileRemaining = MIN_COMPARISONS_FOR_TASTE_PROFILE - postOnboardingComparisons;

  const handleTasteProfilePress = () => {
    if (isGuestMode) {
      haptics.light();
      showLockedFeature({
        feature: 'taste profile',
        requirement: 'create an account to see your taste profile',
      });
      return;
    }
    if (isTasteProfileLocked) {
      haptics.light();
      showLockedFeature({
        feature: 'taste profile',
        requirement: `compare ${tasteProfileRemaining} more movie${tasteProfileRemaining !== 1 ? 's' : ''} to unlock your taste profile`,
        progress: {
          current: postOnboardingComparisons,
          required: MIN_COMPARISONS_FOR_TASTE_PROFILE,
        },
      });
    } else {
      setShowTasteProfile(true);
    }
  };

  if (showTasteProfile) {
    return (
      <TasteProfileScreen
        onClose={() => setShowTasteProfile(false)}
      />
    );
  }

  if (showSettings) {
    return (
      <SettingsScreen
        onClose={() => setShowSettings(false)}
        onOpenDebug={onOpenDebug}
      />
    );
  }

  if (showRankings) {
    return (
      <Suspense fallback={
        <View style={styles.container}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      }>
        <UnifiedRankingsScreen
          onContinueComparing={() => setShowRankings(false)}
          onOpenAaybee100={onOpenAaybee100}
          initialTab={rankingsInitialTab}
          initialFilter={rankingsInitialFilter}
        />
      </Suspense>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderBar title="PROFILE" onClose={onClose} />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* RANKINGS BUTTON */}
          <Animated.View entering={FadeInDown.delay(50)} style={styles.settingsSection}>
            <Pressable
              style={styles.settingsButton}
              onPress={() => setShowRankings(true)}
            >
              <View style={styles.settingsLeft}>
                <Text style={{ fontSize: 16, color: colors.textSecondary }}>&#9776;</Text>
                <Text style={styles.settingsText}>RANKINGS</Text>
              </View>
              <ChevronRightIcon />
            </Pressable>
          </Animated.View>

          {/* TASTE PROFILE BUTTON */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.settingsSection}>
            <Pressable
              style={[styles.settingsButton, isTasteProfileLocked && styles.settingsButtonLocked]}
              onPress={handleTasteProfilePress}
            >
              <View style={styles.settingsLeft}>
                <StarIcon />
                <View>
                  <Text style={[styles.settingsText, isTasteProfileLocked && styles.settingsTextLocked]}>
                    TASTE PROFILE
                  </Text>
                </View>
              </View>
              {!isTasteProfileLocked && <ChevronRightIcon />}
            </Pressable>
          </Animated.View>

          {/* TRAILERS BUTTON */}
          {onOpenTv && (
            <Animated.View entering={FadeInDown.delay(150)} style={styles.settingsSection}>
              <Pressable
                style={styles.settingsButton}
                onPress={onOpenTv}
              >
                <View style={styles.settingsLeft}>
                  <SettingsIcon />
                  <Text style={styles.settingsText}>TRAILERS</Text>
                </View>
                <ChevronRightIcon />
              </Pressable>
            </Animated.View>
          )}

          {/* SETTINGS BUTTON */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.settingsSection}>
            <Pressable
              style={styles.settingsButton}
              onPress={() => setShowSettings(true)}
            >
              <View style={styles.settingsLeft}>
                <SettingsIcon />
                <Text style={styles.settingsText}>SETTINGS</Text>
              </View>
              <ChevronRightIcon />
            </Pressable>
          </Animated.View>

          {/* SIGN UP / SIGN IN BUTTON (guest mode) */}
          {isGuestMode && onOpenAuth && (
            <Animated.View entering={FadeInDown.delay(250)} style={styles.settingsSection}>
              <CinematicButton label="SIGN UP / SIGN IN" variant="primary" onPress={onOpenAuth} fullWidth />
            </Animated.View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.textMuted,
    lineHeight: 28,
  },

  // Settings button
  settingsSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  settingsButtonLocked: {
    opacity: 0.6,
  },
  settingsTextLocked: {
    opacity: 0.7,
  },
  lockedSubtext: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },

  signUpButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    justifyContent: 'center',
  },
  signUpText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomPadding: {
    height: spacing.xxxl,
  },
});
