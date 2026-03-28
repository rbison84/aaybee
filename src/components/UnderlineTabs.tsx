import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '../theme/cinematic';

interface Tab<T extends string> {
  key: T;
  label: string;
  badge?: number;
}

interface UnderlineTabsProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  onTabPress: (tab: T) => void;
}

export function UnderlineTabs<T extends string>({
  tabs,
  activeTab,
  onTabPress,
}: UnderlineTabsProps<T>) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
          >
            <View style={styles.tabContent}>
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tab.badge !== undefined && tab.badge > 0 && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                    {tab.badge}
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.underline, isActive && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: spacing.md,
  },
  tabText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: spacing.md,
    right: spacing.md,
    height: 2,
    backgroundColor: 'transparent',
    borderRadius: 1,
  },
  underlineActive: {
    backgroundColor: colors.accent,
  },
  badge: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeActive: {
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: colors.background,
  },
});
