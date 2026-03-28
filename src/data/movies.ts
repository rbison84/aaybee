import { Movie, Genre, MovieStatus } from '../types';

// Helper to create a movie with default ranking values
function createMovie(
  id: string,
  title: string,
  year: number,
  genres: Genre[],
  posterColor: string,
  emoji: string
): Movie {
  return {
    id,
    title,
    year,
    genres,
    posterUrl: `https://via.placeholder.com/300x450/${posterColor.replace('#', '')}`,
    posterColor,
    emoji,
    beta: 0,
    totalWins: 0,
    totalLosses: 0,
    totalComparisons: 0,
    timesShown: 0,
    lastShownAt: 0,
    status: 'uncompared' as MovieStatus,
  };
}

// ============================================
// TIER 1: 40 Movies Most People Have SEEN
// Massive blockbusters, cultural touchstones
// ============================================

const TIER1_UNIVERSALLY_SEEN: Movie[] = [
  // Action/Adventure Blockbusters
  createMovie('1', 'Titanic', 1997, ['romance', 'drama'], '#3498db', '🚢'),
  createMovie('2', 'Avatar', 2009, ['scifi', 'adventure'], '#00ced1', '🌿'),
  createMovie('3', 'The Avengers', 2012, ['action', 'scifi'], '#c0392b', '🦸'),
  createMovie('4', 'Jurassic Park', 1993, ['scifi', 'adventure', 'thriller'], '#228b22', '🦖'),
  createMovie('5', 'The Lion King', 1994, ['animation', 'drama', 'adventure'], '#f39c12', '🦁'),
  createMovie('6', 'Toy Story', 1995, ['animation', 'comedy', 'adventure'], '#3498db', '🤠'),
  createMovie('7', 'Finding Nemo', 2003, ['animation', 'comedy', 'adventure'], '#1abc9c', '🐠'),
  createMovie('8', 'Frozen', 2013, ['animation', 'fantasy', 'adventure'], '#89cff0', '❄️'),
  createMovie('9', 'Harry Potter: Sorcerer\'s Stone', 2001, ['fantasy', 'adventure'], '#722f37', '⚡'),
  createMovie('10', 'The Dark Knight', 2008, ['action', 'thriller', 'drama'], '#1c1c1c', '🦇'),

  // Sci-Fi/Action Icons
  createMovie('11', 'Star Wars: A New Hope', 1977, ['scifi', 'adventure', 'fantasy'], '#1a1a2e', '⭐'),
  createMovie('12', 'The Matrix', 1999, ['scifi', 'action'], '#0d7d0d', '💊'),
  createMovie('13', 'Inception', 2010, ['scifi', 'thriller', 'action'], '#2c3e50', '🌀'),
  createMovie('14', 'Interstellar', 2014, ['scifi', 'drama', 'adventure'], '#1a1a2e', '🕳️'),
  createMovie('15', 'Back to the Future', 1985, ['scifi', 'adventure', 'comedy'], '#f39c12', '⏰'),

  // Comedy Giants
  createMovie('16', 'Shrek', 2001, ['animation', 'comedy', 'fantasy'], '#27ae60', '🧅'),
  createMovie('17', 'Home Alone', 1990, ['comedy', 'adventure'], '#c0392b', '🏠'),
  createMovie('18', 'Mrs. Doubtfire', 1993, ['comedy', 'drama'], '#deb887', '👵'),
  createMovie('19', 'The Hangover', 2009, ['comedy'], '#e67e22', '🎰'),
  createMovie('20', 'Mean Girls', 2004, ['comedy'], '#ff1493', '👑'),

  // Drama/Romance
  createMovie('21', 'Forrest Gump', 1994, ['drama', 'romance'], '#27ae60', '🏃'),
  createMovie('22', 'The Notebook', 2004, ['romance', 'drama'], '#e74c3c', '💕'),
  createMovie('23', 'Titanic', 1997, ['romance', 'drama'], '#3498db', '🚢'),
  createMovie('24', 'Pretty Woman', 1990, ['romance', 'comedy'], '#e91e63', '👠'),
  createMovie('25', 'Ghost', 1990, ['romance', 'drama', 'fantasy'], '#9b59b6', '👻'),

  // Modern Hits
  createMovie('26', 'Black Panther', 2018, ['action', 'scifi', 'adventure'], '#9b59b6', '🐆'),
  createMovie('27', 'Spider-Man: No Way Home', 2021, ['action', 'adventure', 'scifi'], '#c0392b', '🕷️'),
  createMovie('28', 'Avengers: Endgame', 2019, ['action', 'scifi', 'adventure'], '#8e44ad', '🧤'),
  createMovie('29', 'Joker', 2019, ['drama', 'thriller'], '#27ae60', '🃏'),
  createMovie('30', 'A Star Is Born', 2018, ['drama', 'romance'], '#e74c3c', '🌟'),

  // Family Favorites
  createMovie('31', 'E.T. the Extra-Terrestrial', 1982, ['scifi', 'adventure', 'drama'], '#8b4513', '👽'),
  createMovie('32', 'The Incredibles', 2004, ['animation', 'action', 'adventure'], '#e74c3c', '💪'),
  createMovie('33', 'Up', 2009, ['animation', 'adventure', 'comedy'], '#3498db', '🎈'),
  createMovie('34', 'Inside Out', 2015, ['animation', 'comedy', 'drama'], '#f1c40f', '😊'),
  createMovie('35', 'Coco', 2017, ['animation', 'fantasy', 'adventure'], '#e67e22', '🎸'),

  // Horror Everyone Knows
  createMovie('36', 'The Sixth Sense', 1999, ['thriller', 'drama', 'horror'], '#34495e', '👁️'),
  createMovie('37', 'Jaws', 1975, ['thriller', 'horror', 'adventure'], '#3498db', '🦈'),
  createMovie('38', 'A Quiet Place', 2018, ['horror', 'thriller', 'drama'], '#2c3e50', '🤫'),
  createMovie('39', 'Get Out', 2017, ['horror', 'thriller'], '#1a1a1a', '🫖'),
  createMovie('40', 'It', 2017, ['horror', 'thriller'], '#c0392b', '🎈'),
];

