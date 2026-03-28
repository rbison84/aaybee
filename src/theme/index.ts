// ============================================
// Theme Configuration
// ============================================

// Re-export cinematic theme as the primary theme
export * from './cinematic';
export { default as cinematic } from './cinematic';

import { Platform } from 'react-native';

function webSafeShadowLegacy(shadow: {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}) {
  if (Platform.OS !== 'web') return shadow;
  const { shadowColor, shadowOffset, shadowOpacity, shadowRadius } = shadow;
  const hex = shadowColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return {
    boxShadow: `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px rgba(${r},${g},${b},${shadowOpacity})`,
  } as any;
}

// Legacy theme for gradual migration
export const theme = {
  colors: {
    // Primary gradient
    gradientStart: '#1a1a2e',
    gradientMid: '#16213e',
    gradientEnd: '#0f3460',

    // Accent colors
    primary: '#3b82f6',
    primaryLight: 'rgba(59,130,246,0.2)',
    success: '#22c55e',
    successLight: 'rgba(34,197,94,0.2)',
    warning: '#f59e0b',
    warningLight: 'rgba(245,158,11,0.2)',
    danger: '#ef4444',
    dangerLight: 'rgba(239,68,68,0.2)',

    // Neutral
    white: '#ffffff',
    text: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.6)',
    textTertiary: 'rgba(255,255,255,0.4)',
    surface: 'rgba(255,255,255,0.1)',
    surfaceLight: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.1)',
    overlay: 'rgba(0,0,0,0.8)',

    // Status colors
    known: '#22c55e',
    uncertain: '#f59e0b',
    unknown: '#ef4444',
    uncompared: 'rgba(255,255,255,0.4)',

    // Tab bar
    tabBarBackground: '#0f0f1a',
    tabBarActive: '#3b82f6',
    tabBarInactive: 'rgba(255,255,255,0.4)',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    round: 9999,
  },

  typography: {
    h1: {
      fontSize: 32,
      fontWeight: '700' as const,
    },
    h2: {
      fontSize: 24,
      fontWeight: '700' as const,
    },
    h3: {
      fontSize: 18,
      fontWeight: '600' as const,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
    },
    tiny: {
      fontSize: 10,
      fontWeight: '400' as const,
    },
  },

  animation: {
    fast: 150,
    normal: 300,
    slow: 500,
    spring: {
      damping: 15,
      stiffness: 150,
    },
  },

  shadows: {
    sm: webSafeShadowLegacy({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 2,
    }),
    md: webSafeShadowLegacy({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    }),
    lg: webSafeShadowLegacy({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    }),
  },
};

export type Theme = typeof theme;

// Gradient presets
export const gradients = {
  main: [theme.colors.gradientStart, theme.colors.gradientMid, theme.colors.gradientEnd] as const,
  card: ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)'] as const,
  success: ['rgba(34,197,94,0.3)', 'rgba(34,197,94,0.1)'] as const,
  primary: ['rgba(59,130,246,0.3)', 'rgba(59,130,246,0.1)'] as const,
};
