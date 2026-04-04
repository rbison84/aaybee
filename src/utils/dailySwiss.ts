// ============================================
// Daily Swiss Engine
// ============================================
// Replaces the fixed tournament bracket with a Swiss-algorithm approach.
// 9 movies per category. User marks which they've seen (min 3).
// Swiss-algorithm adaptive pairwise comparisons (2 × seenCount).
// Slot-fill ranking merges user's seen ranking with unseen at global positions.

// ============================================
// Types
// ============================================

export interface DailySwissState {
  movieIds: string[];           // 9 IDs in editorial/global rank order
  seenIds: string[];            // IDs user marked as seen
  comparisons: { a: string; b: string; winner: string }[];
  betas: Record<string, number>; // local beta scores for this session
  currentPair: [string, string] | null;
  isComplete: boolean;
  totalRequired: number;        // 2 × seenIds.length
}

// ============================================
// Swiss Engine Creation
// ============================================

export function createDailySwiss(movieIds: string[], seenIds: string[]): DailySwissState {
  const betas: Record<string, number> = {};
  for (const id of seenIds) {
    betas[id] = 0;
  }

  const state: DailySwissState = {
    movieIds,
    seenIds,
    comparisons: [],
    betas,
    currentPair: null,
    isComplete: false,
    totalRequired: 2 * seenIds.length,
  };

  state.currentPair = getNextSwissPair(state);
  return state;
}

// ============================================
// Swiss Pairing Algorithm
// ============================================

/**
 * Get the next pair of movies to compare.
 * 1. Sort seen movies by current beta (desc)
 * 2. Collect fresh adjacent pairs and pick one randomly
 * 3. If none, collect all eligible pairs (compared < 2 times) and pick randomly
 *    weighted toward closer betas
 * Returns null if totalRequired comparisons reached.
 */
export function getNextSwissPair(state: DailySwissState): [string, string] | null {
  if (state.comparisons.length >= state.totalRequired) {
    return null;
  }

  const { seenIds, betas, comparisons } = state;

  // Sort seen movies by beta descending
  const sorted = [...seenIds].sort((a, b) => betas[b] - betas[a]);

  // Count how many times each pair has been compared
  const pairCount = (a: string, b: string): number => {
    const key1 = a < b ? `${a}|${b}` : `${b}|${a}`;
    return comparisons.filter(c => {
      const k = c.a < c.b ? `${c.a}|${c.b}` : `${c.b}|${c.a}`;
      return k === key1;
    }).length;
  };

  // Collect all fresh adjacent pairs and pick one randomly
  const freshAdjacent: [string, string][] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (pairCount(a, b) === 0) {
      freshAdjacent.push([a, b]);
    }
  }

  if (freshAdjacent.length > 0) {
    return freshAdjacent[Math.floor(Math.random() * freshAdjacent.length)];
  }

  // Collect all eligible pairs (compared < 2 times) and pick randomly
  const eligible: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (pairCount(a, b) < 2) {
        eligible.push([a, b]);
      }
    }
  }

  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// ============================================
// Recording Choices (Bradley-Terry update)
// ============================================

/**
 * Record a choice and advance the Swiss state.
 * Uses simplified Bradley-Terry with K=1.0.
 */
export function recordDailyChoice(state: DailySwissState, winnerId: string): DailySwissState {
  if (state.isComplete || !state.currentPair) return state;

  const [a, b] = state.currentPair;
  const loserId = winnerId === a ? b : a;

  // Bradley-Terry update (K=1.0)
  const betaW = state.betas[winnerId] || 0;
  const betaL = state.betas[loserId] || 0;
  const expectedW = 1 / (1 + Math.exp(betaL - betaW));
  const K = 1.0;

  const newBetas = { ...state.betas };
  newBetas[winnerId] = betaW + K * (1 - expectedW);
  newBetas[loserId] = betaL + K * (0 - (1 - expectedW));

  const newComparisons = [...state.comparisons, { a, b, winner: winnerId }];
  const isComplete = newComparisons.length >= state.totalRequired;

  const newState: DailySwissState = {
    ...state,
    betas: newBetas,
    comparisons: newComparisons,
    isComplete,
    currentPair: null,
  };

  if (!isComplete) {
    newState.currentPair = getNextSwissPair(newState);
    // If no more pairs available, mark complete
    if (!newState.currentPair) {
      newState.isComplete = true;
    }
  }

  return newState;
}

/**
 * Undo the last comparison, revert betas, regenerate current pair.
 */
