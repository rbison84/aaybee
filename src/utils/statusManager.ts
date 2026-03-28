import { Movie, MovieStatus } from '../types';
import { logger } from './logger';

/**
 * Status System Overview:
 *
 * - uncompared: Never shown to user yet
 * - known: User made clear choices involving this movie (confident data)
 * - uncertain: User skipped once, or status is ambiguous
 * - unknown: User doesn't know this movie (skipped when paired with known)
 *
 * Status transitions are PAIR-AWARE - the outcome depends on BOTH movies' statuses.
 */

// Beta confidence levels for different comparison scenarios
export const CONFIDENCE_LEVELS = {
  HIGH: 1.0,      // Known vs Known choice - most reliable
  MEDIUM: 0.7,    // Uncertain vs Uncertain choice, or mixed with choice
  LOW: 0.4,       // Unknown involved in choice, or uncertain scenarios
  MINIMAL: 0.15,  // Skip with uncertain states
  NONE: 0,        // No beta update (e.g., Known vs Unknown skip)
} as const;

export type ConfidenceLevel = keyof typeof CONFIDENCE_LEVELS;

interface ComparisonResult {
  movieAStatus: MovieStatus;
  movieBStatus: MovieStatus;
  confidence: ConfidenceLevel;
  reason: string;
}

/**
 * Normalize status pair to consistent order for lookup
 * Returns [lowerPriority, higherPriority] and whether we swapped
 */
function normalizeStatusPair(
  statusA: MovieStatus,
  statusB: MovieStatus
): { first: MovieStatus; second: MovieStatus; swapped: boolean } {
  const priority: Record<MovieStatus, number> = {
    uncompared: 1,
    known: 2,
    uncertain: 3,
    unknown: 4,
  };

  if (priority[statusA] <= priority[statusB]) {
    return { first: statusA, second: statusB, swapped: false };
  }
  return { first: statusB, second: statusA, swapped: true };
}

/**
 * Get status transitions for a CHOICE (user picked A or B)
 * Winner is the movie that was chosen
 */
function getChoiceTransition(
  statusA: MovieStatus,
  statusB: MovieStatus,
  aWasChosen: boolean
): ComparisonResult {
  const { first, second, swapped } = normalizeStatusPair(statusA, statusB);
  const key = `${first}_${second}` as const;

  // Determine which normalized position was chosen
  const firstWasChosen = swapped ? !aWasChosen : aWasChosen;

  let result: { first: MovieStatus; second: MovieStatus; confidence: ConfidenceLevel; reason: string };

  switch (key) {
    // Uncompared vs Uncompared + Choice
    case 'uncompared_uncompared':
      result = {
        first: 'known',
        second: 'known',
        confidence: 'HIGH',
        reason: 'Both movies now known from direct comparison',
      };
      break;

    // Uncompared vs Known + Choice
    case 'uncompared_known':
      result = {
        first: 'known',  // Uncompared becomes Known
        second: 'known', // Known stays Known
        confidence: 'HIGH',
        reason: 'Uncompared now known; compared against known movie',
      };
      break;

    // Uncompared vs Uncertain + Choice
    case 'uncompared_uncertain':
      result = {
        first: 'known',  // Uncompared becomes Known
        second: 'known', // Uncertain becomes Known (they made a choice!)
        confidence: 'MEDIUM',
        reason: 'Both become known from choice; was uncertain',
      };
      break;

    // Uncompared vs Unknown + Choice
    case 'uncompared_unknown':
      // Uncompared becomes Known
      // Unknown becomes Uncertain IF it was chosen (user knows it somewhat)
      result = {
        first: 'known',
        second: firstWasChosen ? 'unknown' : 'uncertain', // Unknown→Uncertain only if Unknown was chosen
        confidence: 'LOW',
        reason: firstWasChosen
          ? 'Uncompared now known; Unknown remains (wasn\'t chosen)'
          : 'Uncompared now known; Unknown promoted to uncertain (was chosen)',
      };
      // Wait, need to reconsider: if first=uncompared, second=unknown
      // firstWasChosen means uncompared was chosen
      // So if uncompared was chosen, unknown stays unknown
      // If unknown was chosen, unknown becomes uncertain
      break;

    // Known vs Known + Choice
    case 'known_known':
      result = {
        first: 'known',
        second: 'known',
        confidence: 'HIGH',
        reason: 'Both remain known; high confidence comparison',
      };
      break;

    // Known vs Uncertain + Choice
    case 'known_uncertain':
      result = {
        first: 'known',  // Known stays Known
        second: 'known', // Uncertain becomes Known (they made a choice!)
        confidence: 'MEDIUM',
        reason: 'Uncertain promoted to known; made a clear choice',
      };
      break;

    // Known vs Unknown + Choice
    case 'known_unknown':
      // Known stays Known
      // Unknown becomes Uncertain IF it was chosen
      result = {
        first: 'known',
        second: firstWasChosen ? 'unknown' : 'uncertain', // If Known (first) was chosen, Unknown stays
        confidence: 'LOW',
        reason: firstWasChosen
          ? 'Known remains; Unknown stays (wasn\'t chosen)'
          : 'Known remains; Unknown promoted to uncertain (was chosen)',
      };
      break;

    // Uncertain vs Uncertain + Choice
    case 'uncertain_uncertain':
      result = {
        first: 'known',
        second: 'known',
        confidence: 'MEDIUM',
        reason: 'Both become known; made choice between uncertain movies',
      };
      break;

    // Uncertain vs Unknown + Choice
    case 'uncertain_unknown':
      result = {
        first: 'known',  // Uncertain becomes Known
        second: firstWasChosen ? 'unknown' : 'known', // Unknown becomes Known only if chosen
        confidence: 'LOW',
        reason: firstWasChosen
          ? 'Uncertain now known; Unknown remains (wasn\'t chosen)'
          : 'Both become known from choice',
      };
      break;

    // Unknown vs Unknown + Choice
    case 'unknown_unknown':
      result = {
        first: 'uncertain',
        second: 'uncertain',
        confidence: 'MINIMAL',
        reason: 'Both promoted to uncertain; minimal confidence',
      };
      break;

    default:
      result = {
        first: statusA,
        second: statusB,
        confidence: 'LOW',
        reason: 'Unknown combination - minimal change',
      };
  }

  // Unswap if needed
  if (swapped) {
    return {
      movieAStatus: result.second,
      movieBStatus: result.first,
      confidence: result.confidence,
      reason: result.reason,
    };
  }

  return {
    movieAStatus: result.first,
    movieBStatus: result.second,
    confidence: result.confidence,
    reason: result.reason,
  };
}

