// Curated movie pairs for onboarding comparisons
// These are iconic, widely-known movies that represent different genres/styles

export interface OnboardingPair {
  movieAId: string;
  movieBId: string;
}

// Fixed comparison pairs for onboarding
export const ONBOARDING_PAIRS: OnboardingPair[] = [
  // Step 2: Star Wars vs Titanic
  { movieAId: 'tmdb-11', movieBId: 'tmdb-597' },
  // Toy Story vs The Dark Knight
  { movieAId: 'tmdb-862', movieBId: 'tmdb-155' },
  // The Lion King vs Home Alone
  { movieAId: 'tmdb-8587', movieBId: 'tmdb-771' },
  // LOTR: Fellowship vs Forrest Gump
  { movieAId: 'tmdb-120', movieBId: 'tmdb-13' },
  // The Shawshank Redemption vs Pulp Fiction
  { movieAId: 'tmdb-278', movieBId: 'tmdb-680' },
];

// Genre pairs for genre selection steps
export const GENRE_PAIRS = [
  { genreA: 'action', genreB: 'comedy' },
  { genreA: 'drama', genreB: 'scifi' },
];

// Genre display names
export const GENRE_DISPLAY_NAMES: Record<string, string> = {
  action: 'Action',
  comedy: 'Comedy',
  drama: 'Drama',
  scifi: 'Sci-Fi',
  romance: 'Romance',
  thriller: 'Thriller',
  animation: 'Animation',
  horror: 'Horror',
  adventure: 'Adventure',
  fantasy: 'Fantasy',
};

// Alias for backward compatibility
export const GENRE_LABELS = GENRE_DISPLAY_NAMES;
