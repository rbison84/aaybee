import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export interface ShareCode {
  id: string;
  code: string;
  type: 'daily' | 'vs' | 'challenge' | 'ranking';
  user_id: string | null;
  title: string;
  description: string | null;
  image_data: any;
  created_at: string;
}

// ============================================
// CONSTANTS
// ============================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const BASE_URL = 'https://aaybee.netlify.app';

// ============================================
// HELPERS
// ============================================

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function appendRef(url: string, userId?: string | null): string {
  if (!userId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}ref=${userId}`;
}

// ============================================
// SERVICE
// ============================================

export const shareService = {
  /**
   * Create a share code for daily results.
   * Returns the full share URL.
   */
  createDailyShare: async (
    userId: string | null,
    dailyNumber: number,
    categoryTitle: string,
    seenCount: number,
    topMovie: string,
    grid: any[],
  ): Promise<string> => {
    try {
      let code = generateCode();
      // Retry on collision
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase
          .from('share_codes')
          .select('id')
          .eq('code', code)
          .maybeSingle();
        if (!existing) break;
        code = generateCode();
      }

      await supabase.from('share_codes').insert({
        code,
        type: 'daily',
        user_id: userId,
        title: `Aaybee Daily #${dailyNumber}: ${categoryTitle}`,
        description: `🎬 ${seenCount}/9 — #1: ${topMovie}`,
        image_data: { dailyNumber, categoryTitle, seenCount, topMovie, grid },
      });

      return appendRef(`${BASE_URL}/share/${code}`, userId);
    } catch (err) {
      console.error('[ShareService] createDailyShare error:', err);
      // Fallback to plain URL
      return appendRef(`${BASE_URL}/daily`, userId);
    }
  },

  /**
   * Get the share URL for a VS challenge (uses existing code).
   */
  getVsShareUrl: (code: string, userId?: string | null): string => {
    return appendRef(`${BASE_URL}/vs/${code}`, userId);
  },

  /**
   * Get the share URL for a friend challenge (uses existing code).
   */
  getChallengeShareUrl: (code: string, userId?: string | null): string => {
    return appendRef(`${BASE_URL}/challenge/${code}`, userId);
  },
};

// ============================================
// DISAGREEMENT CACHE
// ============================================
// Stores the user's most recent disagreement text for use in SMS invites.
// Written by VS/Challenge share handlers, read by contactService.

const DISAGREEMENT_KEY = 'aaybee_last_disagreement';

export async function storeLastDisagreement(text: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISAGREEMENT_KEY, text);
  } catch {}
}

export async function getLastDisagreement(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DISAGREEMENT_KEY);
  } catch {
    return null;
  }
}

export default shareService;