/**
 * Get status transitions for a SKIP ("I'm not sure")
 */
function getSkipTransition(
  statusA: MovieStatus,
  statusB: MovieStatus
): ComparisonResult {
  const { first, second, swapped } = normalizeStatusPair(statusA, statusB);
  const key = `${first}_${second}` as const;

  let result: { first: MovieStatus; second: MovieStatus; confidence: ConfidenceLevel; reason: string };

  switch (key) {
    // Uncompared vs Uncompared + Skip
    case 'uncompared_uncompared':
      result = {
        first: 'uncertain',
        second: 'uncertain',
        confidence: 'MINIMAL',
        reason: 'Both become uncertain; user unsure about both',
      };
      break;

    // Uncompared vs Known + Skip
    case 'uncompared_known':
      result = {
        first: 'unknown',   // Uncompared becomes Unknown (user doesn't know it)
        second: 'known',    // Known stays Known
        confidence: 'NONE',
        reason: 'Uncompared marked unknown; user knows the other but not this',
      };
      break;

    // Uncompared vs Uncertain + Skip
    case 'uncompared_uncertain':
      result = {
        first: 'uncertain',
        second: 'uncertain',
        confidence: 'MINIMAL',
        reason: 'Both uncertain; skip indicates unfamiliarity',
      };
      break;

    // Uncompared vs Unknown + Skip
    case 'uncompared_unknown':
      result = {
        first: 'uncertain',  // Uncompared becomes Uncertain
        second: 'unknown',   // Unknown stays Unknown
        confidence: 'NONE',
        reason: 'Uncompared becomes uncertain; Unknown remains',
      };
      break;

    // Known vs Known + Skip
    case 'known_known':
      result = {
        first: 'uncertain',
        second: 'uncertain',
        confidence: 'MINIMAL',
        reason: 'Both demoted to uncertain; can\'t decide between known movies',
      };
      break;

    // Known vs Uncertain + Skip
    case 'known_uncertain':
      result = {
        first: 'known',     // Known stays Known
        second: 'unknown',  // Uncertain becomes Unknown
        confidence: 'MINIMAL',
        reason: 'Uncertain demoted to unknown; couldn\'t decide',
      };
      break;

    // Known vs Unknown + Skip
    case 'known_unknown':
      result = {
        first: 'known',   // Known stays Known
        second: 'unknown', // Unknown stays Unknown
        confidence: 'NONE',
        reason: 'No change; expected skip when one is unknown',
      };
      break;

    // Uncertain vs Uncertain + Skip
    case 'uncertain_uncertain':
      result = {
        first: 'uncertain',
        second: 'uncertain',
        confidence: 'MINIMAL',
        reason: 'Both remain uncertain; skip reinforces uncertainty',
      };
      break;

    // Uncertain vs Unknown + Skip
    case 'uncertain_unknown':
      result = {
        first: 'uncertain',  // Uncertain stays Uncertain
        second: 'unknown',   // Unknown stays Unknown
        confidence: 'NONE',
        reason: 'No change; uncertain vs unknown skip expected',
      };
      break;

    // Unknown vs Unknown + Skip
    case 'unknown_unknown':
      result = {
        first: 'unknown',
        second: 'unknown',
        confidence: 'NONE',
        reason: 'Both remain unknown; user knows neither',
      };
      break;

    default:
      result = {
        first: statusA,
        second: statusB,
        confidence: 'NONE',
        reason: 'Unknown combination - no change',
      };
  }

  // Unswap if needed
  if (swapped) {
    return {
      movieAStatus: result.second,
      movieBStatus: result.first,
      confidence: result.confidence,
      reason: result.reason,
    };
  }

  return {
    movieAStatus: result.first,
    movieBStatus: result.second,
    confidence: result.confidence,
    reason: result.reason,
  };
}

