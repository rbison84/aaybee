import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CinematicBackground } from '../components/cinematic';
import { YourRankingTab } from '../components/rankings/YourRankingTab';

type FilterType = 'classic' | 'top25' | 'all';

interface UnifiedRankingsScreenProps {
  onContinueComparing?: () => void;
  onOpenAaybee100?: () => void;
  initialTab?: string;
  initialFilter?: FilterType;
}

export function UnifiedRankingsScreen({
  onContinueComparing,
  initialFilter = 'classic',
}: UnifiedRankingsScreenProps) {
  return (
    <CinematicBackground>
      <View style={styles.container}>
        <YourRankingTab
          onContinueComparing={onContinueComparing}
          initialFilter={initialFilter}
        />
      </View>
    </CinematicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default UnifiedRankingsScreen;
