import {
  processComparison,
  getConfidenceMultiplier,
  getStatusEmoji,
  CONFIDENCE_LEVELS,
  shouldShowMovie,
} from '../utils/statusManager';
import { Movie, MovieStatus } from '../types';

// Helper to create a mock movie
function createMockMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'test-movie-1',
    title: 'Test Movie',
    year: 2020,
    genres: ['drama'],
    posterUrl: '',
    posterColor: '#000',
    emoji: '',
    beta: 0,
    totalWins: 0,
    totalLosses: 0,
    totalComparisons: 0,
    timesShown: 0,
    lastShownAt: 0,
    status: 'uncompared',
    ...overrides,
  };
}

describe('processComparison - Choice scenarios', () => {
  describe('uncompared vs uncompared', () => {
    it('both become known with high confidence', () => {
      const movieA = createMockMovie({ id: 'a', status: 'uncompared' });
      const movieB = createMockMovie({ id: 'b', status: 'uncompared' });

      const result = processComparison(movieA, movieB, 'a');

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('known');
      expect(result.confidence).toBe('HIGH');
      expect(result.skipped).toBe(false);
    });
  });

  describe('uncompared vs known', () => {
    it('uncompared becomes known with high confidence', () => {
      const movieA = createMockMovie({ id: 'a', status: 'uncompared' });
      const movieB = createMockMovie({ id: 'b', status: 'known' });

      const result = processComparison(movieA, movieB, 'a');

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('known');
      expect(result.confidence).toBe('HIGH');
    });
  });

  describe('known vs known', () => {
    it('both stay known with high confidence', () => {
      const movieA = createMockMovie({ id: 'a', status: 'known' });
      const movieB = createMockMovie({ id: 'b', status: 'known' });

      const result = processComparison(movieA, movieB, 'a');

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('known');
      expect(result.confidence).toBe('HIGH');
    });
  });

  describe('uncertain vs uncertain', () => {
    it('both become known with medium confidence', () => {
      const movieA = createMockMovie({ id: 'a', status: 'uncertain' });
      const movieB = createMockMovie({ id: 'b', status: 'uncertain' });

      const result = processComparison(movieA, movieB, 'a');

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('known');
      expect(result.confidence).toBe('MEDIUM');
    });
  });

  describe('known vs unknown', () => {
    it('unknown becomes uncertain when chosen', () => {
      const movieA = createMockMovie({ id: 'a', status: 'known' });
      const movieB = createMockMovie({ id: 'b', status: 'unknown' });

      // B (unknown) is chosen
      const result = processComparison(movieA, movieB, 'b');

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('uncertain');
      expect(result.confidence).toBe('LOW');
    });

    it('unknown stays unknown when not chosen', () => {
      const movieA = createMockMovie({ id: 'a', status: 'known' });
      const movieB = createMockMovie({ id: 'b', status: 'unknown' });

      // A (known) is chosen
      const result = processComparison(movieA, movieB, 'a');

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('unknown');
      expect(result.confidence).toBe('LOW');
    });
  });
});