/**
 * Process a comparison result and update both movies
 * Returns updated movie objects with confidence level for beta update
 */
export function processComparison(
  movieA: Movie,
  movieB: Movie,
  winnerId: string | null // null if skipped
): { movieA: Movie; movieB: Movie; skipped: boolean; confidence: ConfidenceLevel } {

  const isSkip = winnerId === null;
  const aWasChosen = winnerId === movieA.id;

  const transition = isSkip
    ? getSkipTransition(movieA.status, movieB.status)
    : getChoiceTransition(movieA.status, movieB.status, aWasChosen);

  const updatedA: Movie = {
    ...movieA,
    status: transition.movieAStatus,
  };

  const updatedB: Movie = {
    ...movieB,
    status: transition.movieBStatus,
  };

  logger.debug(
    'Status',
    `${movieA.status}/${movieB.status} + ${isSkip ? 'SKIP' : 'CHOICE'} → ${transition.movieAStatus}/${transition.movieBStatus} (${transition.confidence}): ${transition.reason}`
  );

  return {
    movieA: updatedA,
    movieB: updatedB,
    skipped: isSkip,
    confidence: transition.confidence,
  };
}

/**
 * Get the K-factor multiplier based on confidence level
 */
export function getConfidenceMultiplier(confidence: ConfidenceLevel): number {
  return CONFIDENCE_LEVELS[confidence];
}

/**
 * Status priorities for matchmaking
 * Lower = should be shown sooner
 */
export const STATUS_PRIORITY: Record<MovieStatus, number> = {
  uncompared: 1,  // Highest priority - gather initial data
  uncertain: 2,   // Try again to get clear signal
  known: 3,       // Good, but can always compare more
  unknown: 4,     // Lowest priority - user doesn't know it
};

/**
 * Check if a movie should be shown to user
 * (Avoid showing unknown movies too often)
 */
export function shouldShowMovie(movie: Movie, recentlyShown: string[]): boolean {
  // Never show unknown movies (user doesn't know them)
  if (movie.status === 'unknown') {
    return false;
  }

  // Avoid recently shown movies
  if (recentlyShown.includes(movie.id)) {
    return false;
  }

  return true;
}

/**
 * Get status emoji for debug display
 */
export function getStatusEmoji(status: MovieStatus): string {
  switch (status) {
    case 'uncompared': return '⬜';
    case 'known': return '✅';
    case 'uncertain': return '❓';
    case 'unknown': return '❌';
    default: return '?';
  }
}

/**
 * Get human-readable status description
 */
export function getStatusDescription(status: MovieStatus): string {
  switch (status) {
    case 'uncompared': return 'Not yet shown';
    case 'known': return 'User knows this movie';
    case 'uncertain': return 'User is unsure about this';
    case 'unknown': return 'User doesn\'t know this';
    default: return 'Unknown status';
  }
}

// Legacy exports for backward compatibility
export function getNextStatus(
  currentStatus: MovieStatus,
  action: 'choose' | 'skip',
  wasChosen: boolean | null
): { newStatus: MovieStatus; changed: boolean; reason: string } {
  // This is a simplified single-movie version for backward compatibility
  // The full pair-aware logic is in processComparison

  if (action === 'skip') {
    switch (currentStatus) {
      case 'uncompared':
        return { newStatus: 'uncertain', changed: true, reason: 'Skip on uncompared' };
      case 'uncertain':
        return { newStatus: 'unknown', changed: true, reason: 'Second skip' };
      case 'known':
        return { newStatus: 'uncertain', changed: true, reason: 'Skip on known' };
      case 'unknown':
        return { newStatus: 'unknown', changed: false, reason: 'Already unknown' };
    }
  }

  // Choice
  switch (currentStatus) {
    case 'uncompared':
      return { newStatus: 'known', changed: true, reason: 'Choice made' };
    case 'uncertain':
      return { newStatus: 'known', changed: true, reason: 'Choice clarified uncertainty' };
    case 'known':
      return { newStatus: 'known', changed: false, reason: 'Already known' };
    case 'unknown':
      return { newStatus: 'uncertain', changed: true, reason: 'Unknown but chose' };
  }

  return { newStatus: currentStatus, changed: false, reason: 'No change' };
}

export function updateMovieStatus(
  movie: Movie,
  action: 'choose' | 'skip',
  wasChosen: boolean | null
): Movie {
  const result = getNextStatus(movie.status, action, wasChosen);
  if (!result.changed) return movie;
  return { ...movie, status: result.newStatus };
}
