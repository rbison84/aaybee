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

      return `${BASE_URL}/share/${code}`;
    } catch (err) {
      console.error('[ShareService] createDailyShare error:', err);
      // Fallback to plain URL
      return `${BASE_URL}/daily`;
    }
  },

  /**
   * Get the share URL for a VS challenge (uses existing code).
   */
  getVsShareUrl: (code: string): string => {
    return `${BASE_URL}/vs/${code}`;
  },

  /**
   * Get the share URL for a friend challenge (uses existing code).
   */
  getChallengeShareUrl: (code: string): string => {
    return `${BASE_URL}/challenge/${code}`;
  },
};

export default shareService;