describe('processComparison - Skip scenarios', () => {
  describe('uncompared vs uncompared', () => {
    it('both become uncertain with minimal confidence', () => {
      const movieA = createMockMovie({ id: 'a', status: 'uncompared' });
      const movieB = createMockMovie({ id: 'b', status: 'uncompared' });

      const result = processComparison(movieA, movieB, null);

      expect(result.movieA.status).toBe('uncertain');
      expect(result.movieB.status).toBe('uncertain');
      expect(result.confidence).toBe('MINIMAL');
      expect(result.skipped).toBe(true);
    });
  });

  describe('uncompared vs known', () => {
    it('uncompared becomes unknown, known stays known', () => {
      const movieA = createMockMovie({ id: 'a', status: 'uncompared' });
      const movieB = createMockMovie({ id: 'b', status: 'known' });

      const result = processComparison(movieA, movieB, null);

      expect(result.movieA.status).toBe('unknown');
      expect(result.movieB.status).toBe('known');
      expect(result.confidence).toBe('NONE');
    });
  });

  describe('known vs known', () => {
    it('both demoted to uncertain', () => {
      const movieA = createMockMovie({ id: 'a', status: 'known' });
      const movieB = createMockMovie({ id: 'b', status: 'known' });

      const result = processComparison(movieA, movieB, null);

      expect(result.movieA.status).toBe('uncertain');
      expect(result.movieB.status).toBe('uncertain');
      expect(result.confidence).toBe('MINIMAL');
    });
  });

  describe('known vs unknown', () => {
    it('no change, confidence none', () => {
      const movieA = createMockMovie({ id: 'a', status: 'known' });
      const movieB = createMockMovie({ id: 'b', status: 'unknown' });

      const result = processComparison(movieA, movieB, null);

      expect(result.movieA.status).toBe('known');
      expect(result.movieB.status).toBe('unknown');
      expect(result.confidence).toBe('NONE');
    });
  });

  describe('unknown vs unknown', () => {
    it('both stay unknown with no confidence', () => {
      const movieA = createMockMovie({ id: 'a', status: 'unknown' });
      const movieB = createMockMovie({ id: 'b', status: 'unknown' });

      const result = processComparison(movieA, movieB, null);

      expect(result.movieA.status).toBe('unknown');
      expect(result.movieB.status).toBe('unknown');
      expect(result.confidence).toBe('NONE');
    });
  });
});

describe('getConfidenceMultiplier', () => {
  it('returns correct multipliers for each level', () => {
    expect(getConfidenceMultiplier('HIGH')).toBe(1.0);
    expect(getConfidenceMultiplier('MEDIUM')).toBe(0.7);
    expect(getConfidenceMultiplier('LOW')).toBe(0.4);
    expect(getConfidenceMultiplier('MINIMAL')).toBe(0.15);
    expect(getConfidenceMultiplier('NONE')).toBe(0);
  });

  it('multipliers are correctly ordered', () => {
    expect(CONFIDENCE_LEVELS.HIGH).toBeGreaterThan(CONFIDENCE_LEVELS.MEDIUM);
    expect(CONFIDENCE_LEVELS.MEDIUM).toBeGreaterThan(CONFIDENCE_LEVELS.LOW);
    expect(CONFIDENCE_LEVELS.LOW).toBeGreaterThan(CONFIDENCE_LEVELS.MINIMAL);
    expect(CONFIDENCE_LEVELS.MINIMAL).toBeGreaterThan(CONFIDENCE_LEVELS.NONE);
  });
});

describe('getStatusEmoji', () => {
  it('returns correct emojis', () => {
    expect(getStatusEmoji('uncompared')).toBe('⬜');
    expect(getStatusEmoji('known')).toBe('✅');
    expect(getStatusEmoji('uncertain')).toBe('❓');
    expect(getStatusEmoji('unknown')).toBe('❌');
  });
});

describe('shouldShowMovie', () => {
  it('returns false for unknown movies', () => {
    const movie = createMockMovie({ status: 'unknown' });
    expect(shouldShowMovie(movie, [])).toBe(false);
  });

  it('returns false for recently shown movies', () => {
    const movie = createMockMovie({ id: 'test-1', status: 'known' });
    expect(shouldShowMovie(movie, ['test-1', 'test-2'])).toBe(false);
  });

  it('returns true for known movies not recently shown', () => {
    const movie = createMockMovie({ id: 'test-1', status: 'known' });
    expect(shouldShowMovie(movie, ['test-2', 'test-3'])).toBe(true);
  });

  it('returns true for uncompared movies', () => {
    const movie = createMockMovie({ status: 'uncompared' });
    expect(shouldShowMovie(movie, [])).toBe(true);
  });

  it('returns true for uncertain movies', () => {
    const movie = createMockMovie({ status: 'uncertain' });
    expect(shouldShowMovie(movie, [])).toBe(true);
  });
});
