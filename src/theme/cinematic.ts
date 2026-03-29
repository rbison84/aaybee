// ============================================
// Cinematic Dark Mode Theme - Warm Lavender
// "Letterboxd meets Bumble, built for Gen Z"
// ============================================

// DESIGN PHILOSOPHY:
// - Posters are the art — UI frames them, doesn't compete
// - Dark mode lets colors pop
// - Soft lavender accents for a calming, modern feel
// - Tactile, satisfying interactions
// - Confident but not corporate

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
  // Parse hex color to rgba
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
    // Backgrounds - True dark, neutral
    background: '#0A0A0A',        // Near-black
    card: '#141414',              // Elevated dark gray
    surface: '#1A1A1A',           // Secondary surfaces
    overlay: 'rgba(10, 10, 10, 0.85)', // For modals

    // Accent (electric orange)
    // Only for: Primary CTA, selected states, #1 badge, win indicators
    accent: '#FF6B2B',            // Electric orange
    accentHover: '#FF5500',       // Hover state
    accentSubtle: 'rgba(255, 107, 43, 0.12)', // Background tint
    accentGlow: 'rgba(255, 107, 43, 0.25)',   // Special moments

    // Neutrals - clean grays
    textPrimary: '#F5F5F5',       // Near-white
    textSecondary: '#999999',     // Medium gray
    textMuted: '#666666',         // Dark gray
    border: '#222222',            // Subtle border
    divider: '#1A1A1A',           // Subtle divider

    // Semantic
    success: '#4ADE80',           // Bold green
    successSubtle: 'rgba(74, 222, 128, 0.12)',
    error: '#EF4444',             // Red (distinct from accent)
    errorSubtle: 'rgba(239, 68, 68, 0.12)',
    warning: '#FCD34D',           // Amber (unchanged)
    warningSubtle: 'rgba(252, 211, 77, 0.12)',

    // Ranking badges
    gold: '#E5A84B',              // Warm gold
    silver: '#A0A0A0',            // Neutral silver
    bronze: '#B8956E',            // Warm bronze

    // Special accents (use sparingly)
    purple: '#FF6B2B',            // Maps to accent
    purpleSubtle: 'rgba(255, 107, 43, 0.08)',

    // Tab bar
    tabBarBackground: '#0A0A0A',
    tabBarBorder: '#1A1A1A',
    tabBarActive: '#FF6B2B',
    tabBarInactive: '#666666',

    // Glassmorphism (use sparingly - modals/overlays only)
    glass: 'rgba(20, 20, 20, 0.85)',
    glassBorder: 'rgba(255, 107, 43, 0.12)',

    // Legacy color aliases (for compatibility)
    black: '#000000',
    white: '#FFFFFF',
    yellow: '#FFD700',
    orange: '#FF8C00',
    cyan: '#00D9FF',
    magenta: '#FF00E5',
    cream: '#F5F1E8',
    green: '#22C55E',
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

  // Typography
  // Headers: lowercase for native feel
  // "rankings" not "Rankings"
  typography: {
    // Headers - personality font
    // Font: Cabinet Grotesk / General Sans / Clash Display (fallback: system-ui)
    h1: {
      fontSize: 32,
      fontWeight: '800' as const,
      letterSpacing: -0.64, // -0.02em
      lineHeight: 40,
    },
    h2: {
      fontSize: 24,
      fontWeight: '700' as const,
      letterSpacing: -0.48,
      lineHeight: 32,
    },
    h3: {
      fontSize: 18,
      fontWeight: '700' as const,
      letterSpacing: -0.36,
      lineHeight: 24,
    },
    // Body - Inter or system default
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 24,
    },
    bodyMedium: {
      fontSize: 16,
      fontWeight: '500' as const,
      lineHeight: 24,
    },
    caption: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    captionMedium: {
      fontSize: 14,
      fontWeight: '500' as const,
      lineHeight: 20,
    },
    tiny: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
    },
    // Stats/numbers - bold, tabular
    stat: {
      fontSize: 20,
      fontWeight: '700' as const,
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    },
    // Large display numbers (rankings, scores)
    display: {
      fontSize: 48,
      fontWeight: '800' as const,
      letterSpacing: -1,
      lineHeight: 56,
    },
    displayMedium: {
      fontSize: 36,
      fontWeight: '700' as const,
      letterSpacing: -0.72,
      lineHeight: 44,
    },
  },

  shadows: {
    sm: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 2,
    }),
    md: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    }),
    lg: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    }),
    card: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
      elevation: 8,
    }),
    // Special glow for winners/accents
    accentGlow: webSafeShadow({
      shadowColor: '#A78BFA',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 8,
    }),
    posterLift: webSafeShadow({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 10,
    }),
  },

  animation: {
    // Durations
    fast: 150,
    normal: 300,
    slow: 500,

    // Spring configs
    spring: {
      damping: 15,
      stiffness: 150,
    },
    springSnappy: {
      damping: 20,
      stiffness: 400,
    },
    springBouncy: {
      damping: 12,
      stiffness: 180,
    },

    // Screen transitions
    screenTransition: 250,

    // Button press
    buttonPress: {
      scale: 0.97,
      duration: 100,
    },

    // Winner animation
    winner: {
      scale: 1.05,
      duration: 300,
    },

    // Loser animation
    loser: {
      opacity: 0.4,
      scale: 0.95,
      duration: 200,
    },
  },

  // Glassmorphism preset (use sparingly - modals only)
  glass: {
    background: 'rgba(30, 26, 46, 0.85)',
    backdropBlur: 20,
    border: '1px solid rgba(167, 139, 250, 0.15)',
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
