// ============================================
// Movie Knockout Bracket
// 16-movie single-elimination tournament
// Adapted from SameGoat's bracket.ts for movies
// ============================================

import { Movie } from '../types';

// ─── Types ───

export interface BracketMovie {
  id: string;
  title: string;
  posterUrl: string;
  year?: number;
  genre?: string;
}

export interface BracketPick {
  round: number;   // 0=R16, 1=QF, 2=SF, 3=Final
  match: number;   // match index within round
  winnerIdx: number; // index into the movies array
}

export interface BracketMatchup {
  slotA: number; // index into movies array (or -1 if TBD)
  slotB: number;
  round: number;
  match: number;
}

export interface BracketState {
  currentRound: number;
  currentMatch: number;
  matchups: BracketMatchup[];
  isComplete: boolean;
  winnerIdx: number | null;
}

// ─── Constants ───

const ROUND_NAMES = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
const MATCHES_PER_ROUND = [8, 4, 2, 1];
const TOTAL_PICKS = 15; // 8 + 4 + 2 + 1

export function getRoundName(round: number): string {
  return ROUND_NAMES[round] || `Round ${round}`;
}

// ─── Seeded RNG ───

function seededRng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Movie Selection ───

/**
 * Select 16 movies for a bracket tournament.
 * Genre-balanced (max 3 per genre), seeded for reproducibility.
 */
export function selectBracketMovies(movies: BracketMovie[], seed: number): BracketMovie[] {
  const rng = seededRng(seed);
  const shuffled = shuffle(movies, rng);

  const selected: BracketMovie[] = [];
  const genreCounts = new Map<string, number>();

  for (const m of shuffled) {
    if (selected.length >= 16) break;

    // Max 3 per genre
    const genre = m.genre || 'unknown';
    const genreCount = genreCounts.get(genre) || 0;
    if (genreCount >= 3) continue;

    selected.push(m);
    genreCounts.set(genre, genreCount + 1);
  }

  // If we don't have 16, fill from remaining
  if (selected.length < 16) {
    const selectedIds = new Set(selected.map(m => m.id));
    for (const m of shuffled) {
      if (selected.length >= 16) break;
      if (!selectedIds.has(m.id)) {
        selected.push(m);
      }
    }
  }

  return shuffle(selected, rng);
}

/**
 * Create a bracket from a pool of ranked movies for a VS challenge.
 * Takes the user's top movies and picks 16.
 */
export function createVsBracket(userMovies: BracketMovie[], seed?: number): BracketMovie[] {
  const actualSeed = seed ?? Date.now();
  return selectBracketMovies(userMovies, actualSeed);
}

// ─── Bracket Logic ───

/**
 * Compute the full bracket state from picks so far.
 */
export function computeBracketState(
  movieCount: number,
  picks: BracketPick[]
): BracketState {
  const matchups: BracketMatchup[] = [];

  // Round 0: sequential pairs
  for (let m = 0; m < movieCount / 2; m++) {
    matchups.push({
      slotA: m * 2,
      slotB: m * 2 + 1,
      round: 0,
      match: m,
    });
  }

  // Build winner map
  const winners = new Map<string, number>();
  for (const pick of picks) {
    winners.set(`${pick.round}-${pick.match}`, pick.winnerIdx);
  }

  // Build subsequent rounds
  for (let r = 1; r < 4; r++) {
    const thisMatches = MATCHES_PER_ROUND[r];

    for (let m = 0; m < thisMatches; m++) {
      const prevMatchA = m * 2;
      const prevMatchB = m * 2 + 1;

      const slotA = winners.get(`${r - 1}-${prevMatchA}`) ?? -1;
      const slotB = winners.get(`${r - 1}-${prevMatchB}`) ?? -1;

      matchups.push({ slotA, slotB, round: r, match: m });
    }
  }

  // Find current position
  let currentRound = 0;
  let currentMatch = 0;
  let isComplete = false;

  if (picks.length >= TOTAL_PICKS) {
    isComplete = true;
    currentRound = 3;
    currentMatch = 0;
  } else {
    for (let r = 0; r < 4; r++) {
      const roundPicks = picks.filter((p) => p.round === r).length;
      if (roundPicks < MATCHES_PER_ROUND[r]) {
        currentRound = r;
        currentMatch = roundPicks;
        break;
      }
    }
  }

  const winnerIdx = isComplete ? (winners.get('3-0') ?? null) : null;

  return { currentRound, currentMatch, matchups, isComplete, winnerIdx };
}

/**
 * Get the current matchup to play.
 */
export function getCurrentMatchup(
  movies: BracketMovie[],
  picks: BracketPick[]
): { movieA: BracketMovie; movieB: BracketMovie; round: number; match: number } | null {
  const state = computeBracketState(movies.length, picks);
  if (state.isComplete) return null;

  const { currentRound, currentMatch } = state;

  if (currentRound === 0) {
    const idxA = currentMatch * 2;
    const idxB = currentMatch * 2 + 1;
    return {
      movieA: movies[idxA],
      movieB: movies[idxB],
      round: 0,
      match: currentMatch,
    };
  }

  // Later rounds: find winners from previous round
  const winners = new Map<string, number>();
  for (const pick of picks) {
    winners.set(`${pick.round}-${pick.match}`, pick.winnerIdx);
  }

  const prevMatchA = currentMatch * 2;
  const prevMatchB = currentMatch * 2 + 1;
  const idxA = winners.get(`${currentRound - 1}-${prevMatchA}`);
  const idxB = winners.get(`${currentRound - 1}-${prevMatchB}`);

  if (idxA === undefined || idxB === undefined) return null;

  return {
    movieA: movies[idxA],
    movieB: movies[idxB],
    round: currentRound,
    match: currentMatch,
  };
}

/**
 * Build the winner path for bracket visualization.
 * Returns array of arrays: round -> indices of movies still alive.
 */
export function buildBracketPath(movies: BracketMovie[], picks: BracketPick[]): number[][] {
  const path: number[][] = [];

  // Round 0: all 16 indices
  path.push(Array.from({ length: movies.length }, (_, i) => i));

  const winners = new Map<string, number>();
  for (const pick of picks) {
    winners.set(`${pick.round}-${pick.match}`, pick.winnerIdx);
  }

  // Each subsequent round: winners from previous
  for (let r = 0; r < 4; r++) {
    const roundWinners: number[] = [];
    for (let m = 0; m < MATCHES_PER_ROUND[r]; m++) {
      const w = winners.get(`${r}-${m}`);
      if (w !== undefined) roundWinners.push(w);
    }
    path.push(roundWinners);
  }

  return path;
}

/**
 * Compare two sets of bracket picks and count agreements.
 */
export function compareBrackets(picksA: BracketPick[], picksB: BracketPick[]): {
  agreements: number;
  total: number;
  percent: number;
} {
  let agreements = 0;
  const total = Math.min(picksA.length, picksB.length);

  const mapB = new Map<string, number>();
  for (const p of picksB) {
    mapB.set(`${p.round}-${p.match}`, p.winnerIdx);
  }

  for (const p of picksA) {
    const bWinner = mapB.get(`${p.round}-${p.match}`);
    if (bWinner === p.winnerIdx) agreements++;
  }

  return {
    agreements,
    total,
    percent: total > 0 ? Math.round((agreements / total) * 100) : 0,
  };
}
