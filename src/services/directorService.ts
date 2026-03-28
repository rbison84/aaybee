// Director Service
// Calculates user's top directors based on their ranked movies

import { Movie, Genre } from '../types';

export interface DirectorRanking {
  directorName: string;
  directorId: string;
  points: number;
  filmCount: number;
  films: { title: string; rank: number }[];
}

export interface GenreRanking {
  genre: Genre;
  points: number;
  filmCount: number;
}

// Point values for ranks: #1 = 10pts, #2 = 9pts, ... #10+ = 1pt
function getPointsForRank(rank: number): number {
  if (rank <= 10) {
    return 11 - rank; // #1 = 10, #2 = 9, ..., #10 = 1
  }
  return 1; // All ranks beyond 10 get 1 point
}

/**
 * Calculate user's top directors based on their ranked movies
 * @param rankedMovies - User's movies sorted by rank (highest first)
 * @param limit - Number of top directors to return
 */
export function calculateTopDirectors(
  rankedMovies: Movie[],
  limit: number = 3
): DirectorRanking[] {
  const directorMap = new Map<string, DirectorRanking>();

  // Debug: log first few movies to see if they have director info
  console.log('[DirectorService] Checking ranked movies for director info:');
  rankedMovies.slice(0, 5).forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.title}: directorName=${m.directorName}, directorId=${m.directorId}`);
  });

  rankedMovies.forEach((movie, index) => {
    if (!movie.directorName || !movie.directorId) return;

    const rank = index + 1;
    const points = getPointsForRank(rank);

    const existing = directorMap.get(movie.directorId);
    if (existing) {
      existing.points += points;
      existing.filmCount += 1;
      existing.films.push({ title: movie.title, rank });
    } else {
      directorMap.set(movie.directorId, {
        directorName: movie.directorName,
        directorId: movie.directorId,
        points,
        filmCount: 1,
        films: [{ title: movie.title, rank }],
      });
    }
  });

  // Sort by points descending
  const sorted = Array.from(directorMap.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);

  return sorted;
}

/**
 * Calculate user's top genres based on their ranked movies
 * @param rankedMovies - User's movies sorted by rank (highest first)
 * @param limit - Number of top genres to return
 */
export function calculateTopGenres(
  rankedMovies: Movie[],
  limit: number = 3
): GenreRanking[] {
  const genreMap = new Map<Genre, GenreRanking>();

  rankedMovies.forEach((movie, index) => {
    const rank = index + 1;
    const points = getPointsForRank(rank);

    movie.genres.forEach(genre => {
      const existing = genreMap.get(genre);
      if (existing) {
        existing.points += points;
        existing.filmCount += 1;
      } else {
        genreMap.set(genre, {
          genre,
          points,
          filmCount: 1,
        });
      }
    });
  });

  // Sort by points descending
  const sorted = Array.from(genreMap.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);

  return sorted;
}
