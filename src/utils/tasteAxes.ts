// ============================================
// MOVIE TASTE AXES — 5 dimensions of movie preference
// ============================================

export interface TasteAxes {
  era: number;        // -1 (classic) to +1 (modern)
  mood: number;       // -1 (light/fun) to +1 (dark/serious)
  pace: number;       // -1 (slow/contemplative) to +1 (fast/action)
  scope: number;      // -1 (intimate/indie) to +1 (epic/spectacle)
  popularity: number; // -1 (obscure/arthouse) to +1 (mainstream/popular)
}

export interface MovieArchetype {
  name: string;
  subtitle: string;
  dominantAxis: keyof TasteAxes;
  direction: 'high' | 'low';
}

// ============================================
// ARCHETYPES
// ============================================

const ARCHETYPES: MovieArchetype[] = [
  { name: 'The Auteur', subtitle: 'you see cinema as art, not entertainment', dominantAxis: 'popularity', direction: 'low' },
  { name: 'The Blockbuster', subtitle: 'you know what the people want', dominantAxis: 'popularity', direction: 'high' },
  { name: 'The Classicist', subtitle: 'they really don\'t make them like they used to', dominantAxis: 'era', direction: 'low' },
  { name: 'The Modernist', subtitle: 'cinema peaked and it\'s peaking right now', dominantAxis: 'era', direction: 'high' },
  { name: 'The Night Owl', subtitle: 'the darker the better, hold the happy endings', dominantAxis: 'mood', direction: 'high' },
  { name: 'The Comfort Rewatcher', subtitle: 'movies should feel like a warm blanket', dominantAxis: 'mood', direction: 'low' },
  { name: 'The Thrill Seeker', subtitle: 'if nothing exploded, did anything happen?', dominantAxis: 'pace', direction: 'high' },
  { name: 'The Slow Burner', subtitle: 'patience is a virtue, and a genre', dominantAxis: 'pace', direction: 'low' },
  { name: 'The Epic Lover', subtitle: 'go big or go home, preferably on IMAX', dominantAxis: 'scope', direction: 'high' },
  { name: 'The Indie Kid', subtitle: 'the best stories happen in small rooms', dominantAxis: 'scope', direction: 'low' },
];

const BALANCED_ARCHETYPE: MovieArchetype = {
  name: 'The Omnivore',
  subtitle: 'you\'ll watch anything and love most of it',
  dominantAxis: 'era',
  direction: 'high',
};

/**
 * Compute taste axes from a user's top movies.
 * Takes arrays of: movie years, genres, global popularity ranks, and user beta scores.
 */
