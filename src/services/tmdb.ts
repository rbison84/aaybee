// TMDb API Service
// API Documentation: https://developer.themoviedb.org/docs

const API_TOKEN = process.env.EXPO_PUBLIC_TMDB_API_TOKEN || '';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// Image sizes available: w92, w154, w185, w342, w500, w780, original
export const POSTER_SIZES = {
  small: 'w185',
  medium: 'w342',
  large: 'w500',
  original: 'original',
} as const;

// ============================================
// CACHE
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const movieDetailsCache = new Map<number, CacheEntry<any>>();
const trailerCache = new Map<number, CacheEntry<any>>();

function getCachedData<T>(cache: Map<number, CacheEntry<T>>, key: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedData<T>(cache: Map<number, CacheEntry<T>>, key: number, data: T): void {
  // Limit cache size to 100 entries
  if (cache.size >= 100) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// TMDb genre ID to our genre type mapping
const GENRE_MAP: Record<number, string> = {
  28: 'action',
  12: 'adventure',
  16: 'animation',
  35: 'comedy',
  80: 'thriller', // Crime -> Thriller
  99: 'drama', // Documentary -> Drama
  18: 'drama',
  10751: 'comedy', // Family -> Comedy
  14: 'fantasy',
  36: 'drama', // History -> Drama
  27: 'horror',
  10402: 'drama', // Music -> Drama
  9648: 'thriller', // Mystery -> Thriller
  10749: 'romance',
  878: 'scifi',
  10770: 'drama', // TV Movie -> Drama
  53: 'thriller',
  10752: 'action', // War -> Action
  37: 'adventure', // Western -> Adventure
};

// Our app's genre type
import { Genre } from '../types';

// TMDb API response types
interface TMDbMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  genre_ids: number[];
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
}

interface TMDbMovieDetails extends Omit<TMDbMovie, 'genre_ids'> {
  genres: { id: number; name: string }[];
  runtime: number;
  tagline: string;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
}

interface TMDbCredits {
  crew: {
    id: number;
    name: string;
    job: string;
    department: string;
  }[];
  cast: {
    id: number;
    name: string;
    character: string;
    order: number;
    profile_path: string | null;
  }[];
}

interface TMDbMovieWithCredits extends TMDbMovieDetails {
  credits?: TMDbCredits;
}

interface TMDbSearchResponse {
  page: number;
  results: TMDbMovie[];
  total_pages: number;
  total_results: number;
}

// VERIFIED CURATED MOVIE IDS - All IDs confirmed to exist in TMDb
// 1278 curated movies: Top 1000 all-time + Top 200 per decade (1000+ votes)
// Ranked by weighted score: rating * log10(votes)
// Generated: 2026-02-08
export const CURATED_MOVIE_IDS = [
  278,
  157336,
  155,
  27205,
  680,
  550,
  238,
  13,
  122,
  120,
  299536,
  121,
  496243,
  603,
  807,
  299534,
  497,
  68718,
  129,
  424,
  24428,
  11324,
  475557,
  105,
  16869,
  1891,
  11,
  240,
  324857,
  98,
  274,
  8587,
  354912,
  106646,
  118340,
  244786,
  671,
  769,
  77338,
  12445,
  694,
  37165,
  597,
  637,
  673,
  10681,
  101,
  1124,
  857,
  372058,
  150540,
  14160,
  77,
  19995,
  634649,
  293660,
  348,
  1422,
  862,
  49026,
  389,
  324786,
  510,
  73,
  24,
  38,
  1726,
  539,
  205596,
  207,
  500,
  210577,
  489,
  674,
  22,
  4935,
  185,
  329,
  424694,
  640,
  280,
  120467,
  490132,
  12,
  585,
  263115,
  429,
  672,
  313369,
  272,
  111,
  423,
  2062,
  103,
  1892,
  12444,
  146233,
  76341,
  286217,
  398818,
  283995,
  767,
  78,
  675,
  808,
  629,
  752,
  9806,
  62,
  269149,
  393,
  530915,
  600,
  598,
  284053,
  100402,
  14,
  361743,
  128,
  670,
  508442,
  152601,
  10193,
  85,
  6977,
  28,
  359940,
  329865,
  791373,
  296096,
  10191,
  872585,
  177572,
  419430,
  569094,
  546554,
  273248,
  13223,
  745,
  50014,
  207703,
  438631,
  76203,
  641,
  315162,
  381284,
  194,
  11036,
  44214,
  165,
  12477,
  197,
  515001,
  679,
  333339,
  141,
  337404,
  115,
  567,
  627,
  162,
  218,
  70,
  562,
  264644,
  137113,
  8392,
  406997,
  453,
  10674,
  4348,
  1402,
  863,
  89,
  266856,
  335984,
  311,
  359724,
  84892,
  1091,
  316029,
  1417,
  76600,
  264660,
  57158,
  693134,
  4922,
  242582,
  152532,
  64690,
  12405,
  122906,
  8358,
  9479,
  277834,
  1184918,
  5915,
  812,
  7345,
  19404,
  100,
  14836,
  578,
  414906,
  107,
  38757,
  1895,
  10020,
  275,
  527641,
  949,
  426,
  11216,
  36557,
  447365,
  222935,
  615457,
  28178,
  82702,
  314365,
  508943,
  334543,
  18,
  45269,
  935,
  1366,
  601,
  289,
  346,
  1949,
  378064,
  771,
  161,
  502356,
  335,
  1585,
  524,
  3933,
  9552,
  196,
  350,
  399566,
  2108,
  14574,
  568124,
  449176,
  331482,
  334533,
  15,
  1359,
  637920,
  8681,
  400928,
  142,
  396535,
  587,
  527774,
  508965,
  566525,
  607,
  63,
  96721,
  545611,
  137,
  1018,
  4951,
  603692,
  773,
  466282,
  322,
  635302,
  17654,
  492188,
  10386,
  747,
  2501,
  620,
  766507,
  3082,
  235,
  13475,
  411088,
  166428,
  106,
  200727,
  380,
  550988,
  436969,
  290098,
  103663,
  176,
  762,
  533535,
  4638,
  1954,
  1372,
  914,
  31011,
  9693,
  406,
  10315,
  114,
  398978,
  187,
  616,
  11423,
  22881,
  279,
  117,
  8844,
  11321,
  1933,
  76,
  454626,
  399174,
  522627,
  87,
  11970,
  2649,
  10515,
  508439,
  11688,
  938,
  83666,
  2118,
  782,
  33,
  149,
  2503,
  213,
  11544,
  1578,
  59440,
  975,
  239,
  10494,
  4011,
  11778,
  4232,
  1955,
  582,
  10144,
  770,
  153,
  438695,
  381341,
  872,
  1579,
  600354,
  1368,
  520763,
  345,
  490,
  630,
  391,
  17431,
  829,
  599,
  637649,
  792,
  81,
  621,
  4982,
  2034,
  948,
  1022789,
  718930,
  581,
  1700,
  583,
  37135,
  1813,
  856,
  792307,
  306819,
  12429,
  9444,
  16859,
  696374,
  613,
  9340,
  4553,
  2493,
  785084,
  268,
  805,
  9023,
  184,
  265177,
  46738,
  843,
  9323,
  242,
  583083,
  49046,
  370172,
  19,
  555604,
  568,
  525,
  9377,
  906126,
  9800,
  947,
  976573,
  756999,
  277216,
  43949,
  8321,
  10229,
  855,
  388,
  9509,
  423108,
  628,
  265195,
  744,
  531428,
  703,
  675353,
  4347,
  14756,
  522402,
  1010581,
  284,
  3175,
  5156,
  88,
  901,
  433,
  10376,
  509,
  80,
  9475,
  3034,
  545609,
  615,
  110420,
  164,
  9325,
  762975,
  861,
  1587,
  6114,
  408,
  1572,
  11621,
  9277,
  824,
  9366,
  575264,
  22803,
  419478,
  823219,
  334,
  9016,
  451048,
  3580,
  6075,
  297,
  521,
  501929,
  503314,
  497582,
  7347,
  968,
  595,
  5548,
  426426,
  1580,
  9428,
  377,
  665,
  422,
  25376,
  797,
  15121,
  1398,
  937278,
  3558,
  871,
  686,
  9495,
  10098,
  508947,
  149870,
  12230,
  5503,
  610150,
  927,
  489999,
  1592,
  387,
  571,
  71,
  20453,
  911430,
  786892,
  678512,
  803796,
  5925,
  186,
  313297,
  339877,
  548,
  68,
  9426,
  251,
  12092,
  832,
  568160,
  580175,
  819,
  606856,
  10112,
  881,
  1541,
  492,
  793,
  37247,
  152742,
  425909,
  447362,
  12163,
  1087192,
  507089,
  246741,
  1607,
  61979,
  381289,
  639,
  980489,
  470044,
  481848,
  10693,
  813,
  18491,
  950396,
  588228,
  49797,
  655,
  556984,
  147,
  11224,
  382591,
  10895,
  882569,
  529203,
  941,
  4995,
  4977,
  840,
  1061474,
  11005,
  205,
  252,
  776503,
  1367,
  1904,
  51739,
  11886,
  1646,
  517814,
  228205,
  244267,
  614934,
  369557,
  996,
  493529,
  2898,
  939243,
  724089,
  10340,
  8810,
  853,
  9603,
  1233413,
  504253,
  7214,
  25237,
  466420,
  765,
  1062722,
  522212,
  37094,
  149871,
  1878,
  458220,
  764,
  7340,
  37136,
  7735,
  705861,
  38286,
  342470,
  553,
  617653,
  502033,
  11104,
  262,
  590223,
  9837,
  3170,
  13310,
  37797,
  439,
  10637,
  24238,
  658,
  804,
  379170,
  309809,
  37257,
  1885,
  5528,
  940721,
  399106,
  9820,
  915935,
  146,
  696,
  13363,
  866398,
  192,
  826,
  582014,
  8055,
  90,
  522924,
  505192,
  462,
  538362,
  614,
  55,
  15472,
  615777,
  431693,
  1669,
  1092,
  34584,
  2011,
  618344,
  614917,
  674324,
  438148,
  10734,
  2277,
  69,
  810693,
  11906,
  786,
  576845,
  9470,
  10331,
  705,
  638,
  11645,
  242828,
  319,
  482321,
  9078,
  14069,
  11878,
  587792,
  9361,
  1374,
  516486,
  775,
  30497,
  140420,
  11360,
  804095,
  8741,
  1598,
  1084736,
  223,
  962,
  522518,
  183011,
  60243,
  688,
  1542,
  10882,
  40096,
  7984,
  1924,
  926393,
  180299,
  899082,
  3782,
  653,
  818647,
  5924,
  14537,
  16,
  2756,
  840430,
  47931,
  2280,
  11474,
  9702,
  756,
  36685,
  10312,
  783,
  491480,
  10950,
  573435,
  8337,
  400160,
  338,
  666277,
  1621,
  642,
  10774,
  234,
  3112,
  766,
  9421,
  1026227,
  371645,
  11969,
  724495,
  441130,
  820,
  2666,
  1645,
  986056,
  12102,
  5123,
  664767,
  925,
  1054867,
  629542,
  921,
  537116,
  110416,
  654,
  697843,
  12104,
  522,
  4476,
  92321,
  891,
  650,
  79,
  873,
  10775,
  916224,
  698687,
  585511,
  6844,
  840326,
  11978,
  984,
  761053,
  11362,
  315465,
  2292,
  801,
  142061,
  11545,
  6978,
  12493,
  198375,
  1242898,
  814,
  593,
  86837,
  976893,
  26022,
  967,
  9602,
  10948,
  99,
  592350,
  930094,
  9473,
  508883,
  985,
  1078605,
  110,
  10867,
  963,
  682507,
  404378,
  1371,
  646,
  459151,
  609,
  1632,
  923,
  18148,
  13398,
  9040,
  404,
  40662,
  74308,
  303,
  942,
  1251,
  845,
  515042,
  108,
  965150,
  164558,
  667520,
  123025,
  8290,
  1523,
  1103,
  13597,
  794,
  762509,
  630566,
  1051,
  10110,
  746,
  614409,
  657,
  4032,
  698948,
  3090,
  961,
  58496,
  104,
  550205,
  30018,
  283587,
  8374,
  5825,
  9008,
  50531,
  1480,
  7508,
  592,
  393559,
  269,
  1923,
  755812,
  20126,
  144,
  966,
  581528,
  247,
  11615,
  10474,
  335578,
  1677,
  1360,
  397567,
  579974,
  1883,
  903,
  9659,
  726759,
  13855,
  940551,
  506574,
  992,
  541671,
  944401,
  154,
  3114,
  961323,
  837,
  219,
  488623,
  4550,
  374473,
  169813,
  9461,
  666,
  414419,
  3078,
  437068,
  964980,
  839,
  722778,
  802,
  899112,
  21575,
  10377,
  288,
  691179,
  9571,
  284427,
  949423,
  1084242,
  638507,
  645886,
  430424,
  9559,
  12144,
  3035,
  4808,
  51608,
  475,
  623,
  290,
  21032,
  11010,
  336804,
  244,
  293310,
  221,
  446893,
  7857,
  10778,
  9665,
  379,
  1633,
  586863,
  405,
  71157,
  13466,
  10843,
  1430,
  451945,
  780,
  1280,
  204,
  234200,
  11327,
  11697,
  4543,
  10242,
  10234,
  957,
  14784,
  136,
  2609,
  301,
  656690,
  1369,
  660120,
  4584,
  1396,
  575452,
  4960,
  10925,
  5511,
  158999,
  455661,
  360814,
  763,
  702,
  3083,
  2291,
  715931,
  4689,
  10673,
  11072,
  16052,
  843527,
  9394,
  113,
  505262,
  199,
  827,
  64,
  3116,
  1407,
  1391,
  1725,
  615643,
  531,
  607259,
  1850,
  15165,
  93,
  417261,
  11171,
  309,
  27670,
  11220,
  1547,
  2640,
  175,
  10669,
  9454,
  8009,
  596,
  320007,
  9003,
  574,
  2657,
  713,
  11031,
  829280,
  378,
  203,
  15196,
  576,
  11644,
  11113,
  1376434,
  626735,
  178682,
  348678,
  83533,
  331781,
  682110,
  9576,
  624,
  514754,
  922,
  1654,
  336,
  560057,
  13042,
  10633,
  643,
  7549,
  24480,
  10585,
  758866,
  11798,
  583406,
  2654,
  486589,
  13002,
  6620,
  297222,
  13929,
  11416,
  10400,
  137182,
  2013,
  995,
  11482,
  860,
  38396,
  11528,
  403,
  359156,
  8832,
  9504,
  5723,
  585244,
  381,
  892,
  446159,
  16307,
  514439,
  9387,
  907,
  226,
  10999,
  795514,
  343,
  1151534,
  1653,
  15097,
  847,
  3133,
  1245,
  11319,
  33273,
  13930,
  626,
  451,
  11690,
  910,
  990,
  1151031,
  8885,
  11368,
  109,
  9336,
  637534,
  9281,
  687,
  707886,
  1678,
  44639,
  16306,
  612706,
  705996,
  14919,
  10322,
  701387,
  177,
  850165,
  10747,
  38251,
  627725,
  1544,
  9589,
  1075794,
  11549,
  168,
  11202,
  828,
  2000,
  212,
  26280,
  663260,
  8769,
  19101,
  15137,
  544401,
  1052,
  11153,
  635,
  644583,
  9462,
  969492,
  227,
  9385,
  21734,
  9994,
  15371,
  768362,
  4816,
  2604,
  11287,
  9075,
  13377,
  2323,
  5143,
  16642,
  15080,
  1902,
  11901,
  9587,
  10435,
  1628,
  145,
  4176,
  691,
  575,
  10437,
  606,
  229,
  11336,
  37903,
  660,
  33701,
  900,
  8536,
  11963,
  850,
  1648,
  21484,
  1694,
  675445,
  339,
  689249,
  923939,
  10849,
  8393,
  1056360,
  15144,
  666243,
  12207,
  21348,
  8469,
  138,
  621013,
  9560,
  20982,
  28874,
  11481,
  11797,
  11850,
  11230,
  17814,
  838,
  940,
  10776,
  603661,
  9326,
  488,
  859,
  667,
  1100099,
  1788,
  1071585,
  11009,
  760,
  9662,
  11454,
  8913,
  10440,
  9013,
  12776,
  8764,
  1083862,
  902,
  250480,
  916,
  10518,
  759,
  11051,
  14645,
  260,
  10072,
  8408,
  6404,
  11639,
  8879,
  506,
  10998,
  663870,
  9474,
  2639,
  9647,
  253,
  668,
  12101,
  9303,
  10648,
  9314,
  10223,
  11713,
  790,
  11873,
  830,
  12233,
  10222,
  526,
  682,
  150,
  994,
  681,
  1643,
  2623,
  1714,
  2614,
  11527,
  2362,
  249,
  5336,
  13342,
  2605,
  2028,
  152,
  651,
  931,
  9972,
  10135,
  2616,
  11974,
  12335,
  11033,
  4978,
  16281,
  5919,
  9538,
  11864,
  9542,
  10015,
  9929,
  936,
  11497,
  2039,
  1412,
  8852,
  11522,
  698,
  11185,
  9599,
  10675,
  9443,
  13155,
  11967,
  579,
  4437,
  123,
  10803,
  1687,
  1685,
  2661,
  636,
  11449,
  1688,
  1705,
  // Daily category additions
  4912,    // Cast Away
  2157,    // Apollo 13
  194662,  // Captain Phillips
  9398,    // Catch Me If You Can
  11422,   // The Rock
  493922,  // Hereditary
  530385,  // Midsommar
  391713,  // Lady Bird
  312221,  // Creed
  339403,  // Baby Driver
  9654,    // The Italian Job (2003)
  60308,   // Moneyball
];
async function tmdbFetch<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDb API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Get full poster URL
export function getPosterUrl(posterPath: string | null, size: keyof typeof POSTER_SIZES = 'large'): string {
  if (!posterPath) {
    return ''; // Will use fallback color
  }
  return `${IMAGE_BASE_URL}/${POSTER_SIZES[size]}${posterPath}`;
}

// Get movie details by ID (with credits for director info)
export async function getMovieDetails(movieId: number): Promise<TMDbMovieWithCredits> {
  return tmdbFetch<TMDbMovieWithCredits>(`/movie/${movieId}?append_to_response=credits`);
}

// Extract director from credits
function extractDirector(credits?: TMDbCredits): { name: string; id: string } | null {
  if (!credits?.crew) return null;
  const director = credits.crew.find(person => person.job === 'Director');
  if (director) {
    return { name: director.name, id: `tmdb-person-${director.id}` };
  }
  return null;
}

// Get multiple movies by IDs
export async function getMoviesByIds(movieIds: number[]): Promise<TMDbMovieWithCredits[]> {
  const movies: TMDbMovieWithCredits[] = [];

  // Fetch in batches to avoid overwhelming the API
  const batchSize = 50;
  for (let i = 0; i < movieIds.length; i += batchSize) {
    const batch = movieIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(id => getMovieDetails(id).catch(err => {
        console.warn(`Failed to fetch movie ${id}:`, err);
        return null;
      }))
    );
    movies.push(...batchResults.filter((m): m is TMDbMovieWithCredits => m !== null));

    // Small delay between batches to respect rate limits
    if (i + batchSize < movieIds.length) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  return movies;
}

// Map TMDb genres to our app genres
export function mapGenres(tmdbGenres: { id: number; name: string }[]): Genre[] {
  const mapped = tmdbGenres
    .map(g => GENRE_MAP[g.id])
    .filter((g): g is string => g !== undefined);

  // Remove duplicates and limit to 3
  const unique = [...new Set(mapped)] as Genre[];
  return unique.slice(0, 3);
}

// Generate a color from movie title (for fallback background)
export function generatePosterColor(title: string): string {
  const colors = [
    '#1e3a5f', '#2d4a3e', '#4a2d4a', '#5f3a1e', '#3a1e5f',
    '#1e5f3a', '#5f1e3a', '#3a5f1e', '#4a3a2d', '#2d3a4a',
  ];
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// Convert TMDb movie to our app format
export function tmdbToAppMovie(tmdb: TMDbMovieWithCredits): {
  id: string;
  tmdbId: number;
  title: string;
  year: number;
  genres: Genre[];
  posterUrl: string;
  posterPath: string | null;
  posterColor: string;
  overview: string;
  voteAverage: number;
  voteCount: number;
  originalLanguage: string;
  collectionId?: number;
  collectionName?: string;
  directorName?: string;
  directorId?: string;
} {
  const year = tmdb.release_date ? parseInt(tmdb.release_date.split('-')[0]) : 2000;
  const genres = mapGenres(tmdb.genres);
  const director = extractDirector(tmdb.credits);

  return {
    id: `tmdb-${tmdb.id}`,
    tmdbId: tmdb.id,
    title: tmdb.title,
    year,
    genres: genres.length > 0 ? genres : ['drama'], // Default to drama if no mapped genres
    posterUrl: getPosterUrl(tmdb.poster_path),
    posterPath: tmdb.poster_path,
    posterColor: generatePosterColor(tmdb.title),
    overview: tmdb.overview,
    voteAverage: tmdb.vote_average,
    voteCount: tmdb.vote_count,
    originalLanguage: tmdb.original_language,
    collectionId: tmdb.belongs_to_collection?.id,
    collectionName: tmdb.belongs_to_collection?.name,
    directorName: director?.name,
    directorId: director?.id,
  };
}

// Fetch all curated movies
export async function fetchCuratedMovies(): Promise<ReturnType<typeof tmdbToAppMovie>[]> {
  console.log('[TMDb] Fetching curated movies...');

  // Remove duplicates from curated list
  const uniqueIds = [...new Set(CURATED_MOVIE_IDS)];
  console.log(`[TMDb] ${uniqueIds.length} unique movie IDs to fetch`);

  const tmdbMovies = await getMoviesByIds(uniqueIds);
  const appMovies = tmdbMovies.map(tmdbToAppMovie);

  console.log(`[TMDb] Fetched ${appMovies.length} movies`);
  return appMovies;
}

// Search for movies (for future use)
export async function searchMovies(query: string): Promise<TMDbMovie[]> {
  const response = await tmdbFetch<TMDbSearchResponse>(
    `/search/movie?query=${encodeURIComponent(query)}&include_adult=false`
  );
  return response.results;
}

// Get popular movies (for future use)
export async function getPopularMovies(page = 1): Promise<TMDbMovie[]> {
  const response = await tmdbFetch<TMDbSearchResponse>(
    `/movie/popular?page=${page}`
  );
  return response.results;
}

// ============================================
// WATCH PROVIDERS API
// ============================================

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface WatchProviders {
  stream: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  link: string | null;
}

interface TMDbWatchProvidersResponse {
  id: number;
  results: Record<string, {
    link?: string;
    flatrate?: WatchProvider[];
    rent?: WatchProvider[];
    buy?: WatchProvider[];
  }>;
}

// Get watch providers for a movie
export async function getWatchProviders(
  movieId: number,
  countryCode: string = 'US'
): Promise<WatchProviders> {
  try {
    const response = await tmdbFetch<TMDbWatchProvidersResponse>(
      `/movie/${movieId}/watch/providers`
    );

    const countryData = response.results[countryCode];

    if (!countryData) {
      return { stream: [], rent: [], buy: [], link: null };
    }

    return {
      stream: (countryData.flatrate || []).sort((a, b) => a.display_priority - b.display_priority),
      rent: (countryData.rent || []).sort((a, b) => a.display_priority - b.display_priority),
      buy: (countryData.buy || []).sort((a, b) => a.display_priority - b.display_priority),
      link: countryData.link || null,
    };
  } catch (error) {
    console.warn(`[TMDb] Failed to fetch watch providers for movie ${movieId}:`, error);
    return { stream: [], rent: [], buy: [], link: null };
  }
}

// Get provider logo URL
export function getProviderLogoUrl(logoPath: string): string {
  return `${IMAGE_BASE_URL}/original${logoPath}`;
}

// ============================================
// MOVIE DETAILS WITH CERTIFICATION
// ============================================

interface TMDbReleaseDatesResponse {
  id: number;
  results: {
    iso_3166_1: string;
    release_dates: {
      certification: string;
      release_date: string;
      type: number;
    }[];
  }[];
}

// Get movie certification (rating like PG-13)
export async function getMovieCertification(
  movieId: number,
  countryCode: string = 'US'
): Promise<string | null> {
  try {
    const response = await tmdbFetch<TMDbReleaseDatesResponse>(
      `/movie/${movieId}/release_dates`
    );

    const countryData = response.results.find(r => r.iso_3166_1 === countryCode);
    if (!countryData) return null;

    // Find the theatrical or digital release certification
    const release = countryData.release_dates.find(r => r.certification && (r.type === 3 || r.type === 4 || r.type === 2));
    return release?.certification || countryData.release_dates.find(r => r.certification)?.certification || null;
  } catch (error) {
    console.warn(`[TMDb] Failed to fetch certification for movie ${movieId}:`, error);
    return null;
  }
}

// Cast member type for export
export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
}

// Get full movie details including runtime, overview, certification, watch providers, and cast
export async function getFullMovieDetails(
  movieId: number,
  countryCode: string = 'US'
): Promise<{
  runtime: number | null;
  overview: string | null;
  certification: string | null;
  watchProviders: WatchProviders;
  tagline: string | null;
  director: string | null;
  cast: CastMember[];
}> {
  // Check cache first
  const cacheKey = movieId * 1000 + countryCode.charCodeAt(0); // Simple hash
  const cached = getCachedData(movieDetailsCache, cacheKey);
  if (cached) return cached;

  const [details, certification, watchProviders] = await Promise.all([
    getMovieDetails(movieId).catch(() => null),
    getMovieCertification(movieId, countryCode).catch(() => null),
    getWatchProviders(movieId, countryCode).catch(() => ({ stream: [], rent: [], buy: [], link: null })),
  ]);

  // Extract director from credits
  const director = details?.credits?.crew?.find(person => person.job === 'Director')?.name || null;

  // Extract top cast members (limit to 5)
  const cast: CastMember[] = (details?.credits?.cast || [])
    .slice(0, 5)
    .map(person => ({
      id: person.id,
      name: person.name,
      character: person.character,
      profilePath: person.profile_path,
    }));

  const result = {
    runtime: details?.runtime || null,
    overview: details?.overview || null,
    certification,
    watchProviders,
    tagline: details?.tagline || null,
    director,
    cast,
  };

  // Cache the result
  setCachedData(movieDetailsCache, cacheKey, result);

  return result;
}

// Format runtime (minutes to hours and minutes)
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ============================================
// MOVIE TRAILERS API
// ============================================

export interface MovieTrailer {
  key: string;      // YouTube video ID
  name: string;     // Trailer title
  type: string;     // "Trailer", "Teaser", etc.
  official: boolean;
  publishedAt: string;
}

interface TMDbVideoResult {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

interface TMDbVideosResponse {
  id: number;
  results: TMDbVideoResult[];
}

// Get movie trailer (YouTube)
export async function getMovieTrailer(movieId: number): Promise<MovieTrailer | null> {
  // Check cache first
  const cached = getCachedData(trailerCache, movieId);
  if (cached !== null) return cached;

  try {
    const response = await tmdbFetch<TMDbVideosResponse>(`/movie/${movieId}/videos`);

    // Filter for YouTube trailers
    const youtubeTrailers = response.results
      .filter(video => video.site === 'YouTube' && video.type === 'Trailer')
      .sort((a, b) => {
        // Prefer official trailers
        if (a.official !== b.official) return b.official ? 1 : -1;
        // Then sort by published date (newest first)
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });

    if (youtubeTrailers.length === 0) {
      // Fallback to teasers if no trailers
      const teasers = response.results
        .filter(video => video.site === 'YouTube' && video.type === 'Teaser')
        .sort((a, b) => {
          if (a.official !== b.official) return b.official ? 1 : -1;
          return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
        });

      if (teasers.length === 0) return null;

      const teaser = teasers[0];
      const teaserResult: MovieTrailer = {
        key: teaser.key,
        name: teaser.name,
        type: teaser.type,
        official: teaser.official,
        publishedAt: teaser.published_at,
      };
      setCachedData(trailerCache, movieId, teaserResult);
      return teaserResult;
    }

    const trailer = youtubeTrailers[0];
    const trailerResult: MovieTrailer = {
      key: trailer.key,
      name: trailer.name,
      type: trailer.type,
      official: trailer.official,
      publishedAt: trailer.published_at,
    };
    setCachedData(trailerCache, movieId, trailerResult);
    return trailerResult;
  } catch (error) {
    console.warn(`[TMDb] Failed to fetch trailer for movie ${movieId}:`, error);
    return null;
  }
}

// Get YouTube thumbnail URL
export function getYouTubeThumbnailUrl(videoKey: string): string {
  return `https://img.youtube.com/vi/${videoKey}/hqdefault.jpg`;
}