// ============================================
// TIER 2: 40 Movies Most People Have HEARD OF
// Popular but not quite universal viewership
// ============================================

const TIER2_WIDELY_KNOWN: Movie[] = [
  // Classic Dramas
  createMovie('41', 'The Shawshank Redemption', 1994, ['drama'], '#34495e', '🔓'),
  createMovie('42', 'The Godfather', 1972, ['drama', 'thriller'], '#1a1a1a', '🎩'),
  createMovie('43', 'Schindler\'s List', 1993, ['drama'], '#1a1a1a', '📋'),
  createMovie('44', 'Goodfellas', 1990, ['drama', 'thriller'], '#c0392b', '🔫'),
  createMovie('45', 'The Green Mile', 1999, ['drama', 'fantasy'], '#27ae60', '⚡'),

  // Action Classics
  createMovie('46', 'Die Hard', 1988, ['action', 'thriller'], '#c0392b', '💥'),
  createMovie('47', 'Terminator 2: Judgment Day', 1991, ['action', 'scifi'], '#2c3e50', '🤖'),
  createMovie('48', 'Gladiator', 2000, ['action', 'drama', 'adventure'], '#8b4513', '⚔️'),
  createMovie('49', 'Mad Max: Fury Road', 2015, ['action', 'adventure', 'scifi'], '#d35400', '🔥'),
  createMovie('50', 'John Wick', 2014, ['action', 'thriller'], '#1a1a2e', '🐕'),

  // Sci-Fi Cult Favorites
  createMovie('51', 'Blade Runner', 1982, ['scifi', 'thriller', 'drama'], '#2c3e50', '🌧️'),
  createMovie('52', 'Alien', 1979, ['scifi', 'horror', 'thriller'], '#1a1a1a', '👾'),
  createMovie('53', 'The Terminator', 1984, ['action', 'scifi', 'thriller'], '#c0392b', '🦾'),
  createMovie('54', 'Arrival', 2016, ['scifi', 'drama'], '#34495e', '🛸'),
  createMovie('55', 'District 9', 2009, ['scifi', 'action', 'thriller'], '#7f8c8d', '🦐'),

  // Comedies
  createMovie('56', 'Superbad', 2007, ['comedy'], '#f39c12', '🍺'),
  createMovie('57', 'Bridesmaids', 2011, ['comedy', 'romance'], '#ff69b4', '👰'),
  createMovie('58', 'Step Brothers', 2008, ['comedy'], '#3498db', '🛏️'),
  createMovie('59', 'Anchorman', 2004, ['comedy'], '#c0392b', '📺'),
  createMovie('60', 'The 40-Year-Old Virgin', 2005, ['comedy', 'romance'], '#e74c3c', '🎮'),

  // Thrillers
  createMovie('61', 'Pulp Fiction', 1994, ['drama', 'thriller'], '#f1c40f', '💼'),
  createMovie('62', 'Fight Club', 1999, ['drama', 'thriller'], '#c0392b', '🥊'),
  createMovie('63', 'Se7en', 1995, ['thriller', 'drama', 'horror'], '#1a1a1a', '📦'),
  createMovie('64', 'The Silence of the Lambs', 1991, ['thriller', 'horror', 'drama'], '#8b0000', '🦋'),
  createMovie('65', 'Gone Girl', 2014, ['thriller', 'drama'], '#2c3e50', '📓'),

  // Romance/Drama
  createMovie('66', 'La La Land', 2016, ['romance', 'drama'], '#9b59b6', '🌃'),
  createMovie('67', 'The Fault in Our Stars', 2014, ['romance', 'drama'], '#3498db', '⭐'),
  createMovie('68', 'Pride & Prejudice', 2005, ['romance', 'drama'], '#8e6c4f', '📚'),
  createMovie('69', 'Crazy Rich Asians', 2018, ['romance', 'comedy'], '#f1c40f', '💎'),
  createMovie('70', '500 Days of Summer', 2009, ['romance', 'comedy', 'drama'], '#3498db', '☀️'),

  // Animation (Non-Disney/Pixar)
  createMovie('71', 'Spirited Away', 2001, ['animation', 'fantasy', 'adventure'], '#9b59b6', '🐉'),
  createMovie('72', 'Spider-Man: Into the Spider-Verse', 2018, ['animation', 'action', 'adventure'], '#e74c3c', '🕷️'),
  createMovie('73', 'How to Train Your Dragon', 2010, ['animation', 'adventure', 'fantasy'], '#2ecc71', '🐲'),
  createMovie('74', 'WALL-E', 2008, ['animation', 'scifi', 'adventure'], '#f39c12', '🤖'),
  createMovie('75', 'Ratatouille', 2007, ['animation', 'comedy'], '#9b59b6', '🐀'),

  // Fantasy/Adventure
  createMovie('76', 'The Lord of the Rings: Fellowship', 2001, ['fantasy', 'adventure', 'drama'], '#8b4513', '💍'),
  createMovie('77', 'Pirates of the Caribbean', 2003, ['adventure', 'fantasy', 'action'], '#1a1a2e', '🏴‍☠️'),
  createMovie('78', 'Indiana Jones: Raiders', 1981, ['adventure', 'action'], '#8b4513', '🎒'),
  createMovie('79', 'The Princess Bride', 1987, ['adventure', 'fantasy', 'romance'], '#9b59b6', '👸'),
  createMovie('80', 'Jumanji', 1995, ['adventure', 'fantasy', 'comedy'], '#27ae60', '🎲'),
];

