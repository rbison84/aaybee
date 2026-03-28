import { DAILY_CATEGORIES } from './dailyCategories';
import { Movie, Genre } from '../types';

export interface TvChannel {
  id: string;
  label: string;
  emoji: string;
  movieIds: string[];
}

export interface TvGuideSection {
  id: string;
  title: string;
  channels: TvChannel[];
}

export function getTvChannels(rankedMovies?: Movie[]): TvChannel[] {
  const forYouChannel: TvChannel = {
    id: 'for-you',
    label: 'for you',
    emoji: '✨',
    movieIds: rankedMovies
      ? shuffleArray(rankedMovies.map(m => m.id))
      : [],
  };

  const categoryChannels: TvChannel[] = DAILY_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.title,
    emoji: cat.emoji,
    movieIds: cat.movieIds,
  }));

  return [forYouChannel, ...categoryChannels];
}

/** Extract TMDb numeric ID from 'tmdb-NNN' format */
export function extractTmdbId(movieId: string): number {
  return parseInt(movieId.replace('tmdb-', ''), 10);
}

/** Simple Fisher-Yates shuffle (non-mutating) */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---- Decade & Genre config (exported for TvGuide filter chips) ----

export interface DecadeOption { id: string; label: string; startYear: number; endYear: number }
export interface GenreOption { genre: Genre; label: string; emoji: string }

export const DECADE_CONFIG: DecadeOption[] = [
  { id: 'decade-1960s', label: '1960s', startYear: 1960, endYear: 1969 },
  { id: 'decade-1970s', label: '1970s', startYear: 1970, endYear: 1979 },
  { id: 'decade-1980s', label: '1980s', startYear: 1980, endYear: 1989 },
  { id: 'decade-1990s', label: '1990s', startYear: 1990, endYear: 1999 },
  { id: 'decade-2000s', label: '2000s', startYear: 2000, endYear: 2009 },
  { id: 'decade-2010s', label: '2010s', startYear: 2010, endYear: 2019 },
  { id: 'decade-2020s', label: '2020s', startYear: 2020, endYear: 2029 },
];

export const GENRE_CONFIG: GenreOption[] = [
  { genre: 'action', label: 'action', emoji: '💥' },
  { genre: 'comedy', label: 'comedy', emoji: '😂' },
  { genre: 'drama', label: 'drama', emoji: '🎭' },
  { genre: 'scifi', label: 'sci-fi', emoji: '🚀' },
  { genre: 'romance', label: 'romance', emoji: '💕' },
  { genre: 'thriller', label: 'thriller', emoji: '😰' },
  { genre: 'animation', label: 'animation', emoji: '✨' },
  { genre: 'horror', label: 'horror', emoji: '👻' },
  { genre: 'adventure', label: 'adventure', emoji: '🗺️' },
  { genre: 'fantasy', label: 'fantasy', emoji: '🧙' },
];

/** Sort movie IDs: ranked movies first (by rank), then unranked shuffled */
function sortMovieIds(movieIds: string[], rankedMovies: Movie[]): string[] {
  const rankedSet = new Map<string, number>();
  rankedMovies.forEach((m, i) => rankedSet.set(m.id, i));

  const ranked: string[] = [];
  const unranked: string[] = [];

  for (const id of movieIds) {
    if (rankedSet.has(id)) {
      ranked.push(id);
    } else {
      unranked.push(id);
    }
  }

  ranked.sort((a, b) => (rankedSet.get(a) ?? 0) - (rankedSet.get(b) ?? 0));
  return [...ranked, ...shuffleArray(unranked)];
}

export function getDecadeChannels(allMovies: Map<string, Movie>, rankedMovies: Movie[]): TvChannel[] {
  const channels: TvChannel[] = [];

  for (const decade of DECADE_CONFIG) {
    const movieIds: string[] = [];
    allMovies.forEach((movie) => {
      if (movie.year >= decade.startYear && movie.year <= decade.endYear) {
        movieIds.push(movie.id);
      }
    });

    if (movieIds.length >= 3) {
      channels.push({
        id: decade.id,
        label: decade.label,
        emoji: '🎞️',
        movieIds: sortMovieIds(movieIds, rankedMovies),
      });
    }
  }

  return channels;
}

export function getGenreChannels(allMovies: Map<string, Movie>, rankedMovies: Movie[]): TvChannel[] {
  const channels: TvChannel[] = [];

  for (const gc of GENRE_CONFIG) {
    const movieIds: string[] = [];
    allMovies.forEach((movie) => {
      if (movie.genres.includes(gc.genre)) {
        movieIds.push(movie.id);
      }
    });

    if (movieIds.length >= 3) {
      channels.push({
        id: `genre-${gc.genre}`,
        label: gc.label,
        emoji: gc.emoji,
        movieIds: sortMovieIds(movieIds, rankedMovies),
      });
    }
  }

  return channels;
}

// ---- Guide section groupings for curated channels ----

