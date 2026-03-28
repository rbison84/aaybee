import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';
import { colors, spacing, typography } from '../theme/cinematic';
import { CinematicBackground } from '../components/cinematic';
import { UnderlineTabs } from '../components/UnderlineTabs';

// Import tab content components
import { YourRankingTab } from '../components/rankings/YourRankingTab';
import { FriendsTab } from '../components/rankings/FriendsTab';
import { GlobalTab } from '../components/rankings/GlobalTab';

// ============================================
// TYPES
// ============================================

type TabType = 'yours' | 'friends' | 'global';

const TABS: { key: TabType; label: string }[] = [
  { key: 'yours', label: 'your ranking' },
  { key: 'friends', label: "friends' picks" },
  { key: 'global', label: 'global' },
];

// ============================================
// MAIN SCREEN
// ============================================

type FilterType = 'classic' | 'top25' | 'all';

interface UnifiedRankingsScreenProps {
  onContinueComparing?: () => void;
  onOpenAaybee100?: () => void;
  initialTab?: TabType;
  initialFilter?: FilterType;
}

export function UnifiedRankingsScreen({
  onContinueComparing,
  onOpenAaybee100,
  initialTab = 'yours',
  initialFilter = 'classic',
}: UnifiedRankingsScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const handleTabPress = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'yours':
        return (
          <YourRankingTab
            onContinueComparing={onContinueComparing}
            initialFilter={initialFilter}
          />
        );
      case 'friends':
        return <FriendsTab />;
      case 'global':
        return <GlobalTab />;
      default:
        return null;
    }
  };

  return (
    <CinematicBackground>
      <View style={styles.container}>
        {/* Top Tab Bar - underline style */}
        <UnderlineTabs
          tabs={TABS}
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />

        {/* Aaybee 100 shortcut */}
        {onOpenAaybee100 && (
          <Pressable style={styles.aaybee100Button} onPress={onOpenAaybee100}>
            <Text style={styles.aaybee100Text}>aaybee 100</Text>
          </Pressable>
        )}

        {/* Tab Content */}
        <View style={styles.content}>
          {renderContent()}
        </View>
      </View>
    </CinematicBackground>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  aaybee100Button: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  aaybee100Text: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

export default UnifiedRankingsScreen;
