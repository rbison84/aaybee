// Daily categories for Aaybee Daily (Swiss format)
// Each category has 9 movies:
//   movieIds[0..8] = movies in editorial global rank order
//
// IMPORTANT: All movieIds MUST exist in CURATED_MOVIE_IDS in src/services/tmdb.ts
// The id format is 'tmdb-{tmdbId}' where tmdbId matches the numeric ID in that list.

import { seededRandom, seededShuffle } from '../utils/seededRandom';

export interface DailyCategory {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  movieIds: string[];
}

export const DAILY_CATEGORIES: DailyCategory[] = [
  // ---- ORIGINAL 7 ----
  {
    id: 'tom-hanks',
    title: 'Tom Hanks',
    subtitle: 'Rank his greatest roles',
    emoji: '\uD83C\uDFAD',
    movieIds: [
      'tmdb-4912',    // Cast Away
      'tmdb-13',      // Forrest Gump
      'tmdb-862',     // Toy Story
      'tmdb-497',     // The Green Mile
      'tmdb-857',     // Saving Private Ryan
      'tmdb-2157',    // Apollo 13
      'tmdb-9587',    // Big
      'tmdb-194662',  // Captain Phillips
      'tmdb-9398',    // Catch Me If You Can
    ],
  },
  {
    id: 'mind-benders',
    title: 'Mind-Benders',
    subtitle: 'Films that twist your brain',
    emoji: '\uD83E\uDDE0',
    movieIds: [
      'tmdb-264660',  // Ex Machina
      'tmdb-27205',   // Inception
      'tmdb-157336',  // Interstellar
      'tmdb-1124',    // The Prestige
      'tmdb-603',     // The Matrix
      'tmdb-550',     // Fight Club
      'tmdb-329865',  // Arrival
      'tmdb-545611',  // Everything Everywhere All at Once
      'tmdb-496243',  // Parasite
    ],
  },
  {
    id: '90s-action',
    title: '90s Action',
    subtitle: 'The golden age of action movies',
    emoji: '\uD83D\uDCA5',
    movieIds: [
      'tmdb-949',     // Heat
      'tmdb-280',     // Terminator 2
      'tmdb-603',     // The Matrix
      'tmdb-329',     // Jurassic Park
      'tmdb-680',     // Pulp Fiction
      'tmdb-769',     // GoodFellas
      'tmdb-9377',    // Leon: The Professional
      'tmdb-11422',   // The Rock
      'tmdb-629',     // The Usual Suspects
    ],
  },
  {
    id: 'pixar',
    title: 'Pixar',
    subtitle: 'To infinity and beyond',
    emoji: '\uD83C\uDFEE',
    movieIds: [
      'tmdb-8358',    // WALL-E
      'tmdb-862',     // Toy Story
      'tmdb-10193',   // Toy Story 3
      'tmdb-12',      // Finding Nemo
      'tmdb-9806',    // The Incredibles
      'tmdb-14160',   // Up
      'tmdb-585',     // Monsters, Inc.
      'tmdb-354912',  // Coco
      'tmdb-508442',  // Soul
    ],
  },
  {
    id: 'spielberg',
    title: 'Steven Spielberg',
    subtitle: 'The legendary director',
    emoji: '\uD83C\uDFA5',
    movieIds: [
      'tmdb-578',     // Jaws
      'tmdb-329',     // Jurassic Park
      'tmdb-424',     // Schindler's List
      'tmdb-85',      // Raiders of the Lost Ark
      'tmdb-89',      // Indiana Jones and the Last Crusade
      'tmdb-857',     // Saving Private Ryan
      'tmdb-601',     // E.T. the Extra-Terrestrial
      'tmdb-5825',    // Minority Report
      'tmdb-9398',    // Catch Me If You Can
    ],
  },
  {
    id: 'horror-classics',
    title: 'Horror Classics',
    subtitle: 'Sleep with the lights on',
    emoji: '\uD83D\uDC7B',
    movieIds: [
      'tmdb-493922',  // Hereditary
      'tmdb-694',     // The Shining
      'tmdb-539',     // Psycho
      'tmdb-274',     // The Silence of the Lambs
      'tmdb-348',     // Alien
      'tmdb-679',     // Aliens
      'tmdb-419430',  // Get Out
      'tmdb-530385',  // Midsommar
      'tmdb-745',     // The Sixth Sense
    ],
  },
  {
    id: 'scifi-greats',
    title: 'Sci-Fi Greats',
    subtitle: 'The future is now',
    emoji: '\uD83D\uDE80',
    movieIds: [
      'tmdb-78',      // Blade Runner
      'tmdb-11',      // Star Wars
      'tmdb-1891',    // The Empire Strikes Back
      'tmdb-603',     // The Matrix
      'tmdb-280',     // Terminator 2
      'tmdb-157336',  // Interstellar
      'tmdb-27205',   // Inception
      'tmdb-348',     // Alien
      'tmdb-329865',  // Arrival
    ],
  },

  // ---- NEW CATEGORIES ----
  {
    id: 'nolan-vs-villeneuve',
    title: 'Nolan vs Villeneuve',
    subtitle: 'Two modern masters face off',
    emoji: '\uD83C\uDFAC',
    movieIds: [
      'tmdb-273248',  // Prisoners
      'tmdb-155',     // The Dark Knight
      'tmdb-27205',   // Inception
      'tmdb-157336',  // Interstellar
      'tmdb-77',      // Memento
      'tmdb-1124',    // The Prestige
      'tmdb-872585',  // Oppenheimer
      'tmdb-438631',  // Dune
      'tmdb-693134',  // Dune: Part Two
    ],
  },
  {
    id: 'animated-classics',
    title: 'Animated Classics',
    subtitle: 'The best of animation',
    emoji: '\u2728',
    movieIds: [
      'tmdb-372058',  // Your Name
      'tmdb-129',     // Spirited Away
      'tmdb-128',     // Princess Mononoke
      'tmdb-862',     // Toy Story
      'tmdb-12',      // Finding Nemo
      'tmdb-8358',    // WALL-E
      'tmdb-150540',  // Inside Out
      'tmdb-354912',  // Coco
      'tmdb-508442',  // Soul
    ],
  },
  {
    id: 'superhero-showdown',
    title: 'Superhero Showdown',
    subtitle: 'Capes and cowls collide',
    emoji: '\uD83E\uDDB8',
    movieIds: [
      'tmdb-263115',  // Logan
      'tmdb-155',     // The Dark Knight
      'tmdb-299536',  // Avengers: Infinity War
      'tmdb-299534',  // Avengers: Endgame
      'tmdb-324857',  // Spider-Man: Into the Spider-Verse
      'tmdb-634649',  // Spider-Man: No Way Home
      'tmdb-475557',  // Joker
      'tmdb-118340',  // Guardians of the Galaxy
      'tmdb-100402',  // Captain America: The Winter Soldier
    ],
  },
  {
    id: 'crime-and-gangster',
    title: 'Crime & Gangster',
    subtitle: "An offer you can't refuse",
    emoji: '\uD83D\uDD2B',
    movieIds: [
      'tmdb-769',     // GoodFellas
      'tmdb-238',     // The Godfather
      'tmdb-240',     // The Godfather Part II
      'tmdb-680',     // Pulp Fiction
      'tmdb-629',     // The Usual Suspects
      'tmdb-807',     // Se7en
      'tmdb-500',     // Reservoir Dogs
      'tmdb-949',     // Heat
      'tmdb-1422',    // The Departed
    ],
  },
  {
    id: 'tarantino',
    title: 'Tarantino',
    subtitle: 'Sharp dialogue, sharper twists',
    emoji: '\uD83C\uDF7F',
    movieIds: [
      'tmdb-24',      // Kill Bill Vol. 1
      'tmdb-680',     // Pulp Fiction
      'tmdb-500',     // Reservoir Dogs
      'tmdb-393',     // Kill Bill Vol. 2
      'tmdb-16869',   // Inglourious Basterds
      'tmdb-68718',   // Django Unchained
      'tmdb-466282',  // Once Upon a Time in Hollywood
      'tmdb-4232',    // The Hateful Eight
      'tmdb-319',     // True Romance (Tarantino screenplay)
    ],
  },
  {
    id: 'best-picture',
    title: 'Best Picture',
    subtitle: 'Oscar winners face off',
    emoji: '\uD83C\uDFC6',
    movieIds: [
      'tmdb-496243',  // Parasite
      'tmdb-238',     // The Godfather
      'tmdb-240',     // The Godfather Part II
      'tmdb-424',     // Schindler's List
      'tmdb-13',      // Forrest Gump
      'tmdb-98',      // Gladiator
      'tmdb-545611',  // Everything Everywhere All at Once
      'tmdb-872585',  // Oppenheimer
      'tmdb-274',     // The Silence of the Lambs
    ],
  },
  {
    id: '80s-classics',
    title: '80s Classics',
    subtitle: 'Totally radical cinema',
    emoji: '\uD83D\uDD7A',
    movieIds: [
      'tmdb-78',      // Blade Runner
      'tmdb-105',     // Back to the Future
      'tmdb-85',      // Raiders of the Lost Ark
      'tmdb-218',     // The Terminator
      'tmdb-694',     // The Shining
      'tmdb-601',     // E.T.
      'tmdb-679',     // Aliens
      'tmdb-348',     // Alien
      'tmdb-1891',    // Empire Strikes Back
    ],
  },
  {
    id: 'war-films',
    title: 'War Films',
    subtitle: 'Courage under fire',
    emoji: '\uD83C\uDF96\uFE0F',
    movieIds: [
      'tmdb-28',      // Apocalypse Now
      'tmdb-857',     // Saving Private Ryan
      'tmdb-424',     // Schindler's List
      'tmdb-600',     // Full Metal Jacket
      'tmdb-142',     // Braveheart
      'tmdb-98',      // Gladiator
      'tmdb-374473',  // Dunkirk
      'tmdb-16869',   // Inglourious Basterds
      'tmdb-346',     // Seven Samurai
    ],
  },
  {
    id: 'rom-coms',
    title: 'Rom-Coms',
    subtitle: 'Love is in the air',
    emoji: '\u2764\uFE0F',
    movieIds: [
      'tmdb-38',      // Eternal Sunshine
      'tmdb-114',     // Pretty Woman
      'tmdb-194',     // Amelie
      'tmdb-313369',  // La La Land
      'tmdb-137',     // Groundhog Day
      'tmdb-489',     // Good Will Hunting
      'tmdb-597',     // Titanic
      'tmdb-77338',   // The Intouchables
      'tmdb-637',     // Life Is Beautiful
    ],
  },
  {
    id: 'coming-of-age',
    title: 'Coming of Age',
    subtitle: 'Growing up on screen',
    emoji: '\uD83C\uDF1F',
    movieIds: [
      'tmdb-141',     // Donnie Darko
      'tmdb-244786',  // Whiplash
      'tmdb-489',     // Good Will Hunting
      'tmdb-207',     // Dead Poets Society
      'tmdb-264644',  // Room
      'tmdb-150540',  // Inside Out
      'tmdb-235',     // Stand By Me
      'tmdb-391713',  // Lady Bird
      'tmdb-508947',  // Turning Red
    ],
  },
  {
    id: 'fantasy-adventure',
    title: 'Fantasy & Adventure',
    subtitle: 'Epic quests and magical worlds',
    emoji: '\u2694\uFE0F',
    movieIds: [
      'tmdb-129',     // Spirited Away
      'tmdb-122',     // LOTR: Return of the King
      'tmdb-120',     // LOTR: Fellowship
      'tmdb-121',     // LOTR: Two Towers
      'tmdb-673',     // Harry Potter: Prisoner of Azkaban
      'tmdb-22',      // Pirates of the Caribbean
      'tmdb-329',     // Jurassic Park
      'tmdb-11',      // Star Wars
      'tmdb-85',      // Raiders of the Lost Ark
    ],
  },
  {
    id: 'harry-potter',
    title: 'Wizarding World',
    subtitle: 'Rank the magic',
    emoji: '\u26A1',
    movieIds: [
      'tmdb-673',     // Prisoner of Azkaban
      'tmdb-671',     // Philosopher's Stone
      'tmdb-672',     // Chamber of Secrets
      'tmdb-674',     // Goblet of Fire
      'tmdb-675',     // Order of the Phoenix
      'tmdb-767',     // Half-Blood Prince
      'tmdb-12444',   // Deathly Hallows Part 1
      'tmdb-12445',   // Deathly Hallows Part 2
      'tmdb-2493',    // The Princess Bride
    ],
  },
  {
    id: 'thriller-suspense',
    title: 'Thriller & Suspense',
    subtitle: 'Edge of your seat',
    emoji: '\uD83D\uDE28',
    movieIds: [
      'tmdb-567',     // Rear Window
      'tmdb-274',     // The Silence of the Lambs
      'tmdb-807',     // Se7en
      'tmdb-745',     // The Sixth Sense
      'tmdb-11324',   // Shutter Island
      'tmdb-275',     // Fargo
      'tmdb-539',     // Psycho
      'tmdb-77',      // Memento
      'tmdb-629',     // The Usual Suspects
    ],
  },
  {
    id: 'comedy-legends',
    title: 'Comedy Gold',
    subtitle: 'The funniest films ever made',
    emoji: '\uD83D\uDE02',
    movieIds: [
      'tmdb-76',      // Monty Python and the Holy Grail
      'tmdb-137',     // Groundhog Day
      'tmdb-115',     // The Big Lebowski
      'tmdb-808',     // Shrek
      'tmdb-747',     // Shaun of the Dead
      'tmdb-4638',    // Hot Fuzz
      'tmdb-380',     // Snatch
      'tmdb-771',     // Home Alone
      'tmdb-120467',  // The Grand Budapest Hotel
    ],
  },
  {
    id: '2010s-best',
    title: '2010s Best',
    subtitle: 'The decade in film',
    emoji: '\uD83C\uDF1F',
    movieIds: [
      'tmdb-244786',  // Whiplash
      'tmdb-157336',  // Interstellar
      'tmdb-496243',  // Parasite
      'tmdb-313369',  // La La Land
      'tmdb-264660',  // Ex Machina
      'tmdb-329865',  // Arrival
      'tmdb-120467',  // The Grand Budapest Hotel
      'tmdb-68718',   // Django Unchained
      'tmdb-419430',  // Get Out
    ],
  },
  {
    id: '2020s-best',
    title: '2020s So Far',
    subtitle: 'The new era of cinema',
    emoji: '\uD83D\uDD25',
    movieIds: [
      'tmdb-545611',  // EEAAO
      'tmdb-872585',  // Oppenheimer
      'tmdb-693134',  // Dune: Part Two
      'tmdb-438631',  // Dune
      'tmdb-508442',  // Soul
      'tmdb-634649',  // Spider-Man: No Way Home
      'tmdb-533535',  // Deadpool & Wolverine
      'tmdb-1022789', // Inside Out 2
      'tmdb-674324',  // The Banshees of Inisherin
    ],
  },
  {
    id: 'star-wars-universe',
    title: 'Space Opera',
    subtitle: 'Epic adventures across the stars',
    emoji: '\u2B50',
    movieIds: [
      'tmdb-11',      // Star Wars: A New Hope
      'tmdb-1891',    // The Empire Strikes Back
      'tmdb-1892',    // Return of the Jedi
      'tmdb-1895',    // Revenge of the Sith
      'tmdb-62',      // 2001: A Space Odyssey
      'tmdb-438631',  // Dune
      'tmdb-693134',  // Dune: Part Two
      'tmdb-348',     // Alien
      'tmdb-157336',  // Interstellar
    ],
  },
  {
    id: 'sports-movies',
    title: 'Sports Movies',
    subtitle: 'Game day drama',
    emoji: '\uD83C\uDFC8',
    movieIds: [
      'tmdb-1366',    // Rocky
      'tmdb-312221',  // Creed
      'tmdb-244786',  // Whiplash
      'tmdb-914',     // The Karate Kid
      'tmdb-60308',   // Moneyball
      'tmdb-22881',   // The Blind Side
      'tmdb-70',      // Million Dollar Baby
      'tmdb-10637',   // Remember the Titans
      'tmdb-1578',    // Raging Bull
    ],
  },
  {
    id: 'lotr-vs-potter',
    title: 'LOTR vs Potter',
    subtitle: 'Two franchises enter, one leaves',
    emoji: '\uD83E\uDDD9',
    movieIds: [
      'tmdb-673',     // HP: Prisoner of Azkaban
      'tmdb-122',     // LOTR: Return of the King
      'tmdb-120',     // LOTR: Fellowship
      'tmdb-121',     // LOTR: Two Towers
      'tmdb-671',     // HP: Philosopher's Stone
      'tmdb-674',     // HP: Goblet of Fire
      'tmdb-675',     // HP: Order of the Phoenix
      'tmdb-767',     // HP: Half-Blood Prince
      'tmdb-12444',   // HP: Deathly Hallows Part 1
    ],
  },
  {
    id: 'twist-endings',
    title: 'Twist Endings',
    subtitle: 'Did NOT see that coming',
    emoji: '\uD83D\uDE31',
    movieIds: [
      'tmdb-141',     // Donnie Darko
      'tmdb-745',     // The Sixth Sense
      'tmdb-550',     // Fight Club
      'tmdb-629',     // The Usual Suspects
      'tmdb-1124',    // The Prestige
      'tmdb-77',      // Memento
      'tmdb-11324',   // Shutter Island
      'tmdb-807',     // Se7en
      'tmdb-496243',  // Parasite
    ],
  },
  {
    id: 'sequels-ranked',
    title: 'Sequel Showdown',
    subtitle: 'Are sequels ever better?',
    emoji: '\u0032\uFE0F\u20E3',
    movieIds: [
      'tmdb-121',     // LOTR: The Two Towers
      'tmdb-240',     // The Godfather Part II
      'tmdb-1891',    // Empire Strikes Back
      'tmdb-280',     // Terminator 2
      'tmdb-155',     // The Dark Knight
      'tmdb-122',     // LOTR: Return of the King
      'tmdb-299536',  // Avengers: Infinity War
      'tmdb-12445',   // Harry Potter: Deathly Hallows Part 2
      'tmdb-299534',  // Avengers: Endgame
    ],
  },
  {
    id: 'villains',
    title: 'Greatest Villains',
    subtitle: 'Which villain reigns supreme?',
    emoji: '\uD83D\uDE08',
    movieIds: [
      'tmdb-274',     // Silence of the Lambs (Hannibal)
      'tmdb-155',     // The Dark Knight (Joker)
      'tmdb-475557',  // Joker
      'tmdb-238',     // The Godfather (Vito)
      'tmdb-694',     // The Shining (Jack)
      'tmdb-11',      // Star Wars (Vader)
      'tmdb-348',     // Alien (Xenomorph)
      'tmdb-807',     // Se7en (John Doe)
      'tmdb-603',     // The Matrix (Agent Smith)
    ],
  },
  {
    id: 'heist-movies',
    title: 'Heist Movies',
    subtitle: 'The perfect crime',
    emoji: '\uD83D\uDCB0',
    movieIds: [
      'tmdb-161',     // Ocean's Eleven
      'tmdb-27205',   // Inception
      'tmdb-949',     // Heat
      'tmdb-629',     // The Usual Suspects
      'tmdb-9654',    // The Italian Job
      'tmdb-339403',  // Baby Driver
      'tmdb-9398',    // Catch Me If You Can
      'tmdb-380',     // Snatch
      'tmdb-500',     // Reservoir Dogs
    ],
  },
  {
    id: 'tear-jerkers',
    title: 'Tear Jerkers',
    subtitle: 'Bring tissues',
    emoji: '\uD83D\uDE2D',
    movieIds: [
      'tmdb-14160',   // Up
      'tmdb-424',     // Schindler's List
      'tmdb-497',     // The Green Mile
      'tmdb-278',     // The Shawshank Redemption
      'tmdb-13',      // Forrest Gump
      'tmdb-597',     // Titanic
      'tmdb-354912',  // Coco
      'tmdb-489',     // Good Will Hunting
      'tmdb-77338',   // The Intouchables
    ],
  },
  {
    id: 'cult-classics',
    title: 'Cult Classics',
    subtitle: 'Underground favorites',
    emoji: '\uD83E\uDD18',
    movieIds: [
      'tmdb-627',     // Trainspotting
      'tmdb-550',     // Fight Club
      'tmdb-141',     // Donnie Darko
      'tmdb-115',     // The Big Lebowski
      'tmdb-641',     // Requiem for a Dream
      'tmdb-406',     // A Clockwork Orange
      'tmdb-500',     // Reservoir Dogs
      'tmdb-76',      // Monty Python and the Holy Grail
      'tmdb-62',      // 2001: A Space Odyssey
    ],
  },
  {
    id: 'dad-movies',
    title: 'Dad Movies',
    subtitle: "Your dad's top picks",
    emoji: '\uD83D\uDC68',
    movieIds: [
      'tmdb-98',      // Gladiator
      'tmdb-278',     // The Shawshank Redemption
      'tmdb-238',     // The Godfather
      'tmdb-155',     // The Dark Knight
      'tmdb-680',     // Pulp Fiction
      'tmdb-857',     // Saving Private Ryan
      'tmdb-280',     // Terminator 2
      'tmdb-769',     // GoodFellas
      'tmdb-603',     // The Matrix
    ],
  },
];