const DIRECTOR_IDS = ['tom-hanks', 'spielberg', 'tarantino', 'nolan-vs-villeneuve'];
const FRANCHISE_IDS = ['pixar', 'star-wars-universe', 'harry-potter', 'lotr-vs-potter', 'animated-classics', 'superhero-showdown', 'sequels-ranked'];
const VIBES_IDS = [
  'mind-benders', 'horror-classics', 'scifi-greats', 'crime-and-gangster',
  'thriller-suspense', 'twist-endings', 'heist-movies', 'comedy-legends',
  'rom-coms', 'coming-of-age', 'fantasy-adventure', 'war-films',
  'tear-jerkers', 'cult-classics', 'dad-movies', 'sports-movies',
];
const AWARDS_IDS = ['best-picture', 'villains', '80s-classics', '90s-action', '2010s-best', '2020s-best'];

function getCuratedChannelsByIds(ids: string[], allCurated: TvChannel[]): TvChannel[] {
  const map = new Map(allCurated.map(c => [c.id, c]));
  return ids.filter(id => map.has(id)).map(id => map.get(id)!);
}

export function getTvGuideSections(allMovies: Map<string, Movie>, rankedMovies: Movie[]): TvGuideSection[] {
  const forYou: TvChannel = {
    id: 'for-you',
    label: 'for you',
    emoji: '✨',
    movieIds: rankedMovies.length > 0
      ? shuffleArray(rankedMovies.map(m => m.id))
      : [],
  };

  const curatedChannels: TvChannel[] = DAILY_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.title,
    emoji: cat.emoji,
    movieIds: cat.movieIds,
  }));

  const decadeChannels = getDecadeChannels(allMovies, rankedMovies);
  const genreChannels = getGenreChannels(allMovies, rankedMovies);

  return [
    { id: 'for-you-section', title: 'for you', channels: [forYou] },
    { id: 'by-decade', title: 'by decade', channels: decadeChannels },
    { id: 'by-genre', title: 'by genre', channels: genreChannels },
    { id: 'directors', title: 'directors & matchups', channels: getCuratedChannelsByIds(DIRECTOR_IDS, curatedChannels) },
    { id: 'franchises', title: 'franchises & collections', channels: getCuratedChannelsByIds(FRANCHISE_IDS, curatedChannels) },
    { id: 'vibes', title: 'vibes & moods', channels: getCuratedChannelsByIds(VIBES_IDS, curatedChannels) },
    { id: 'awards', title: 'awards & eras', channels: getCuratedChannelsByIds(AWARDS_IDS, curatedChannels) },
  ].filter(s => s.channels.length > 0);
}

/**
 * Filter movies by combinable decade + genre selections.
 * If only decades selected → filter by decade only.
 * If only genres selected → filter by genre only.
 * Both → must match ANY selected decade AND ANY selected genre.
 * Returns sorted movie IDs: ranked first (by rank), then unranked shuffled.
 */
export function getFilteredMovieIds(
  allMovies: Map<string, Movie>,
  rankedMovies: Movie[],
  decades: string[],
  genres: Genre[]
): string[] {
  const decadeConfigs = decades
    .map(id => DECADE_CONFIG.find(d => d.id === id))
    .filter((d): d is DecadeOption => d != null);

  const matchingIds: string[] = [];

  allMovies.forEach((movie) => {
    const matchesDecade = decadeConfigs.length === 0 ||
      decadeConfigs.some(d => movie.year >= d.startYear && movie.year <= d.endYear);
    const matchesGenre = genres.length === 0 ||
      genres.some(g => movie.genres.includes(g));

    if (matchesDecade && matchesGenre) {
      matchingIds.push(movie.id);
    }
  });

  return sortMovieIds(matchingIds, rankedMovies);
}

/**
 * Returns only the 4 curated sections (directors, franchises, vibes, awards)
 * for the channels portion of the redesigned TV Guide.
 */
export function getCuratedSections(allMovies: Map<string, Movie>, rankedMovies: Movie[]): TvGuideSection[] {
  const curatedChannels: TvChannel[] = DAILY_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.title,
    emoji: cat.emoji,
    movieIds: cat.movieIds,
  }));

  return [
    { id: 'directors', title: 'directors & matchups', channels: getCuratedChannelsByIds(DIRECTOR_IDS, curatedChannels) },
    { id: 'franchises', title: 'franchises & collections', channels: getCuratedChannelsByIds(FRANCHISE_IDS, curatedChannels) },
    { id: 'vibes', title: 'vibes & moods', channels: getCuratedChannelsByIds(VIBES_IDS, curatedChannels) },
    { id: 'awards', title: 'awards & eras', channels: getCuratedChannelsByIds(AWARDS_IDS, curatedChannels) },
  ].filter(s => s.channels.length > 0);
}

export function getAllChannelsMap(allMovies: Map<string, Movie>, rankedMovies: Movie[]): Map<string, TvChannel> {
  const map = new Map<string, TvChannel>();

  // For you
  const forYou: TvChannel = {
    id: 'for-you',
    label: 'for you',
    emoji: '✨',
    movieIds: rankedMovies.length > 0
      ? shuffleArray(rankedMovies.map(m => m.id))
      : [],
  };
  map.set(forYou.id, forYou);

  // Curated channels
  for (const cat of DAILY_CATEGORIES) {
    map.set(cat.id, { id: cat.id, label: cat.title, emoji: cat.emoji, movieIds: cat.movieIds });
  }

  // Decade channels
  for (const ch of getDecadeChannels(allMovies, rankedMovies)) {
    map.set(ch.id, ch);
  }

  // Genre channels
  for (const ch of getGenreChannels(allMovies, rankedMovies)) {
    map.set(ch.id, ch);
  }

  return map;
}
