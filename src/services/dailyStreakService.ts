import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailySwissState } from '../utils/dailySwiss';

// ============================================
// Daily Streak Service (Swiss format)
// ============================================

const STORAGE_KEY = '@aaybee/daily_streak';
const SESSION_KEY = '@aaybee/daily_session';
const COLLECTIONS_KEY = '@aaybee/daily_collections';

// ---- Types ----

export type DailyStep = 'intro' | 'playing' | 'results';

export interface DailySessionData {
  dailyNumber: number;
  categoryId: string;
  step: DailyStep;
  tournamentState: null;         // deprecated, kept for migration
  swissState: DailySwissState | null;
  seenIds?: string[];            // preserve seen selection
}

export interface DailyStreakData {
  lastCompletedDate: string | null; // ISO date string (YYYY-MM-DD)
  currentStreak: number;
  longestStreak: number;
  totalDaysCompleted: number;
}

export interface DailyCollectionEntry {
  categoryId: string;
  championId: string;
  dailyNumber: number;
  completedDate: string; // YYYY-MM-DD
  userRanking?: string[];      // Full 9-movie ranking (index 0 = user's #1)
  globalMatchPercent?: number; // Percentage within 2 positions of global
  seenCount?: number;          // How many movies user had seen
}

// ---- Helpers ----

function getTodayDateString(): string {
  const today = new Date();
  return today.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// ---- Service ----

export const dailyStreakService = {
  // ============================================
  // Streak Management
  // ============================================

  async getStreakData(): Promise<DailyStreakData> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[DailyStreak] Error loading streak data:', error);
    }

    return {
      lastCompletedDate: null,
      currentStreak: 0,
      longestStreak: 0,
      totalDaysCompleted: 0,
    };
  },

  async hasCompletedToday(): Promise<boolean> {
    const data = await this.getStreakData();
    return data.lastCompletedDate === getTodayDateString();
  },

  async completeToday(): Promise<DailyStreakData> {
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();
    const data = await this.getStreakData();

    // Already completed today
    if (data.lastCompletedDate === today) {
      return data;
    }

    let newStreak: number;

    if (data.lastCompletedDate === yesterday) {
      newStreak = data.currentStreak + 1;
    } else if (data.lastCompletedDate === null) {
      newStreak = 1;
    } else {
      newStreak = 1;
    }

    const updatedData: DailyStreakData = {
      lastCompletedDate: today,
      currentStreak: newStreak,
      longestStreak: Math.max(data.longestStreak, newStreak),
      totalDaysCompleted: data.totalDaysCompleted + 1,
    };

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
    } catch (error) {
      console.error('[DailyStreak] Error saving streak data:', error);
    }

    return updatedData;
  },

  async getCurrentStreak(): Promise<number> {
    const data = await this.getStreakData();
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();

    if (data.lastCompletedDate === today) {
      return data.currentStreak;
    }
    if (data.lastCompletedDate === yesterday) {
      return data.currentStreak;
    }
    return 0;
  },

  async isStreakAtRisk(): Promise<boolean> {
    const data = await this.getStreakData();
    const yesterday = getYesterdayDateString();
    return data.lastCompletedDate === yesterday && data.currentStreak > 0;
  },

  formatStreak(streak: number): string {
    if (streak === 0) return '';
    if (streak === 1) return '\uD83D\uDD25 1 day streak';
    return `\uD83D\uDD25 ${streak} day streak`;
  },

  formatStreakForShare(streak: number): string {
    if (streak === 0) return '';
    if (streak === 1) return '\uD83D\uDD25 Day 1';
    return `\uD83D\uDD25 ${streak} day streak`;
  },

  // ============================================
  // Per-Category Session Management
  // ============================================

  async saveSession(session: DailySessionData): Promise<void> {
    try {
      const allSessions = await this._loadAllSessions();
      allSessions[session.categoryId] = session;
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(allSessions));
    } catch (error) {
      console.error('[DailyStreak] Error saving session:', error);
    }
  },

  async loadSession(categoryId: string): Promise<DailySessionData | null> {
    try {
      const allSessions = await this._loadAllSessions();
      const session = allSessions[categoryId];
      if (session && session.categoryId === categoryId) {
        return session;
      }
    } catch (error) {
      console.error('[DailyStreak] Error loading session:', error);
    }
    return null;
  },

  async clearSession(categoryId: string): Promise<void> {
    try {
      const allSessions = await this._loadAllSessions();
      delete allSessions[categoryId];
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(allSessions));
    } catch (error) {
      console.error('[DailyStreak] Error clearing session:', error);
    }
  },

  async _loadAllSessions(): Promise<Record<string, DailySessionData>> {
    try {
      const data = await AsyncStorage.getItem(SESSION_KEY);
      if (!data) return {};
      const parsed = JSON.parse(data);
      // Migration: discard old formats
      if (parsed && typeof parsed === 'object' && 'comparisonIndex' in parsed) {
        await AsyncStorage.removeItem(SESSION_KEY);
        return {};
      }
      // Migration: discard old keep-or-swap sessions and old tournament sessions
      if (parsed && typeof parsed === 'object') {
        const cleaned: Record<string, DailySessionData> = {};
        let needsSave = false;
        for (const [key, val] of Object.entries(parsed)) {
          if (val && typeof val === 'object') {
            const v = val as any;
            // Skip old format sessions (roundIndex or non-null tournamentState without swissState)
            if ('roundIndex' in v || (v.tournamentState && !v.swissState)) {
              needsSave = true;
              continue;
            }
          }
          cleaned[key] = val as DailySessionData;
        }
        if (needsSave) {
          await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(cleaned));
        }
        return cleaned;
      }
      return parsed;
    } catch (error) {
      console.error('[DailyStreak] Error loading all sessions:', error);
      return {};
    }
  },

  // ============================================
  // Collections Storage
  // ============================================

  async getCollections(): Promise<DailyCollectionEntry[]> {
    try {
      const data = await AsyncStorage.getItem(COLLECTIONS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[DailyStreak] Error loading collections:', error);
    }
    return [];
  },

  async addCollectionEntry(entry: DailyCollectionEntry): Promise<void> {
    try {
      const collections = await this.getCollections();
      // Don't duplicate: check if same category+dailyNumber already exists
      const exists = collections.some(
        e => e.categoryId === entry.categoryId && e.dailyNumber === entry.dailyNumber,
      );
      if (!exists) {
        collections.push(entry);
        await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
      }
    } catch (error) {
      console.error('[DailyStreak] Error adding collection entry:', error);
    }
  },

  async hasCompletedCategory(categoryId: string, dailyNumber: number): Promise<boolean> {
    const collections = await this.getCollections();
    return collections.some(
      e => e.categoryId === categoryId && e.dailyNumber === dailyNumber,
    );
  },

  async getTodayCompletedCategories(): Promise<string[]> {
    const today = getTodayDateString();
    const collections = await this.getCollections();
    return collections
      .filter(e => e.completedDate === today)
      .map(e => e.categoryId);
  },
};
