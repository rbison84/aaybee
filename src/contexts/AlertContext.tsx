import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { useAppDimensions } from './DimensionsContext';

// ============================================
// TYPES
// ============================================

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

// ============================================
// CONTEXT
// ============================================

const AlertContext = createContext<AlertContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export function AlertProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const { isConstrained, height: appHeight } = useAppDimensions();

  // On constrained web (desktop), use the phone frame's content area height
  const effectiveHeight = isConstrained ? Math.round(appHeight * 0.9) : windowHeight;

  const showAlert = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
    setConfig({ title, message, buttons });
    setVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setVisible(false);
    setTimeout(() => setConfig(null), 300);
  }, []);

  const handleButtonPress = useCallback((button: AlertButton) => {
    hideAlert();
    // Call onPress after a small delay to allow animation
    if (button.onPress) {
      setTimeout(() => button.onPress?.(), 100);
    }
  }, [hideAlert]);

  // Default OK button if no buttons provided
  const buttons = config?.buttons?.length ? config.buttons : [{ text: 'ok', style: 'default' as const }];

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={hideAlert}
      >
        <View style={styles.modalRoot}>
          {/* Backdrop */}
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={hideAlert} />
          </View>

          {/* Content — absolutely positioned, centered */}
          <View
            style={[styles.contentPositioner, { height: effectiveHeight }]}
            pointerEvents="box-none"
          >
            <View style={styles.alertContainer}>
              <Text style={styles.title}>{config?.title}</Text>

              {config?.message && (
                <Text style={styles.message}>{config.message}</Text>
              )}

              <View style={styles.buttonContainer}>
                {buttons.map((button, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.button,
                      button.style === 'destructive' && styles.buttonDestructive,
                      button.style === 'cancel' && styles.buttonCancel,
                      buttons.length === 1 && styles.buttonFull,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        button.style === 'destructive' && styles.buttonTextDestructive,
                        button.style === 'cancel' && styles.buttonTextCancel,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  contentPositioner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    ...(Platform.OS === 'web' ? {
      maxWidth: 430,
      alignSelf: 'center' as const,
      width: '100%' as any,
    } : {}),
  },
  alertContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDestructive: {
    backgroundColor: '#E57373',
  },
  buttonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
  buttonTextCancel: {
    color: colors.textSecondary,
  },
  buttonTextDestructive: {
    color: '#FFFFFF',
  },
});
