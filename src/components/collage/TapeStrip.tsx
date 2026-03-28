import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, shadows } from '../../theme/colors';

interface TapeStripProps {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  rotation?: number;
}

export function TapeStrip({ position, rotation }: TapeStripProps) {
  // Default rotations based on position for natural look
  const defaultRotation = {
    'top-left': -35,
    'top-right': 35,
    'bottom-left': 35,
    'bottom-right': -35,
  };

  const finalRotation = rotation ?? defaultRotation[position];

  const positionStyles = {
    'top-left': { top: -8, left: -12 },
    'top-right': { top: -8, right: -12 },
    'bottom-left': { bottom: -8, left: -12 },
    'bottom-right': { bottom: -8, right: -12 },
  };

  return (
    <View
      style={[
        styles.tape,
        positionStyles[position],
        { transform: [{ rotate: `${finalRotation}deg` }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tape: {
    position: 'absolute',
    width: 55,
    height: 18,
    backgroundColor: colors.tapeLight,
    borderWidth: 1,
    borderColor: colors.tapeBorder,
    borderRadius: 2,
    ...shadows.tape,
    // Add subtle texture effect
    opacity: 0.85,
  },
});
