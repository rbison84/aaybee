import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { colors, spacing, typography } from '../../theme/cinematic';
import { GhostHand } from './GhostHand';

interface SwipeTutorialOverlayProps {
  phase: 'swipe-hint' | 'undo-hint' | 'confirmation';
  instructionText: string;
  confirmationText: string;
  gestureDirection: 'left' | 'up';
  gestureTargetPosition?: 'left' | 'right';
}

export function SwipeTutorialOverlay({
  phase,
  instructionText,
  confirmationText,
  gestureDirection,
  gestureTargetPosition = 'left',
}: SwipeTutorialOverlayProps) {
  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      pointerEvents="box-none"
    >
      {/* Semi-transparent backdrop */}
      <View style={styles.backdrop} pointerEvents="none" />

      {phase === 'swipe-hint' && (
        <Animated.View
          style={styles.content}
          entering={FadeIn.duration(300)}
          pointerEvents="none"
        >
          <Text style={styles.instructionText}>{instructionText}</Text>
          <View style={[
            styles.ghostHandContainer,
            gestureTargetPosition === 'right' ? styles.ghostHandRight : styles.ghostHandLeft,
          ]}>
            <GhostHand direction={gestureDirection} />
          </View>
        </Animated.View>
      )}

      {phase === 'undo-hint' && (
        <Animated.View
          style={styles.content}
          entering={FadeIn.duration(300)}
          pointerEvents="none"
        >
          <Text style={styles.instructionText}>{instructionText}</Text>
        </Animated.View>
      )}

      {phase === 'confirmation' && (
        <Animated.View
          style={styles.content}
          entering={FadeIn.duration(300)}
          pointerEvents="none"
        >
          <Text style={styles.confirmationText}>{confirmationText}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  instructionText: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  confirmationText: {
    ...typography.h2,
    color: colors.success,
    textAlign: 'center',
  },
  ghostHandContainer: {
    position: 'absolute',
    bottom: '40%',
  },
  ghostHandLeft: {
    left: '20%',
  },
  ghostHandRight: {
    right: '20%',
  },
});
