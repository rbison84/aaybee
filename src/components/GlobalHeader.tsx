import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

function SearchIcon({ size = 20, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function PersonIcon({ size = 18, color = colors.textMuted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={2} fill="none" />
      <Path
        d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

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
    backgroundColor: colors.tabBarBorder,
  },
  logo: {
    fontSize: 28,
    color: colors.textPrimary,
    fontWeight: '800',
    letterSpacing: -1.5,
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
    padding: 4, // Extra touch target
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.background,
  },
  avatarGuest: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    backgroundColor: colors.error,
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
    color: '#FFFFFF',
  },
});