export function computeTasteAxes(
  movies: { year: number; genres: string[]; globalBeta?: number; userBeta: number; popularity?: number }[],
): TasteAxes {
  if (movies.length === 0) {
    return { era: 0, mood: 0, pace: 0, scope: 0, popularity: 0 };
  }

  // ERA: average year normalized to -1..+1 (1950=-1, 2025=+1)
  const avgYear = movies.reduce((s, m) => s + m.year, 0) / movies.length;
  const era = Math.max(-1, Math.min(1, (avgYear - 1987.5) / 37.5));

  // MOOD: genre-based. Dark genres score positive, light genres score negative.
  const darkGenres = new Set(['horror', 'thriller', 'crime', 'war', 'drama']);
  const lightGenres = new Set(['comedy', 'animation', 'family', 'music', 'romance']);
  let moodSum = 0;
  let moodCount = 0;
  for (const m of movies) {
    for (const g of m.genres) {
      if (darkGenres.has(g)) { moodSum += 1; moodCount++; }
      else if (lightGenres.has(g)) { moodSum -= 1; moodCount++; }
    }
  }
  const mood = moodCount > 0 ? Math.max(-1, Math.min(1, moodSum / moodCount)) : 0;

  // PACE: genre-based. Action/adventure score high, drama/art score low.
  const fastGenres = new Set(['action', 'adventure', 'thriller', 'scifi']);
  const slowGenres = new Set(['drama', 'romance', 'history', 'documentary']);
  let paceSum = 0;
  let paceCount = 0;
  for (const m of movies) {
    for (const g of m.genres) {
      if (fastGenres.has(g)) { paceSum += 1; paceCount++; }
      else if (slowGenres.has(g)) { paceSum -= 1; paceCount++; }
    }
  }
  const pace = paceCount > 0 ? Math.max(-1, Math.min(1, paceSum / paceCount)) : 0;

  // SCOPE: genre-based. Epic/spectacle genres score high, intimate genres score low.
  const epicGenres = new Set(['scifi', 'fantasy', 'adventure', 'war', 'action']);
  const intimateGenres = new Set(['drama', 'romance', 'comedy', 'music', 'documentary']);
  let scopeSum = 0;
  let scopeCount = 0;
  for (const m of movies) {
    for (const g of m.genres) {
      if (epicGenres.has(g)) { scopeSum += 1; scopeCount++; }
      else if (intimateGenres.has(g)) { scopeSum -= 1; scopeCount++; }
    }
  }
  const scope = scopeCount > 0 ? Math.max(-1, Math.min(1, scopeSum / scopeCount)) : 0;

  // POPULARITY: based on global beta (how popular vs niche user's picks are)
  const popularityScores = movies.filter(m => m.globalBeta !== undefined).map(m => m.globalBeta!);
  let popularity = 0;
  if (popularityScores.length > 0) {
    const avgGlobalBeta = popularityScores.reduce((s, b) => s + b, 0) / popularityScores.length;
    // Normalize: global beta > 0 means popular, < 0 means niche
    popularity = Math.max(-1, Math.min(1, avgGlobalBeta / 2));
  }

  return { era, mood, pace, scope, popularity };
}

/**
 * Get the movie archetype based on taste axes.
 */
export function getArchetype(axes: TasteAxes): MovieArchetype {
  const entries: [keyof TasteAxes, number][] = [
    ['era', axes.era],
    ['mood', axes.mood],
    ['pace', axes.pace],
    ['scope', axes.scope],
    ['popularity', axes.popularity],
  ];

  // Find strongest axis
  let maxVal = 0;
  let maxKey: keyof TasteAxes = 'era';
  let maxDirection: 'high' | 'low' = 'high';
  for (const [key, val] of entries) {
    if (Math.abs(val) > maxVal) {
      maxVal = Math.abs(val);
      maxKey = key;
      maxDirection = val >= 0 ? 'high' : 'low';
    }
  }

  // If all axes are balanced (< 0.15), return omnivore
  if (maxVal < 0.15) return BALANCED_ARCHETYPE;

  return ARCHETYPES.find(a => a.dominantAxis === maxKey && a.direction === maxDirection) || BALANCED_ARCHETYPE;
}

/**
 * Axis labels for display
 */
export const AXIS_LABELS: Record<keyof TasteAxes, { low: string; high: string }> = {
  era: { low: 'Classic', high: 'Modern' },
  mood: { low: 'Light', high: 'Dark' },
  pace: { low: 'Slow Burn', high: 'Fast' },
  scope: { low: 'Intimate', high: 'Epic' },
  popularity: { low: 'Indie', high: 'Mainstream' },
};

/**
 * Generate a pithy comparison summary between two taste profiles
 */
export function generateComparisonSummary(a: TasteAxes, b: TasteAxes): string {
  const axes: (keyof TasteAxes)[] = ['era', 'mood', 'pace', 'scope', 'popularity'];
  const diffs = axes.map(k => ({ key: k, diff: Math.abs(a[k] - b[k]) }));
  const totalDiff = diffs.reduce((s, d) => s + d.diff, 0);
  const biggestDiff = diffs.sort((x, y) => y.diff - x.diff)[0];

  if (totalDiff < 1.0) return "eerily similar — you might be the same person";
  if (totalDiff < 2.0) {
    const axis = AXIS_LABELS[biggestDiff.key];
    return `aligned on most things, but split on ${axis.low.toLowerCase()} vs ${axis.high.toLowerCase()}`;
  }
  if (totalDiff < 3.0) return "some overlap, but you'd argue about what to watch";
  return "opposites attract, apparently";
}
