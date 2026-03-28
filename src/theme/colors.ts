// Collage-style color palette

export const colors = {
  // Primary accents
  yellow: '#FFD700',
  orange: '#FF8C00',
  cyan: '#00D9FF',
  magenta: '#FF00E5',
  black: '#000000',
  white: '#FFFFFF',

  // Background
  cream: '#F5F1E8',
  paperWhite: '#FFFEF7',

  // Semantic colors
  success: '#16a34a',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  error: '#dc2626',
  red: '#FF0000',

  // Accents
  neonPink: '#FF006E',
  electricBlue: '#0066FF',

  // Borders
  border: 'rgba(0, 0, 0, 0.1)',
  borderDark: 'rgba(0, 0, 0, 0.2)',

  // Tape colors
  tapeLight: 'rgba(255, 250, 230, 0.7)',
  tapeBorder: 'rgba(0, 0, 0, 0.05)',

  // Overlay lines
  lineColors: ['#00D9FF', '#FF00E5', '#FFD700'],

  // Text
  textPrimary: '#000000',
  textSecondary: 'rgba(0, 0, 0, 0.7)',
  textMuted: 'rgba(0, 0, 0, 0.5)',
  textLight: 'rgba(255, 255, 255, 0.9)',
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  tape: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  button: {
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
};
