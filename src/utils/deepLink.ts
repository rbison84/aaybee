import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

// ============================================
// DEEP LINK TYPES
// ============================================

export type DeepLinkIntent =
  | { type: 'vs'; code: string }
  | { type: 'daily' }
  | { type: 'challenge'; code: string }
  | { type: 'share'; code: string }
  | { type: 'crew'; code: string }
  | { type: 'decide'; code: string }
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

    // /decide/CODE
    const decideMatch = path.match(/^\/decide\/([a-z0-9]{4,8})$/i);
    if (decideMatch) {
      return { type: 'decide', code: decideMatch[1].toUpperCase() };
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

// ============================================
// REFERRAL TRACKING
// ============================================

const REF_STORAGE_KEY = 'aaybee_ref';

/**
 * Parse the `ref` query param from the current URL (web or native deep link).
 * If found, stores it in AsyncStorage for use at signup time.
 */
export async function captureRefParam(): Promise<void> {
  try {
    let ref: string | null = null;

    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      ref = params.get('ref');
    } else {
      // Native: read from the deep link URL that opened the app
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const parsed = Linking.parse(initialUrl);
        ref = (parsed.queryParams?.ref as string) || null;
      }
    }

    if (ref) {
      await AsyncStorage.setItem(REF_STORAGE_KEY, ref);
    }
  } catch {
    // Ignore
  }
}

/**
 * Retrieve stored referral user ID (set when user arrived via a ref link).
 */
export async function getStoredRefParam(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Listen for deep link events while the app is running (warm opens).
 * Captures ref param from incoming URLs on native.
 * Returns cleanup function.
 */
export function listenForNativeRef(): () => void {
  if (Platform.OS === 'web') return () => {};

  const subscription = Linking.addEventListener('url', (event) => {
    try {
      const parsed = Linking.parse(event.url);
      const ref = (parsed.queryParams?.ref as string) || null;
      if (ref) {
        AsyncStorage.setItem(REF_STORAGE_KEY, ref).catch(() => {});
      }
    } catch {
      // Ignore
    }
  });

  return () => subscription.remove();
}

/**
 * Clear stored ref after signup to prevent double-attribution.
 */
export async function clearStoredRefParam(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REF_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