export function undoDailyChoice(state: DailySwissState): DailySwissState {
  if (state.comparisons.length === 0) return state;

  const newComparisons = state.comparisons.slice(0, -1);
  const last = state.comparisons[state.comparisons.length - 1];

  // Reverse Bradley-Terry update
  const betaW = state.betas[last.winner] || 0;
  const loserId = last.winner === last.a ? last.b : last.a;
  const betaL = state.betas[loserId] || 0;

  // To reverse: we need the expected value at the time of the original update
  // The original betas before the update were:
  // betaW_before + K*(1 - expected) = betaW_now → betaW_before = betaW_now - K*(1 - expected)
  // But expected depends on betaW_before and betaL_before, creating a cycle.
  // Simpler: just recompute all betas from scratch.
  const newBetas: Record<string, number> = {};
  for (const id of state.seenIds) {
    newBetas[id] = 0;
  }

  for (const comp of newComparisons) {
    const bW = newBetas[comp.winner] || 0;
    const lId = comp.winner === comp.a ? comp.b : comp.a;
    const bL = newBetas[lId] || 0;
    const exp = 1 / (1 + Math.exp(bL - bW));
    const K = 1.0;
    newBetas[comp.winner] = bW + K * (1 - exp);
    newBetas[lId] = bL + K * (0 - (1 - exp));
  }

  const newState: DailySwissState = {
    ...state,
    comparisons: newComparisons,
    betas: newBetas,
    isComplete: false,
    currentPair: null,
  };

  newState.currentPair = getNextSwissPair(newState);
  return newState;
}

// ============================================
// Ranking Computation
// ============================================

/**
 * Compute the full 9-element ranking by merging user's seen ranking
 * with unseen movies at their global positions.
 *
 * Slot-fill algorithm:
 * 1. Start with 9 empty slots
 * 2. Place unseen movies at their global positions
 * 3. Fill remaining slots with user's beta-ranked seen movies in order
 */
export function computeFullRanking(state: DailySwissState): string[] {
  const { movieIds, seenIds, betas } = state;
  const seenSet = new Set(seenIds);

  // Sort seen movies by beta descending (user's ranking)
  const seenRanked = [...seenIds].sort((a, b) => betas[b] - betas[a]);

  // Build 9-slot array
  const result: (string | null)[] = new Array(movieIds.length).fill(null);

  // Place unseen movies at their global positions
  for (let i = 0; i < movieIds.length; i++) {
    if (!seenSet.has(movieIds[i])) {
      result[i] = movieIds[i];
    }
  }

  // Fill remaining slots with user's ranked seen movies in order
  let seenIdx = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) {
      result[i] = seenRanked[seenIdx++];
    }
  }

  return result as string[];
}

// ============================================
// Deviation Grid & Stats
// ============================================

export interface DeviationCell {
  movieId: string;
  color: 'gray' | 'green' | 'amber' | 'red';
  deviation: number;       // signed: negative = you ranked higher, positive = you ranked lower
  userRank: number | null; // 1-based rank among seen movies, null if unseen
}

/**
 * Compute deviation grid for the 3×3 results display.
 * For each of 9 global positions:
 *   - If unseen → gray
 *   - Else signed deviation = userRankPos - globalPos
 *     negative = you ranked it higher than consensus → green
 *     near zero (|dev| ≤ 2) → amber (you agree)
 *     positive = you ranked it lower → red
 */
export function computeDeviationGrid(
  fullRanking: string[],
  globalRanking: string[],
  seenIds: string[],
): DeviationCell[] {
  const seenSet = new Set(seenIds);
  // Compute user rank (1-based) among seen movies only
  const seenInRanking = fullRanking.filter(id => seenSet.has(id));
  const userRankMap = new Map<string, number>();
  seenInRanking.forEach((id, i) => userRankMap.set(id, i + 1));

  return globalRanking.map((movieId, globalIndex) => {
    if (!seenSet.has(movieId)) {
      return { movieId, color: 'gray' as const, deviation: 0, userRank: null };
    }

    const rankingIndex = fullRanking.indexOf(movieId);
    const signedDeviation = rankingIndex === -1 ? 9 : rankingIndex - globalIndex;
    const absDev = Math.abs(signedDeviation);

    let color: 'green' | 'amber' | 'red';
    if (absDev <= 2) {
      color = 'amber'; // you agree with consensus
    } else if (signedDeviation < 0) {
      color = 'green'; // you ranked it higher than consensus
    } else {
      color = 'red'; // you ranked it lower than consensus
    }

    return { movieId, color, deviation: signedDeviation, userRank: userRankMap.get(movieId) ?? null };
  });
}

