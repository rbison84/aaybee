/**
 * Tests for pair selection algorithm
 * Focuses on phase transitions and top-N refinement
 */

// Mock the logger to avoid console output
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// Mock discoveryService
jest.mock('../services/discoveryService', () => ({
  discoveryService: {
    generateDiscoveryPair: jest.fn().mockResolvedValue(null),
  },
}));

import { Movie, Genre } from '../types';

// We need to import internal functions - for now test through the public API
import {
  selectPair,
  createSession,
  getCurrentTier,
  getComparisonsForNextTier,
} from '../utils/pairSelector';

// Helper to create mock movies
function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  const id = overrides.id || `movie-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    title: overrides.title || `Movie ${id}`,
    year: overrides.year || 2000,
    genres: overrides.genres || ['drama'] as Genre[],
    posterUrl: '',
    posterColor: '#000',
    emoji: '',
    beta: overrides.beta ?? 0,
    totalWins: overrides.totalWins ?? 0,
    totalLosses: overrides.totalLosses ?? 0,
    totalComparisons: overrides.totalComparisons ?? 0,
    timesShown: overrides.timesShown ?? 0,
    lastShownAt: overrides.lastShownAt ?? 0,
    status: overrides.status || 'uncompared',
    tier: overrides.tier ?? 1,
    collectionId: overrides.collectionId,
    voteAverage: overrides.voteAverage ?? 7.0,
  };
}

// Create a pool of mock movies with different betas
function createMockMoviePool(count: number): Movie[] {
  return Array.from({ length: count }, (_, i) => createMockMovie({
    id: `movie-${i}`,
    title: `Movie ${i}`,
    beta: 2 - (i * 0.1), // Descending betas
    totalComparisons: 5,
    status: 'known',
    year: 1990 + i,
  }));
}

describe('getCurrentTier', () => {
  it('returns tier 1 for low comparison counts', () => {
    expect(getCurrentTier(0)).toBe(1);
    expect(getCurrentTier(100)).toBe(1);
    expect(getCurrentTier(199)).toBe(1);
  });

  it('returns tier 2 after 200 comparisons', () => {
    expect(getCurrentTier(200)).toBe(2);
    expect(getCurrentTier(399)).toBe(2);
  });

  it('returns tier 3 after 400 comparisons', () => {
    expect(getCurrentTier(400)).toBe(3);
    expect(getCurrentTier(749)).toBe(3);
  });

  it('returns tier 4 after 750 comparisons', () => {
    expect(getCurrentTier(750)).toBe(4);
    expect(getCurrentTier(1000)).toBe(4);
  });
});

describe('getComparisonsForNextTier', () => {
  it('returns comparisons needed for next tier', () => {
    expect(getComparisonsForNextTier(0)).toBe(200);
    expect(getComparisonsForNextTier(100)).toBe(100);
    expect(getComparisonsForNextTier(200)).toBe(200); // To tier 3
    expect(getComparisonsForNextTier(400)).toBe(350); // To tier 4
  });

  it('returns null when at max tier', () => {
    expect(getComparisonsForNextTier(750)).toBeNull();
    expect(getComparisonsForNextTier(1000)).toBeNull();
  });
});

describe('selectPair', () => {
  it('returns null when fewer than 2 movies', () => {
    const session = createSession();
    const result = selectPair([createMockMovie()], session);
    expect(result).toBeNull();
  });

  it('returns a pair when given valid movies', () => {
    const movies = createMockMoviePool(10);
    const session = createSession();
    session.totalComparisons = 50;

    const result = selectPair(movies, session, undefined, null, 50);

    expect(result).not.toBeNull();
    expect(result!.movieA).toBeDefined();
    expect(result!.movieB).toBeDefined();
    expect(result!.movieA.id).not.toBe(result!.movieB.id);
  });

  it('excludes unknown movies from selection', () => {
    const movies = [
      createMockMovie({ id: 'a', status: 'known' }),
      createMockMovie({ id: 'b', status: 'unknown' }),
      createMockMovie({ id: 'c', status: 'known' }),
    ];
    const session = createSession();
    session.totalComparisons = 50;

    // Run multiple times to verify unknown is never selected
    for (let i = 0; i < 20; i++) {
      const result = selectPair(movies, session, undefined, null, 50);
      expect(result).not.toBeNull();
      expect(result!.movieA.id).not.toBe('b');
      expect(result!.movieB.id).not.toBe('b');
    }
  });

  it('respects tier restrictions', () => {
    const movies = [
      createMockMovie({ id: 'tier1-a', tier: 1, status: 'known' }),
      createMockMovie({ id: 'tier1-b', tier: 1, status: 'known' }),
      createMockMovie({ id: 'tier2', tier: 2, status: 'known' }),
      createMockMovie({ id: 'tier3', tier: 3, status: 'known' }),
    ];
    const session = createSession();
    session.totalComparisons = 50; // Before tier 2 unlocks

    // Should only select tier 1 movies
    for (let i = 0; i < 20; i++) {
      const result = selectPair(movies, session, undefined, null, 50);
      expect(result).not.toBeNull();
      expect(result!.movieA.tier).toBe(1);
      expect(result!.movieB.tier).toBe(1);
    }
  });

  describe('collection/franchise filtering', () => {
    it('avoids pairing movies from the same collection', () => {
      const movies = [
        createMockMovie({ id: 'lotr1', title: 'LOTR 1', collectionId: 119, status: 'known', totalComparisons: 5 }),
        createMockMovie({ id: 'lotr2', title: 'LOTR 2', collectionId: 119, status: 'known', totalComparisons: 5 }),
        createMockMovie({ id: 'lotr3', title: 'LOTR 3', collectionId: 119, status: 'known', totalComparisons: 5 }),
        createMockMovie({ id: 'inception', title: 'Inception', status: 'known', totalComparisons: 5 }),
        createMockMovie({ id: 'interstellar', title: 'Interstellar', status: 'known', totalComparisons: 5 }),
      ];
      const session = createSession();
      session.totalComparisons = 100;

      // Run multiple times - should never pair two LOTR movies together
      for (let i = 0; i < 30; i++) {
        const result = selectPair(movies, session, undefined, null, 100);
        expect(result).not.toBeNull();

        const aIsLOTR = result!.movieA.collectionId === 119;
        const bIsLOTR = result!.movieB.collectionId === 119;

        // Should never have both from LOTR collection
        expect(aIsLOTR && bIsLOTR).toBe(false);
      }
    });

    it('returns null when only same-collection movies exist after deduplication', () => {
      // Only LOTR movies - after deduplication only one remains
      const movies = [
        createMockMovie({ id: 'lotr1', title: 'LOTR 1', collectionId: 119, status: 'known', totalComparisons: 5, voteAverage: 8.9 }),
        createMockMovie({ id: 'lotr2', title: 'LOTR 2', collectionId: 119, status: 'known', totalComparisons: 5, voteAverage: 8.7 }),
      ];
      const session = createSession();
      session.totalComparisons = 100;

      // After deduplication, only lotr1 (highest rated) remains - can't make a pair
      const result = selectPair(movies, session, undefined, null, 100);
      expect(result).toBeNull();
    });

    it('keeps highest-rated movie from each collection', () => {
      const movies = [
        createMockMovie({ id: 'lotr1', title: 'LOTR 1', collectionId: 119, status: 'known', totalComparisons: 5, voteAverage: 8.7 }),
        createMockMovie({ id: 'lotr3', title: 'LOTR 3', collectionId: 119, status: 'known', totalComparisons: 5, voteAverage: 8.9 }), // Highest
        createMockMovie({ id: 'lotr2', title: 'LOTR 2', collectionId: 119, status: 'known', totalComparisons: 5, voteAverage: 8.8 }),
        createMockMovie({ id: 'inception', title: 'Inception', status: 'known', totalComparisons: 5, voteAverage: 8.8 }),
      ];
      const session = createSession();
      session.totalComparisons = 100;

      // Should select LOTR 3 (highest rated) and Inception
      for (let i = 0; i < 20; i++) {
        const result = selectPair(movies, session, undefined, null, 100);
        expect(result).not.toBeNull();
        // LOTR 3 should be the one selected from the franchise
        const lotrMovie = result!.movieA.collectionId === 119 ? result!.movieA : result!.movieB;
        expect(lotrMovie.id).toBe('lotr3');
      }
    });

    it('allows multiple franchise movies in Tier 2+', () => {
      // Tier 2 movies from the same franchise should NOT be deduplicated
      const movies = [
        createMockMovie({ id: 'lotr1', title: 'LOTR 1', collectionId: 119, status: 'known', totalComparisons: 5, tier: 2 }),
        createMockMovie({ id: 'lotr2', title: 'LOTR 2', collectionId: 119, status: 'known', totalComparisons: 5, tier: 2 }),
        createMockMovie({ id: 'inception', title: 'Inception', status: 'known', totalComparisons: 5, tier: 2 }),
      ];
      const session = createSession();
      session.totalComparisons = 250; // Tier 2 unlocked

      // Should be able to pair any combination including two LOTR movies
      let bothLotrPaired = false;
      for (let i = 0; i < 50; i++) {
        const result = selectPair(movies, session, undefined, null, 250);
        if (result) {
          const aIsLOTR = result.movieA.collectionId === 119;
          const bIsLOTR = result.movieB.collectionId === 119;
          if (aIsLOTR && bIsLOTR) {
            bothLotrPaired = true;
            break;
          }
        }
      }

      // In Tier 2+, same-franchise pairing should be possible
      expect(bothLotrPaired).toBe(true);
    });
  });

  describe('known pair selection after consecutive skips', () => {
    it('selects known pair after 3 consecutive skips', () => {
      const movies = createMockMoviePool(10);
      const session = createSession();
      session.consecutiveSkips = 3;
      session.totalComparisons = 100;

      const result = selectPair(movies, session, undefined, null, 100);

      expect(result).not.toBeNull();
      expect(result!.strategy).toBe('known_pair');
      expect(result!.pairType).toBe('known_pair');
    });
  });

  describe('exploration mode', () => {
    it('prefers uncompared movies in exploration phase', () => {
      const movies = [
        createMockMovie({ id: 'new1', totalComparisons: 0, status: 'uncompared' }),
        createMockMovie({ id: 'new2', totalComparisons: 0, status: 'uncompared' }),
        createMockMovie({ id: 'old', totalComparisons: 10, status: 'known' }),
      ];
      const session = createSession();
      session.totalComparisons = 10; // Early exploration phase

      // Run multiple times - should frequently pick uncompared movies
      let uncomparedPairs = 0;
      for (let i = 0; i < 50; i++) {
        const result = selectPair(movies, session, undefined, null, 10);
        if (result?.movieA.totalComparisons === 0 || result?.movieB.totalComparisons === 0) {
          uncomparedPairs++;
        }
      }

      // Should select uncompared movies frequently in exploration mode
      expect(uncomparedPairs).toBeGreaterThan(20);
    });
  });
});

describe('phase multipliers (smooth transitions)', () => {
  // These tests verify the smooth transition behavior indirectly
  // by checking that selection behavior changes gradually

  it('early phase favors undercompared movies', () => {
    const movies = [
      createMockMovie({ id: 'new', totalComparisons: 1, status: 'known', beta: 0 }),
      createMockMovie({ id: 'established1', totalComparisons: 10, status: 'known', beta: 0.5 }),
      createMockMovie({ id: 'established2', totalComparisons: 10, status: 'known', beta: -0.5 }),
    ];
    const session = createSession();
    session.totalComparisons = 5; // Very early

    // In early phase, undercompared movies should be selected often
    let newMovieSelected = 0;
    for (let i = 0; i < 50; i++) {
      const result = selectPair(movies, session, undefined, null, 5);
      if (result?.movieA.id === 'new' || result?.movieB.id === 'new') {
        newMovieSelected++;
      }
    }

    // Should be selected frequently due to high undercompared multiplier
    expect(newMovieSelected).toBeGreaterThan(30);
  });
});
