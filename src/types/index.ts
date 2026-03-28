export type Genre =
  | 'action'
  | 'comedy'
  | 'drama'
  | 'scifi'
  | 'romance'
  | 'thriller'
  | 'animation'
  | 'horror'
  | 'adventure'
  | 'fantasy';

export type MovieStatus = 'uncompared' | 'known' | 'uncertain' | 'unknown';

export interface Movie {
  id: string;
  tmdbId?: number; // TMDb movie ID
  title: string;
  year: number;
  genres: Genre[];
  posterUrl: string; // Full poster image URL
  posterPath?: string | null; // TMDb poster path (for rebuilding URL)
  posterColor: string; // Fallback color for placeholder
  overview?: string; // Movie description
  emoji?: string; // Fun visual identifier (legacy, optional)
  // Director info
  directorName?: string; // Primary director's name
  directorId?: string; // TMDb person ID
  // TMDB ratings
  voteAverage?: number; // TMDB rating 0-10 (e.g., 8.5)
  voteCount?: number; // Number of votes on TMDB
  certification?: string; // MPAA rating (G, PG, PG-13, R, NR)
  originalLanguage?: string; // ISO 639-1 (e.g. "en", "ko", "ja")
  // Progressive unlock system
  tier?: 1 | 2 | 3 | 4 | 5; // When this movie becomes available (1=immediate, 4=750+ comparisons, 5=search-only)
  sourceTier?: 1 | 2 | 3 | 4 | 5; // Original tier before pool promotion overwrites tier
  collectionId?: number; // TMDB collection ID (for franchise grouping)
  collectionName?: string; // e.g., "Toy Story Collection"
  // Ranking data
  beta: number; // Strength score, range -4.0 to +4.0
  totalWins: number;
  totalLosses: number;
  totalComparisons: number;
  timesShown: number;
  lastShownAt: number; // Comparison number when last shown
  status: MovieStatus;
}

export interface UserPreferences {
  favoriteGenres: Genre[];
  genreScores: Record<Genre, number>;
  birthDecade: number | null;
  moviePrimeStart: number | null;
  moviePrimeEnd: number | null;
}

export interface MovieScore {
  movieId: string;
  beta: number;
  comparisons: number;
  wins: number;
  losses: number;
}

export interface ComparisonResult {
  winnerId: string;
  loserId: string;
  skipped: boolean;
  timestamp: number;
}

export type OnboardingStep =
  | 'welcome'
  | 'genre1'
  | 'genre2'
  | 'decade'
  | 'personalized1'
  | 'personalized2'
  | 'complete';