/**
 * Hot take: the movie with the largest absolute deviation from consensus.
 * Returns "X > Y" format — the movie you ranked most differently vs what consensus would expect.
 */
export function computeHotTake(
  grid: DeviationCell[],
  globalRanking: string[],
  movieTitles: Map<string, string>,
): string | null {
  const seenCells = grid.filter(c => c.color !== 'gray');
  if (seenCells.length < 2) return null;

  // Find largest absolute deviation
  let bestCell: DeviationCell | null = null;
  for (const cell of seenCells) {
    if (!bestCell || Math.abs(cell.deviation) > Math.abs(bestCell.deviation)) {
      bestCell = cell;
    }
  }

  if (!bestCell || bestCell.deviation === 0) return null;

  const hotTitle = movieTitles.get(bestCell.movieId) || '???';
  const globalIndex = globalRanking.indexOf(bestCell.movieId);
  if (globalIndex === -1) return null;

  // Contrast with the movie at the user's rank position in global ranking
  const userRankIndex = globalIndex + bestCell.deviation;
  const contrastId = userRankIndex >= 0 && userRankIndex < globalRanking.length
    ? globalRanking[userRankIndex]
    : null;

  if (!contrastId || contrastId === bestCell.movieId) {
    const fallbackId = globalRanking[globalIndex + 1] || globalRanking[globalIndex - 1];
    if (!fallbackId) return null;
    const fallbackTitle = movieTitles.get(fallbackId) || '???';
    return bestCell.deviation < 0
      ? `${hotTitle} > ${fallbackTitle}`
      : `${fallbackTitle} > ${hotTitle}`;
  }

  const contrastTitle = movieTitles.get(contrastId) || '???';
  // If user ranked it higher (negative deviation): "X > Y"
  // If user ranked it lower (positive deviation): "Y > X"
  return bestCell.deviation < 0
    ? `${hotTitle} > ${contrastTitle}`
    : `${contrastTitle} > ${hotTitle}`;
}

// ============================================
// Share Text
// ============================================

// Keycap number emojis 1️⃣ through 9️⃣
const KEYCAP_NUMBERS = [
  '', // 0 unused
  '1\uFE0F\u20E3', // 1️⃣
  '2\uFE0F\u20E3', // 2️⃣
  '3\uFE0F\u20E3', // 3️⃣
  '4\uFE0F\u20E3', // 4️⃣
  '5\uFE0F\u20E3', // 5️⃣
  '6\uFE0F\u20E3', // 6️⃣
  '7\uFE0F\u20E3', // 7️⃣
  '8\uFE0F\u20E3', // 8️⃣
  '9\uFE0F\u20E3', // 9️⃣
];

/**
 * Generate shareable text with native Share API.
 * Grid uses keycap number emojis for seen movies, ⬛ for unseen.
 */
export function generateShareText(
  dailyNumber: number,
  categoryTitle: string,
  grid: DeviationCell[],
  seenCount: number,
  topMovieTitle: string,
  lastMovieTitle: string | null,
  blindspotTitle: string | null,
  hotTake: string | null,
  shareUrl?: string,
): string {
  const BLACK_SQUARE = '\u2B1B'; // ⬛

  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    const cells: string[] = [];
    for (let c = 0; c < 3; c++) {
      const cell = grid[r * 3 + c];
      if (cell.color === 'gray' || cell.userRank === null) {
        cells.push(BLACK_SQUARE);
      } else {
        cells.push(KEYCAP_NUMBERS[cell.userRank] || `${cell.userRank}`);
      }
    }
    rows.push(cells.join(''));
  }

  const lines: string[] = [
    `Aaybee Daily #${dailyNumber}: ${categoryTitle}`,
    `\uD83C\uDFAC ${seenCount}/9`,
    '',
    ...rows,
    '',
    `#1: ${topMovieTitle}`,
  ];

  if (lastMovieTitle) lines.push(`last: ${lastMovieTitle}`);
  if (blindspotTitle) lines.push(`blindspot: ${blindspotTitle}`);
  if (hotTake) lines.push(`hot take: ${hotTake}`);

  lines.push('');
  if (hotTake) {
    lines.push(`my hot take: ${hotTake}. prove me wrong:`);
  } else {
    lines.push(`play today's daily:`);
  }
  lines.push(shareUrl || 'https://aaybee.netlify.app/daily');

  return lines.join('\n');
}