// ---- Shared helpers ----

function getDaysSinceStart(): number {
  const startDate = new Date('2025-01-01');
  const today = new Date();
  return Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

// Get daily number (like Wordle's #xxx)
export function getDailyNumber(): number {
  return getDaysSinceStart() + 1;
}

// Get today's featured daily category (rotates through categories)
export function getTodaysDailyCategory(): DailyCategory {
  const categoryIndex = getDaysSinceStart() % DAILY_CATEGORIES.length;
  return DAILY_CATEGORIES[categoryIndex];
}

// ---- Today's 3 categories (1 featured + 2 back catalog) ----

export interface TodaysDailyCategories {
  featured: DailyCategory;
  backCatalog: [DailyCategory, DailyCategory];
}

export function getTodaysDailyCategories(): TodaysDailyCategories {
  const daysSince = getDaysSinceStart();
  const featuredIndex = daysSince % DAILY_CATEGORIES.length;
  const featured = DAILY_CATEGORIES[featuredIndex];

  // Build remaining categories (exclude featured)
  const remaining = DAILY_CATEGORIES.filter((_, i) => i !== featuredIndex);

  // Pick 2 deterministic back catalog entries via seeded PRNG
  const rng = seededRandom(daysSince * 7919); // prime multiplier for variety
  const shuffled = seededShuffle(remaining, rng);

  return {
    featured,
    backCatalog: [shuffled[0], shuffled[1]],
  };
}
