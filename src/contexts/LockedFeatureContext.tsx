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
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { CatMascot } from '../components/onboarding/CatMascot';
import { colors, spacing, borderRadius, typography } from '../theme/cinematic';
import { useAppDimensions } from './DimensionsContext';

// ============================================
// TYPES
// ============================================

interface LockedFeatureConfig {
  feature: string;
  requirement: string;
  progress?: {
    current: number;
    required: number;
  };
}

interface LockedFeatureContextType {
  showLockedFeature: (config: LockedFeatureConfig) => void;
}

// ============================================
// CONTEXT
// ============================================

const LockedFeatureContext = createContext<LockedFeatureContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export function LockedFeatureProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<LockedFeatureConfig | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const { isConstrained, height: appHeight } = useAppDimensions();

  const effectiveHeight = isConstrained ? Math.round(appHeight * 0.9) : windowHeight;

  const showLockedFeature = useCallback((newConfig: LockedFeatureConfig) => {
    setConfig(newConfig);
    setVisible(true);
  }, []);

  const hideModal = useCallback(() => {
    setVisible(false);
    setTimeout(() => setConfig(null), 300);
  }, []);

  return (
    <LockedFeatureContext.Provider value={{ showLockedFeature }}>
      {children}

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={hideModal}
      >
        <View style={styles.modalRoot}>
          {/* Backdrop */}
          <Animated.View
            style={styles.backdrop}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={hideModal} />
          </Animated.View>

          {/* Content — absolutely positioned, centered */}
          <View
            style={[styles.contentPositioner, { height: effectiveHeight }]}
            pointerEvents="box-none"
          >
            <Animated.View
              style={styles.container}
              entering={SlideInDown.duration(300).springify()}
              exiting={SlideOutDown.duration(200)}
            >
              <CatMascot pose="sat" size={100} />

              <Text style={styles.title}>{config?.feature}</Text>

              <Text style={styles.message}>{config?.requirement}</Text>

              {config?.progress && (
                <View style={styles.progressSection}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min((config.progress.current / config.progress.required) * 100, 100)}%` }
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {config.progress.current}/{config.progress.required}
                  </Text>
                </View>
              )}

              <Pressable style={styles.button} onPress={hideModal}>
                <Text style={styles.buttonText}>got it!</Text>
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </Modal>
    </LockedFeatureContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useLockedFeature() {
  const context = useContext(LockedFeatureContext);
  if (!context) {
    throw new Error('useLockedFeature must be used within a LockedFeatureProvider');
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  progressSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  progressText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.lg,
  },
  buttonText: {
    ...typography.captionMedium,
    color: colors.background,
    fontWeight: '700',
  },
});