// ============================================
// TIER 3: 20 Genre-Defining Films
// Cult classics, influential, genre pioneers
// ============================================

const TIER3_GENRE_DEFINING: Movie[] = [
  // Horror Icons
  createMovie('81', 'The Shining', 1980, ['horror', 'thriller'], '#c0392b', '🪓'),
  createMovie('82', 'Scream', 1996, ['horror', 'thriller'], '#1a1a1a', '📞'),
  createMovie('83', 'Halloween', 1978, ['horror', 'thriller'], '#d35400', '🎃'),
  createMovie('84', 'A Nightmare on Elm Street', 1984, ['horror', 'thriller'], '#8b0000', '😴'),
  createMovie('85', 'The Exorcist', 1973, ['horror', 'thriller'], '#27ae60', '😈'),

  // Sci-Fi Pioneers
  createMovie('86', '2001: A Space Odyssey', 1968, ['scifi', 'adventure'], '#1a1a2e', '🛰️'),
  createMovie('87', 'The Thing', 1982, ['horror', 'scifi', 'thriller'], '#3498db', '🥶'),
  createMovie('88', 'Close Encounters', 1977, ['scifi', 'drama'], '#f1c40f', '🛸'),

  // Comedy Classics
  createMovie('89', 'Groundhog Day', 1993, ['comedy', 'fantasy', 'romance'], '#95a5a6', '🦫'),
  createMovie('90', 'Ferris Bueller\'s Day Off', 1986, ['comedy'], '#e74c3c', '🚗'),
  createMovie('91', 'The Big Lebowski', 1998, ['comedy', 'drama'], '#8b4513', '🎳'),
  createMovie('92', 'Monty Python and the Holy Grail', 1975, ['comedy', 'adventure', 'fantasy'], '#f1c40f', '🏰'),

  // Romance Touchstones
  createMovie('93', 'When Harry Met Sally', 1989, ['romance', 'comedy'], '#e74c3c', '☕'),
  createMovie('94', 'Dirty Dancing', 1987, ['romance', 'drama'], '#ff69b4', '💃'),
  createMovie('95', 'Breakfast at Tiffany\'s', 1961, ['romance', 'drama', 'comedy'], '#1abc9c', '💎'),

  // Modern Masterpieces
  createMovie('96', 'Parasite', 2019, ['thriller', 'drama', 'comedy'], '#2c3e50', '🪨'),
  createMovie('97', 'Everything Everywhere All at Once', 2022, ['scifi', 'action', 'comedy'], '#9b59b6', '🥯'),
  createMovie('98', 'The Social Network', 2010, ['drama'], '#3b5998', '👤'),
  createMovie('99', 'Whiplash', 2014, ['drama'], '#f1c40f', '🥁'),
  createMovie('100', 'Good Will Hunting', 1997, ['drama'], '#2ecc71', '🧮'),
];

