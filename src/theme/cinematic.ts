// ============================================
// Brutalist Dark Theme — SameGoat-inspired
// Pure black, neon lime, flat, uppercase, mono
// ============================================

// DESIGN PHILOSOPHY:
// - Stark brutalist minimalism with one neon accent
// - Pure black background, high contrast
// - Uppercase text, monospace + display fonts
// - No shadows, no gradients, completely flat
// - Posters are the only rich visual — UI is stark frame

import { Platform } from 'react-native';

/**
 * Convert React Native shadow props to a web-compatible style object.
 * On native, returns the original shadow props.
 * On web, returns a boxShadow CSS string.
 */
function webSafeShadow(shadow: {
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

/**
 * Convert React Native textShadow props to a web-compatible style object.
 */
export function webSafeTextShadow(color: string, offset: { width: number; height: number }, radius: number) {
  if (Platform.OS !== 'web') {
    return {
      textShadowColor: color,
      textShadowOffset: offset,
      textShadowRadius: radius,
    };
  }
  return {
    textShadow: `${offset.width}px ${offset.height}px ${radius}px ${color}`,
  } as any;
}

export const cinematic = {
  colors: {
    // Backgrounds — pure black
    background: '#000000',
    card: '#1A1A1A',
    surface: '#1A1A1A',
    overlay: 'rgba(0, 0, 0, 0.85)',

    // Accent — neon lime
    accent: '#C8FF00',
    accentHover: '#B8EE00',
    accentSubtle: 'rgba(200, 255, 0, 0.12)',
    accentGlow: 'rgba(200, 255, 0, 0.25)',

    // Neutrals — stark contrast
    textPrimary: '#FFFFFF',
    textSecondary: '#888888',
    textMuted: '#888888',
    border: '#333333',
    divider: '#333333',

    // Semantic
    success: '#4ADE80',
    successSubtle: 'rgba(74, 222, 128, 0.12)',
    error: '#F87171',
    errorSubtle: 'rgba(248, 113, 113, 0.12)',
    warning: '#FCD34D',
    warningSubtle: 'rgba(252, 211, 77, 0.12)',

    // Ranking badges
    gold: '#E5A84B',
    silver: '#A0A0A0',
    bronze: '#B8956E',

    // Special accents (map to accent)
    purple: '#C8FF00',
    purpleSubtle: 'rgba(200, 255, 0, 0.08)',

    // Tournament / decide labels
    tournamentA: '#E5A84B',
    tournamentB: '#4ABFED',

    // Tab bar / nav
    tabBarBackground: '#000000',
    tabBarBorder: '#333333',
    tabBarActive: '#C8FF00',
    tabBarInactive: '#888888',

    // Glass (flat — minimal transparency)
    glass: 'rgba(0, 0, 0, 0.90)',
    glassBorder: 'rgba(200, 255, 0, 0.12)',

    // Legacy color aliases (for compatibility)
    black: '#000000',
    white: '#FFFFFF',
    yellow: '#C8FF00',
    orange: '#C8FF00',
    cyan: '#00D9FF',
    magenta: '#FF00E5',
    cream: '#F5F1E8',
    green: '#4ADE80',
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
    md: 10,
    lg: 12,
    xl: 16,
    xxl: 20,
    round: 9999,
  },

  // Typography — uppercase, monospace body, display headers
  // Fonts: System bold for display, monospace for body
  typography: {
    h1: {
      fontSize: 32,
      fontWeight: '800' as const,
      letterSpacing: 1.5,
      lineHeight: 40,
      textTransform: 'uppercase' as const,
    },
    h2: {
      fontSize: 24,
      fontWeight: '700' as const,
      letterSpacing: 1,
      lineHeight: 32,
      textTransform: 'uppercase' as const,
    },
    h3: {
      fontSize: 18,
      fontWeight: '700' as const,
      letterSpacing: 0.8,
      lineHeight: 24,
      textTransform: 'uppercase' as const,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
      letterSpacing: 0.5,
    },
    bodyMedium: {
      fontSize: 14,
      fontWeight: '500' as const,
      lineHeight: 20,
      letterSpacing: 0.5,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    captionMedium: {
      fontSize: 12,
      fontWeight: '500' as const,
      lineHeight: 16,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
    tiny: {
      fontSize: 10,
      fontWeight: '400' as const,
      lineHeight: 14,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    stat: {
      fontSize: 20,
      fontWeight: '700' as const,
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    },
    display: {
      fontSize: 48,
      fontWeight: '800' as const,
      letterSpacing: 2,
      lineHeight: 56,
      textTransform: 'uppercase' as const,
    },
    displayMedium: {
      fontSize: 36,
      fontWeight: '700' as const,
      letterSpacing: 1.5,
      lineHeight: 44,
      textTransform: 'uppercase' as const,
    },
  },

  // Shadows — flat design, no shadows by default
  // Keep the structure for compatibility but use zero values
  shadows: {
    sm: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    }),
    md: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    }),
    lg: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    }),
    card: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    }),
    accentGlow: webSafeShadow({
      shadowColor: '#C8FF00',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    }),
    posterLift: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    }),
  },

  animation: {
    fast: 150,
    normal: 250,
    slow: 400,

    spring: {
      damping: 20,
      stiffness: 300,
    },
    springSnappy: {
      damping: 20,
      stiffness: 400,
    },
    springBouncy: {
      damping: 15,
      stiffness: 200,
    },

    screenTransition: 250,

    buttonPress: {
      scale: 0.97,
      duration: 100,
    },

    winner: {
      scale: 1.05,
      duration: 300,
    },

    loser: {
      opacity: 0.4,
      scale: 0.95,
      duration: 200,
    },
  },

  // Glass — flat, near-opaque
  glass: {
    background: 'rgba(0, 0, 0, 0.90)',
    backdropBlur: 0,
    border: '1px solid rgba(200, 255, 0, 0.12)',
  },
};

// Type export
export type CinematicTheme = typeof cinematic;

// Convenience color exports
export const colors = cinematic.colors;
export const spacing = cinematic.spacing;
export const borderRadius = cinematic.borderRadius;
export const typography = cinematic.typography;
export const shadows = cinematic.shadows;
export const animation = cinematic.animation;

// Default export
export default cinematic;
