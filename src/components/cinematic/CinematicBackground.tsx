import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/cinematic';

interface CinematicBackgroundProps {
  children: React.ReactNode;
}

export function CinematicBackground({ children }: CinematicBackgroundProps) {
  return (
    <View style={styles.container}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