// Combine all movies
export const MOVIES: Movie[] = [
  ...TIER1_UNIVERSALLY_SEEN,
  ...TIER2_WIDELY_KNOWN,
  ...TIER3_GENRE_DEFINING,
];

// Remove duplicate Titanic (was listed twice)
export const ALL_MOVIES = MOVIES.filter((movie, index, self) =>
  index === self.findIndex((m) => m.title === movie.title)
);

// Genre-representative movie pairs for onboarding
export const GENRE_PAIRS = {
  pair1: {
    // Sci-Fi/Action vs Romance
    movieA: ALL_MOVIES.find(m => m.id === '12')!, // The Matrix
    movieB: ALL_MOVIES.find(m => m.id === '1')!, // Titanic
    genresA: ['scifi', 'action'] as Genre[],
    genresB: ['romance', 'drama'] as Genre[],
  },
  pair2: {
    // Comedy vs Thriller
    movieA: ALL_MOVIES.find(m => m.id === '19')!, // The Hangover
    movieB: ALL_MOVIES.find(m => m.id === '10')!, // The Dark Knight
    genresA: ['comedy'] as Genre[],
    genresB: ['action', 'thriller'] as Genre[],
  },
};

// Movies by decade for personalized matchups
export const MOVIES_BY_DECADE: Record<number, Movie[]> = {
  1960: ALL_MOVIES.filter(m => m.year >= 1960 && m.year < 1970),
  1970: ALL_MOVIES.filter(m => m.year >= 1970 && m.year < 1980),
  1980: ALL_MOVIES.filter(m => m.year >= 1980 && m.year < 1990),
  1990: ALL_MOVIES.filter(m => m.year >= 1990 && m.year < 2000),
  2000: ALL_MOVIES.filter(m => m.year >= 2000 && m.year < 2010),
  2010: ALL_MOVIES.filter(m => m.year >= 2010 && m.year < 2020),
  2020: ALL_MOVIES.filter(m => m.year >= 2020),
};

// Get movies matching user preferences
export function getPersonalizedMovies(
  preferredGenres: Genre[],
  primeYears: { start: number; end: number } | null,
  excludeIds: string[] = []
): Movie[] {
  return ALL_MOVIES.filter(movie => {
    if (excludeIds.includes(movie.id)) return false;

    const hasPreferredGenre = movie.genres.some(g => preferredGenres.includes(g));
    const inPrimeYears = primeYears
      ? movie.year >= primeYears.start && movie.year <= primeYears.end
      : true;

    return hasPreferredGenre || inPrimeYears;
  }).sort(() => Math.random() - 0.5);
}

export function getMovieById(id: string): Movie | undefined {
  return ALL_MOVIES.find(m => m.id === id);
}

// Get movies by status
export function getMoviesByStatus(status: Movie['status']): Movie[] {
  return ALL_MOVIES.filter(m => m.status === status);
}

// Get uncompared movies (for matchmaking)
export function getUncomparedMovies(): Movie[] {
  return ALL_MOVIES.filter(m => m.status === 'uncompared' || m.totalComparisons < 2);
}

// Genre distribution stats
export function getGenreDistribution(): Record<Genre, number> {
  const distribution: Record<Genre, number> = {
    action: 0, comedy: 0, drama: 0, scifi: 0, romance: 0,
    thriller: 0, animation: 0, horror: 0, adventure: 0, fantasy: 0,
  };

  ALL_MOVIES.forEach(movie => {
    movie.genres.forEach(genre => {
      distribution[genre]++;
    });
  });

  return distribution;
}

// Decade distribution stats
export function getDecadeDistribution(): Record<string, number> {
  const distribution: Record<string, number> = {};

  ALL_MOVIES.forEach(movie => {
    const decade = `${Math.floor(movie.year / 10) * 10}s`;
    distribution[decade] = (distribution[decade] || 0) + 1;
  });

  return distribution;
}

console.log('Movie Database Loaded:', ALL_MOVIES.length, 'movies');
console.log('Genre Distribution:', getGenreDistribution());
console.log('Decade Distribution:', getDecadeDistribution());
