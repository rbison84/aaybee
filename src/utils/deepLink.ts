import { Platform } from 'react-native';

// ============================================
// DEEP LINK TYPES
// ============================================

export type DeepLinkIntent =
  | { type: 'vs'; code: string }
  | { type: 'daily' }
  | { type: 'challenge'; code: string }
  | { type: 'share'; code: string }
  | { type: 'crew'; code: string }
  | null;

// ============================================
// PARSE + CONSUME
// ============================================

/**
 * Parse the current web URL into a deep link intent.
 * Returns null if no matching path found or not on web.
 */
export function parseDeepLink(): DeepLinkIntent {
  if (Platform.OS !== 'web') return null;

  try {
    const path = window.location.pathname.toLowerCase();

    // /vs/CODE
    const vsMatch = path.match(/^\/vs\/([a-z0-9]{4,8})$/i);
    if (vsMatch) {
      return { type: 'vs', code: vsMatch[1].toUpperCase() };
    }

    // /challenge/CODE
    const challengeMatch = path.match(/^\/challenge\/([a-z0-9]{4,8})$/i);
    if (challengeMatch) {
      return { type: 'challenge', code: challengeMatch[1].toUpperCase() };
    }

    // /share/CODE
    const shareMatch = path.match(/^\/share\/([a-z0-9]{4,8})$/i);
    if (shareMatch) {
      return { type: 'share', code: shareMatch[1].toUpperCase() };
    }

    // /crew/CODE
    const crewMatch = path.match(/^\/crew\/([a-z0-9]{4,8})$/i);
    if (crewMatch) {
      return { type: 'crew', code: crewMatch[1].toUpperCase() };
    }

    // /daily
    if (path === '/daily' || path === '/daily/') {
      return { type: 'daily' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Clean the URL after consuming the deep link so the user can
 * navigate normally without re-triggering on refresh.
 */
export function clearDeepLink(): void {
  if (Platform.OS !== 'web') return;
  try {
    window.history.replaceState({}, '', '/');
  } catch {
    // Ignore — not critical
  }
}
