import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CloseIcon, BackIcon } from './icons';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';

interface HeaderBarProps {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
}

/**
 * Standardized header bar for screens/sub-screens.
 * - onBack: shows back arrow on the left
 * - onClose: shows X button on the right
 * - Both can be provided (back left, close right)
 * - Neither: just a title
 */
export function HeaderBar({ title, onClose, onBack }: HeaderBarProps) {
  return (
    <View style={styles.container}>
      {onBack ? (
        <Pressable style={styles.button} onPress={onBack}>
          <BackIcon size={22} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}

      <Text style={styles.title}>{title}</Text>

      {onClose ? (
        <Pressable style={styles.button} onPress={onClose}>
          <CloseIcon size={22} />
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    flex: 1,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacer: {
    width: 36,
  },
});
