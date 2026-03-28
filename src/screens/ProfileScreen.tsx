import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { useAppStore } from '../store/useAppStore';
import { useLockedFeature } from '../contexts/LockedFeatureContext';
import { useDevSettings } from '../contexts/DevSettingsContext';
import { useHaptics } from '../hooks/useHaptics';
import { SettingsScreen } from './SettingsScreen';
import { FriendsScreen } from './FriendsScreen';
import { TasteProfileScreen } from './TasteProfileScreen';

const MIN_COMPARISONS_FOR_TASTE_PROFILE = 100;

// Settings/gear icon
function SettingsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={colors.textSecondary} strokeWidth={2} />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={colors.textSecondary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Chevron right icon
function ChevronIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l6-6-6-6"
        stroke={colors.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Friends icon
function FriendsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="7" r="3" stroke={colors.textSecondary} strokeWidth={2} fill="none" />
      <Path
        d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6"
        stroke={colors.textSecondary}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx="16" cy="7" r="3" stroke={colors.textSecondary} strokeWidth={2} fill="none" />
      <Path
        d="M17 14c2.21 0 4 1.79 4 4v2"
        stroke={colors.textSecondary}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

// Taste Profile icon (sparkle/star)
function TasteProfileIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.8 5.6 21.2 8 14l-6-4.8h7.6L12 2z"
        stroke={colors.textSecondary}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

interface ProfileScreenProps {
  onOpenDebug?: () => void;
  onClose?: () => void;
  isGuestMode?: boolean;
  onOpenAuth?: () => void;
  onOpenVsChallenge?: (code: string) => void;
  onOpenChallenge?: () => void;
}

export function ProfileScreen({ onOpenDebug, onClose, isGuestMode, onOpenAuth, onOpenVsChallenge, onOpenChallenge }: ProfileScreenProps) {
  const { postOnboardingComparisons } = useAppStore();
  const { showLockedFeature } = useLockedFeature();
  const { unlockAllFeatures } = useDevSettings();
  const haptics = useHaptics();
  const [showSettings, setShowSettings] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showTasteProfile, setShowTasteProfile] = useState(false);

  const isTasteProfileLocked = isGuestMode || (unlockAllFeatures ? false : postOnboardingComparisons < MIN_COMPARISONS_FOR_TASTE_PROFILE);
  const isFriendsLocked = !!isGuestMode;
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

  const handleFriendsPress = () => {
    if (isFriendsLocked) {
      haptics.light();
      showLockedFeature({
        feature: 'friends',
        requirement: 'create an account to add friends',
      });
      return;
    }
    setShowFriends(true);
  };

  if (showTasteProfile) {
    return (
      <TasteProfileScreen
        onClose={() => setShowTasteProfile(false)}
      />
    );
  }

  if (showFriends) {
    return (
      <FriendsScreen
        onClose={() => setShowFriends(false)}
        onOpenVsChallenge={onOpenVsChallenge}
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>profile</Text>
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* TASTE PROFILE BUTTON */}
          <Animated.View entering={FadeInDown.delay(50)} style={styles.settingsSection}>
            <Pressable
              style={[styles.settingsButton, isTasteProfileLocked && styles.settingsButtonLocked]}
              onPress={handleTasteProfilePress}
            >
              <View style={styles.settingsLeft}>
                <TasteProfileIcon />
                <View>
                  <Text style={[styles.settingsText, isTasteProfileLocked && styles.settingsTextLocked]}>
                    taste profile
                  </Text>
                </View>
              </View>
              {!isTasteProfileLocked && <ChevronIcon />}
            </Pressable>
          </Animated.View>

          {/* FRIENDS BUTTON */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.settingsSection}>
            <Pressable
              style={[styles.settingsButton, isFriendsLocked && styles.settingsButtonLocked]}
              onPress={handleFriendsPress}
            >
              <View style={styles.settingsLeft}>
                <FriendsIcon />
                <Text style={[styles.settingsText, isFriendsLocked && styles.settingsTextLocked]}>friends</Text>
              </View>
              {!isFriendsLocked && <ChevronIcon />}
            </Pressable>
          </Animated.View>

          {/* CHALLENGE A FRIEND BUTTON */}
          {!isGuestMode && onOpenChallenge && (
            <Animated.View entering={FadeInDown.delay(125)} style={styles.settingsSection}>
              <Pressable
                style={styles.settingsButton}
                onPress={onOpenChallenge}
              >
                <View style={styles.settingsLeft}>
                  <FriendsIcon />
                  <Text style={styles.settingsText}>challenge a friend</Text>
                </View>
                <ChevronIcon />
              </Pressable>
            </Animated.View>
          )}

          {/* SETTINGS BUTTON */}
          <Animated.View entering={FadeInDown.delay(150)} style={styles.settingsSection}>
            <Pressable
              style={styles.settingsButton}
              onPress={() => setShowSettings(true)}
            >
              <View style={styles.settingsLeft}>
                <SettingsIcon />
                <Text style={styles.settingsText}>settings</Text>
              </View>
              <ChevronIcon />
            </Pressable>
          </Animated.View>

          {/* SIGN UP / SIGN IN BUTTON (guest mode) */}
          {isGuestMode && onOpenAuth && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.settingsSection}>
              <Pressable
                style={[styles.settingsButton, styles.signUpButton]}
                onPress={onOpenAuth}
              >
                <Text style={styles.signUpText}>sign up / sign in</Text>
              </Pressable>
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
