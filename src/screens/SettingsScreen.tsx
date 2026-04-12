import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { HeaderBar } from '../components/HeaderBar';
import { useAppStore } from '../store/useAppStore';
import { useAuth } from '../contexts/AuthContext';
import { useRecommendationTracking } from '../contexts/RecommendationTrackingContext';
import { useHaptics } from '../hooks/useHaptics';
import { useAlert } from '../contexts/AlertContext';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { openLetterboxdHome } from '../utils/letterboxd';
import { CinematicButton } from '../components/cinematic';
import { AuthScreen } from './AuthScreen';

interface SettingsScreenProps {
  onClose: () => void;
  onOpenDebug?: () => void;
}

export function SettingsScreen({ onClose, onOpenDebug }: SettingsScreenProps) {
  const { resetAllData } = useAppStore();
  const { user, isGuest, signOut } = useAuth();
  const { resetTracking } = useRecommendationTracking();
  const haptics = useHaptics();
  const { showAlert } = useAlert();
  const [showAuth, setShowAuth] = React.useState(false);

  const handleReset = () => {
    haptics.medium();
    showAlert(
      'delete everything',
      'this will delete all your rankings and comparisons. this cannot be undone.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete everything',
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
  };

  const handleSignOut = async () => {
    haptics.medium();
    showAlert(
      'sign out',
      'your local data will be kept. sign back in to sync across devices.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'sign out',
          onPress: async () => {
            const result = await signOut();
            if (!result.success) {
              showAlert('error', result.error?.message || 'failed to sign out');
            }
          },
        },
      ]
    );
  };

  if (showAuth) {
    return <AuthScreen onClose={() => setShowAuth(false)} />;
  }

  return (
    <View style={styles.safeArea}>
        {/* Header removed — persistent nav handles it */}

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Account Section */}
          <Animated.View entering={FadeInDown.delay(50)} style={styles.section}>
            <Text style={styles.sectionTitle}>account</Text>
            {isGuest ? (
              <View style={styles.guestContainer}>
                <Text style={styles.guestText}>
                  you're using guest mode. sign up to sync your rankings across devices.
                </Text>
                <CinematicButton
                  label="sign up / sign in"
                  variant="primary"
                  onPress={() => setShowAuth(true)}
                />
              </View>
            ) : (
              <View style={styles.accountContainer}>
                <View style={styles.accountRow}>
                  <Text style={styles.accountLabel}>email</Text>
                  <Text style={styles.accountValue}>{user?.email}</Text>
                </View>
                <View style={styles.accountRow}>
                  <Text style={styles.accountLabel}>status</Text>
                  <Text style={styles.syncStatus}>✓ synced across devices</Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Connections Section */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
            <Text style={styles.sectionTitle}>connections</Text>
            <Pressable style={styles.connectionRow} onPress={openLetterboxdHome}>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>letterboxd</Text>
                <Text style={styles.connectionDesc}>log and review your watched films</Text>
              </View>
              <Text style={styles.connectionArrow}>→</Text>
            </Pressable>
          </Animated.View>

          {/* Actions Section */}
          <Animated.View entering={FadeInDown.delay(150)} style={styles.section}>
            <Text style={styles.sectionTitle}>actions</Text>
            <View style={styles.actionsContainer}>
              {!isGuest && (
                <CinematicButton
                  label="sign out"
                  variant="secondary"
                  onPress={handleSignOut}
                  fullWidth
                />
              )}
              <View style={styles.actionSpacer} />
              <CinematicButton
                label="reset all data"
                variant="destructive"
                onPress={handleReset}
                fullWidth
              />
            </View>
          </Animated.View>

          {/* Developer Options */}
          {onOpenDebug && (
            <Animated.View entering={FadeInDown.delay(200)} style={styles.devSection}>
              <Pressable style={styles.devButton} onPress={onOpenDebug}>
                <Text style={styles.devButtonText}>developer options</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>aaybee v1.0.0</Text>
            <Text style={styles.footerText}>made for movie lovers</Text>
          </View>
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },

  // Sections
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },

  // Guest state
  guestContainer: {
    gap: spacing.md,
  },
  guestText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Account
  accountContainer: {
    gap: spacing.md,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  accountValue: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  syncStatus: {
    ...typography.caption,
    color: colors.success,
  },

  // Connections
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  connectionDesc: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },
  connectionArrow: {
    ...typography.body,
    color: colors.textMuted,
  },

  // Actions
  actionsContainer: {
    gap: spacing.sm,
  },
  actionSpacer: {
    height: spacing.sm,
  },

  // Developer Options
  devSection: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  devButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  devButtonText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.xs,
  },
  footerText: {
    ...typography.tiny,
    color: colors.textMuted,
  },
});
