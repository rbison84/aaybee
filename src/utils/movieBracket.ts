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
 * Convert bracket picks into an implicit ranking of all movies.
 * Winner = rank 0, finalist = rank 1, semi losers = rank 2-3, etc.
 * Returns array of movie indices sorted by rank (best first).
 */
export function bracketToRanking(movieCount: number, picks: BracketPick[]): number[] {
  const winners = new Map<string, number>();
  for (const pick of picks) {
    winners.set(`${pick.round}-${pick.match}`, pick.winnerIdx);
  }

  // Track which round each movie was eliminated in (higher = better)
  // Movies that won later rounds get higher scores
  const score = new Map<number, number>();

  // Initialize all movies at 0
  for (let i = 0; i < movieCount; i++) {
    score.set(i, 0);
  }

  // Round 0 losers get score 0, round 0 winners get at least 1
  // Each subsequent round won adds more score
  // Round 0 winners: +1, Round 1 winners: +2, Round 2 winners: +4, Round 3 winner: +8
  for (const pick of picks) {
    const winnerIdx = pick.winnerIdx;
    const roundBonus = Math.pow(2, pick.round);
    score.set(winnerIdx, (score.get(winnerIdx) || 0) + roundBonus);
  }

  // Sort by score descending (highest = best)
  const indices = Array.from({ length: movieCount }, (_, i) => i);
  indices.sort((a, b) => (score.get(b) || 0) - (score.get(a) || 0));

  return indices;
}

/**
 * Compute Kendall tau distance between two rankings.
 * Returns 0 (identical) to 1 (fully reversed).
 */
function kendallTauDistance(rankingA: number[], rankingB: number[]): number {
  const n = rankingA.length;
  if (n < 2) return 0;

  // Position of each item in ranking B
  const posB = new Map<number, number>();
  rankingB.forEach((idx, pos) => posB.set(idx, pos));

  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const biPos = posB.get(rankingA[i]);
      const bjPos = posB.get(rankingA[j]);
      if (biPos === undefined || bjPos === undefined) continue;

      if (biPos < bjPos) concordant++;
      else if (biPos > bjPos) discordant++;
    }
  }

  const totalPairs = (n * (n - 1)) / 2;
  return totalPairs > 0 ? discordant / totalPairs : 0;
}

/**
 * Extract all pairwise winner/loser comparisons from bracket picks.
 * Returns array of { winnerId, loserId } for each of the 15 matchups.
 */
export function extractBracketComparisons(
  movies: BracketMovie[],
  picks: BracketPick[]
): { winnerId: string; loserId: string }[] {
  const comparisons: { winnerId: string; loserId: string }[] = [];

  const winners = new Map<string, number>();
  for (const pick of picks) {
    winners.set(`${pick.round}-${pick.match}`, pick.winnerIdx);
  }

  for (const pick of picks) {
    let idxA: number;
    let idxB: number;

    if (pick.round === 0) {
      idxA = pick.match * 2;
      idxB = pick.match * 2 + 1;
    } else {
      const prevMatchA = pick.match * 2;
      const prevMatchB = pick.match * 2 + 1;
      const a = winners.get(`${pick.round - 1}-${prevMatchA}`);
      const b = winners.get(`${pick.round - 1}-${prevMatchB}`);
      if (a === undefined || b === undefined) continue;
      idxA = a;
      idxB = b;
    }

    const movieA = movies[idxA];
    const movieB = movies[idxB];
    if (!movieA || !movieB) continue;

    const winnerIdx = pick.winnerIdx;
    const winnerId = winnerIdx === idxA ? movieA.id : movieB.id;
    const loserId = winnerIdx === idxA ? movieB.id : movieA.id;

    comparisons.push({ winnerId, loserId });
  }

  return comparisons;
}

/**
 * Compare two bracket results using implicit ranking + Kendall tau.
 * Returns a taste match percentage (0-100, higher = more similar).
 */
export function compareBrackets(movieCount: number, picksA: BracketPick[], picksB: BracketPick[]): {
  matchPercent: number;
  kendallTau: number;
  sameWinner: boolean;
} {
  const rankingA = bracketToRanking(movieCount, picksA);
  const rankingB = bracketToRanking(movieCount, picksB);

  const tau = kendallTauDistance(rankingA, rankingB);
  const matchPercent = Math.round((1 - tau) * 100);

  const winnerA = picksA.find(p => p.round === 3)?.winnerIdx;
  const winnerB = picksB.find(p => p.round === 3)?.winnerIdx;

  return {
    matchPercent,
    kendallTau: tau,
    sameWinner: winnerA !== undefined && winnerA === winnerB,
  };
}
