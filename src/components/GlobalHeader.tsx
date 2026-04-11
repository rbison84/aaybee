import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { SearchIcon, PersonIcon } from './icons';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

interface GlobalHeaderProps {
  onProfilePress: () => void;
  onSearchPress: () => void;
  notificationCount?: number;
}

export function GlobalHeader({ onProfilePress, onSearchPress, notificationCount = 0 }: GlobalHeaderProps) {
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();

  // Get user initial for avatar
  const userInitial = user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.content}>
        {/* Logo */}
        <Text style={styles.logo}>aaybee</Text>

        {/* Search + Profile */}
        <View style={styles.headerRight}>
          <Pressable style={styles.searchButton} onPress={onSearchPress} accessibilityLabel="Search movies">
            <SearchIcon size={20} color={colors.textMuted} />
          </Pressable>

          <Pressable style={styles.avatarButton} onPress={onProfilePress} accessibilityLabel="Profile">
            {isGuest ? (
              <View style={styles.avatarGuest}>
                <PersonIcon size={18} color={colors.textMuted} />
              </View>
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{userInitial}</Text>
                {notificationCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
                  </View>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 44,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  logo: {
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchButton: {
    padding: 6,
  },
  avatarButton: {
    padding: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  avatarGuest: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: colors.accent,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.background,
  },
});
