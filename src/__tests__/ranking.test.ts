import {
  getAdaptiveK,
  calculateExpectedScore,
  calculateBetaUpdate,
  calculateWeightedScore,
  getTierFromPosition,
  K_BASE,
  K_FLOOR,
} from '../utils/ranking';

describe('getAdaptiveK', () => {
  it('returns maximum K for 0 comparisons', () => {
    const k = getAdaptiveK(0);
    // K_BASE * (1 + K_FLOOR) = 0.5 * 1.25 = 0.625
    expect(k).toBeCloseTo(0.625);
  });

  it('decreases K as comparisons increase', () => {
    const k0 = getAdaptiveK(0);
    const k10 = getAdaptiveK(10);
    const k50 = getAdaptiveK(50);

    expect(k0).toBeGreaterThan(k10);
    expect(k10).toBeGreaterThan(k50);
  });

  it('never goes below minimum K', () => {
    const kMin = K_BASE * K_FLOOR; // 0.5 * 0.25 = 0.125
    const k100 = getAdaptiveK(100);
    const k1000 = getAdaptiveK(1000);

    expect(k100).toBeGreaterThanOrEqual(kMin);
    expect(k1000).toBeGreaterThanOrEqual(kMin);
  });

  it('converges to K_BASE * K_FLOOR for large comparisons', () => {
    const kLarge = getAdaptiveK(1000);
    const kMin = K_BASE * K_FLOOR;

    // Should be very close to minimum
    expect(kLarge).toBeCloseTo(kMin, 2);
  });
});

describe('calculateExpectedScore', () => {
  it('returns 0.5 for equal betas', () => {
    expect(calculateExpectedScore(0, 0)).toBeCloseTo(0.5);
    expect(calculateExpectedScore(1, 1)).toBeCloseTo(0.5);
    expect(calculateExpectedScore(-1, -1)).toBeCloseTo(0.5);
  });

  it('returns higher probability when A has higher beta', () => {
    const prob = calculateExpectedScore(1, 0);
    expect(prob).toBeGreaterThan(0.5);
  });

  it('returns lower probability when A has lower beta', () => {
    const prob = calculateExpectedScore(0, 1);
    expect(prob).toBeLessThan(0.5);
  });

  it('is symmetric around 0.5', () => {
    const probA = calculateExpectedScore(1, 0);
    const probB = calculateExpectedScore(0, 1);
    expect(probA + probB).toBeCloseTo(1);
  });

  it('handles extreme differences', () => {
    const probHigh = calculateExpectedScore(4, -4);
    const probLow = calculateExpectedScore(-4, 4);

    expect(probHigh).toBeGreaterThan(0.99);
    expect(probLow).toBeLessThan(0.01);
  });
});

describe('calculateBetaUpdate', () => {
  it('increases winner beta and decreases loser beta', () => {
    const [newA, newB] = calculateBetaUpdate(0, 0, true, 0.5, 0.5);

    expect(newA).toBeGreaterThan(0);
    expect(newB).toBeLessThan(0);
  });

  it('changes are symmetric when K values are equal', () => {
    const [newA, newB] = calculateBetaUpdate(0, 0, true, 0.5, 0.5);

    expect(Math.abs(newA)).toBeCloseTo(Math.abs(newB));
  });

  it('smaller update when outcome matches expectation', () => {
    // A has much higher beta, expected to win - small delta
    const [newA1] = calculateBetaUpdate(2, 0, true, 0.5, 0.5);
    const deltaExpected = newA1 - 2; // Change from initial beta

    // A has lower beta, upset win - large delta
    const [newA2] = calculateBetaUpdate(0, 2, true, 0.5, 0.5);
    const deltaUpset = newA2 - 0; // Change from initial beta

    // Upset win should cause larger positive change
    expect(deltaUpset).toBeGreaterThan(deltaExpected);
  });

  it('clamps values to [-4, 4] range', () => {
    // Try to push beyond bounds
    const [newA, newB] = calculateBetaUpdate(3.9, -3.9, true, 1.0, 1.0);

    expect(newA).toBeLessThanOrEqual(4);
    expect(newB).toBeGreaterThanOrEqual(-4);
  });

  it('respects different K values for each movie', () => {
    // Movie A has high K (new), Movie B has low K (established)
    const [newA, newB] = calculateBetaUpdate(0, 0, true, 0.6, 0.2);

    // A should change more than B
    expect(Math.abs(newA)).toBeGreaterThan(Math.abs(newB));
  });
});

describe('calculateWeightedScore', () => {
  it('returns 0 for 0 votes', () => {
    expect(calculateWeightedScore(8.0, 0)).toBe(0);
  });

  it('returns 0 for negative votes', () => {
    expect(calculateWeightedScore(8.0, -1)).toBe(0);
  });

  it('higher rating increases score', () => {
    const score1 = calculateWeightedScore(7.0, 1000);
    const score2 = calculateWeightedScore(8.0, 1000);

    expect(score2).toBeGreaterThan(score1);
  });

  it('higher vote count increases score logarithmically', () => {
    const score100 = calculateWeightedScore(8.0, 100);
    const score1000 = calculateWeightedScore(8.0, 1000);
    const score10000 = calculateWeightedScore(8.0, 10000);

    // Each 10x increase in votes should add same increment
    const diff1 = score1000 - score100;
    const diff2 = score10000 - score1000;

    expect(diff1).toBeCloseTo(diff2, 1);
  });

  it('balances rating and popularity correctly', () => {
    // High rating, low votes
    const niche = calculateWeightedScore(9.0, 100);
    // Lower rating, high votes
    const popular = calculateWeightedScore(7.5, 10000);

    // Popular should win in weighted score
    expect(popular).toBeGreaterThan(niche);
  });
});

describe('getTierFromPosition', () => {
  it('returns tier 1 for positions 0-99', () => {
    expect(getTierFromPosition(0)).toBe(1);
    expect(getTierFromPosition(50)).toBe(1);
    expect(getTierFromPosition(99)).toBe(1);
  });

  it('returns tier 2 for positions 100-174', () => {
    expect(getTierFromPosition(100)).toBe(2);
    expect(getTierFromPosition(150)).toBe(2);
    expect(getTierFromPosition(174)).toBe(2);
  });

  it('returns tier 3 for positions 175-274', () => {
    expect(getTierFromPosition(175)).toBe(3);
    expect(getTierFromPosition(200)).toBe(3);
    expect(getTierFromPosition(274)).toBe(3);
  });

  it('returns tier 4 for positions 275+', () => {
    expect(getTierFromPosition(275)).toBe(4);
    expect(getTierFromPosition(500)).toBe(4);
    expect(getTierFromPosition(1000)).toBe(4);
  });
});
