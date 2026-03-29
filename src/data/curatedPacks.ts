// ============================================
// CURATED MOVIE PACKS — for cold-start social play
// Used when a user doesn't have enough ranked movies
// to create a personalized challenge.
// ============================================

export interface CuratedPack {
  id: string;
  title: string;
  subtitle: string;
  movieIds: string[]; // 'tmdb-{id}' format, 10 movies each
}

export const CURATED_PACKS: CuratedPack[] = [
  {
    id: 'sci-fi',
    title: 'Sci-Fi Essentials',
    subtitle: 'the final frontier of taste',
    movieIds: [
      'tmdb-78', // Blade Runner
      'tmdb-348', // Alien
      'tmdb-62', // 2001: A Space Odyssey
      'tmdb-603', // The Matrix
      'tmdb-329865', // Arrival
      'tmdb-157336', // Interstellar
      'tmdb-601', // E.T.
      'tmdb-280', // Terminator 2
      'tmdb-11', // Star Wars
      'tmdb-329', // Jurassic Park
    ],
  },
  {
    id: '90s-gold',
    title: '90s Gold',
    subtitle: 'the decade that defined cinema',
    movieIds: [
      'tmdb-680', // Pulp Fiction
      'tmdb-278', // The Shawshank Redemption
      'tmdb-550', // Fight Club
      'tmdb-769', // GoodFellas
      'tmdb-13', // Forrest Gump
      'tmdb-597', // Titanic
      'tmdb-274', // The Silence of the Lambs
      'tmdb-275', // Fargo
      'tmdb-807', // Se7en
      'tmdb-949', // Heat
    ],
  },
  {
    id: 'animation',
    title: 'Animation Greats',
    subtitle: 'not just for kids',
    movieIds: [
      'tmdb-129', // Spirited Away
      'tmdb-8587', // The Lion King
      'tmdb-862', // Toy Story
      'tmdb-10681', // WALL·E
      'tmdb-324857', // Spider-Man: Into the Spider-Verse
      'tmdb-12', // Finding Nemo
      'tmdb-2062', // Ratatouille
      'tmdb-14160', // Up
      'tmdb-354912', // Coco
      'tmdb-150540', // Inside Out
    ],
  },
  {
    id: 'horror',
    title: 'Horror Classics',
    subtitle: 'sleep is overrated anyway',
    movieIds: [
      'tmdb-694', // The Shining
      'tmdb-419430', // Get Out
      'tmdb-539', // Psycho
      'tmdb-578', // Jaws
      'tmdb-948', // Halloween
      'tmdb-493922', // Hereditary
      'tmdb-9552', // The Exorcist
      'tmdb-530385', // Midsommar
      'tmdb-4232', // Scream
      'tmdb-805', // Rosemary's Baby
    ],
  },
  {
    id: 'modern',
    title: 'Modern Masterpieces',
    subtitle: 'cinema peaked and it\'s peaking right now',
    movieIds: [
      'tmdb-496243', // Parasite
      'tmdb-545611', // Everything Everywhere All at Once
      'tmdb-376867', // Moonlight
      'tmdb-419430', // Get Out
      'tmdb-391713', // Lady Bird
      'tmdb-329865', // Arrival
      'tmdb-76341', // Mad Max: Fury Road
      'tmdb-244786', // Whiplash
      'tmdb-152601', // Her
      'tmdb-257211', // Ex Machina
    ],
  },
  {
    id: 'all-time',
    title: 'All-Time Greats',
    subtitle: 'the canon — your ranking',
    movieIds: [
      'tmdb-278', // The Shawshank Redemption
      'tmdb-238', // The Godfather
      'tmdb-155', // The Dark Knight
      'tmdb-680', // Pulp Fiction
      'tmdb-13', // Forrest Gump
      'tmdb-550', // Fight Club
      'tmdb-424', // Schindler's List
      'tmdb-603', // The Matrix
      'tmdb-769', // GoodFellas
      'tmdb-389', // 12 Angry Men
    ],
  },
];
