/**
 * Populate Supabase movies table with curated TMDb movies
 *
 * Reads CURATED_MOVIE_IDS from src/services/tmdb.ts
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

// Read CURATED_MOVIE_IDS from tmdb.ts
const tmdbPath = path.join(__dirname, '..', 'src', 'services', 'tmdb.ts');
const tmdbContent = fs.readFileSync(tmdbPath, 'utf-8');
const match = tmdbContent.match(/CURATED_MOVIE_IDS = \[([\s\S]*?)\];/);
if (!match) {
  console.error('Could not find CURATED_MOVIE_IDS in tmdb.ts');
  process.exit(1);
}
// Keep original order - IDs are pre-sorted by weighted score (rating * log10(votes))
const CURATED_MOVIE_IDS = match[1].match(/\d+/g).map(Number);
console.log('Loaded', CURATED_MOVIE_IDS.length, 'movie IDs from tmdb.ts (pre-sorted by weighted score)');

// TMDb API
const API_TOKEN = process.env.EXPO_PUBLIC_TMDB_API_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GENRE_MAP = {
  28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy',
  80: 'thriller', 99: 'drama', 18: 'drama', 10751: 'comedy',
  14: 'fantasy', 36: 'drama', 27: 'horror', 10402: 'drama',
  9648: 'thriller', 10749: 'romance', 878: 'scifi', 10770: 'drama',
  53: 'thriller', 10752: 'action', 37: 'adventure',
};

// Tier boundaries (based on position in weighted-score-sorted list)
// Tier 1: 1-100, Tier 2: 101-175, Tier 3: 176-275, Tier 4: 276+

async function tmdbFetch(endpoint) {
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`TMDb API error: ${response.status}`);
  }
  return response.json();
}

function mapGenres(tmdbGenres) {
  if (!tmdbGenres) return ['drama'];
  const mapped = tmdbGenres.map(g => GENRE_MAP[g.id]).filter(g => g);
  return [...new Set(mapped)].slice(0, 3) || ['drama'];
}

function generatePosterColor(title) {
  const colors = ['#1e3a5f', '#2d4a3e', '#4a2d4a', '#5f3a1e', '#3a1e5f'];
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

async function getMovieDetails(tmdbId) {
  const data = await tmdbFetch(`/movie/${tmdbId}?append_to_response=credits`);
  if (!data) return null;
  const year = data.release_date ? parseInt(data.release_date.split('-')[0]) : 2000;
  const director = data.credits?.crew?.find(p => p.job === 'Director');
  return {
    id: `tmdb-${data.id}`,
    tmdb_id: data.id,
    title: data.title,
    year,
    genres: mapGenres(data.genres),
    poster_url: data.poster_path ? `${IMAGE_BASE_URL}${data.poster_path}` : null,
    poster_path: data.poster_path,
    poster_color: generatePosterColor(data.title),
    emoji: '🎬',
    overview: data.overview,
    vote_count: data.vote_count || 0,
    vote_average: data.vote_average || 0,
    tier: 4,
    collection_id: data.belongs_to_collection?.id || null,
    collection_name: data.belongs_to_collection?.name || null,
    director_name: director?.name || null,
    director_id: director?.id || null,
    original_language: data.original_language || null,
    tmdb_data: data,
  };
}

// Assign tiers based on position (movies are pre-sorted by weighted score)
// Tier 1: positions 1-100
// Tier 2: positions 101-175
// Tier 3: positions 176-275
// Tier 4: positions 276+
function computeTiers(movies, originalOrder) {
  // Create a map of tmdb_id to position in original order
  const positionMap = new Map();
  originalOrder.forEach((id, idx) => positionMap.set(id, idx));

  return movies.map(movie => {
    const position = positionMap.get(movie.tmdb_id) ?? 9999;
    let tier = 4;
    if (position < 100) tier = 1;
    else if (position < 175) tier = 2;
    else if (position < 275) tier = 3;
    return { ...movie, tier };
  });
}

async function main() {
  console.log('\n=== Populating Supabase Movies Table ===\n');
  console.log(`Fetching ${CURATED_MOVIE_IDS.length} movies from TMDb API...`);

  const movies = [];
  const batchSize = 10;
  let failed = 0;

  for (let i = 0; i < CURATED_MOVIE_IDS.length; i += batchSize) {
    const batch = CURATED_MOVIE_IDS.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(id => getMovieDetails(id).catch(() => { failed++; return null; })));
    movies.push(...results.filter(m => m !== null));
    process.stdout.write(`\r  Fetched ${Math.min(i + batchSize, CURATED_MOVIE_IDS.length)}/${CURATED_MOVIE_IDS.length} (${failed} failed)`);
    if (i + batchSize < CURATED_MOVIE_IDS.length) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\nFetched ${movies.length} movies successfully\n`);

  console.log('Computing tiers based on weighted score position...');
  const moviesWithTiers = computeTiers(movies, CURATED_MOVIE_IDS);
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  moviesWithTiers.forEach(m => tierCounts[m.tier]++);
  console.log(`  Tier 1: ${tierCounts[1]}, Tier 2: ${tierCounts[2]}, Tier 3: ${tierCounts[3]}, Tier 4: ${tierCounts[4]}\n`);

  console.log('Inserting to Supabase...');
  const insertBatchSize = 100;
  let inserted = 0, errors = 0;
  for (let i = 0; i < moviesWithTiers.length; i += insertBatchSize) {
    const batch = moviesWithTiers.slice(i, i + insertBatchSize);
    const { error } = await supabase.from('movies').upsert(batch, { onConflict: 'id' });
    if (error) { console.error(`\n  Batch error:`, error.message); errors += batch.length; }
    else { inserted += batch.length; }
    process.stdout.write(`\r  Inserted ${inserted}/${moviesWithTiers.length} (${errors} errors)`);
  }

  const { count: curatedCount } = await supabase.from('movies').select('*', { count: 'exact', head: true });
  console.log(`\n\n=== Phase 1 Complete ===\nCurated movies in Supabase: ${curatedCount}\n`);

  // ============================================
  // PHASE 2: Tier 5 (Search-Only) Movies
  // Discover all movies with 400+ TMDb votes
  // ============================================

  console.log('\n=== Phase 2: Populating Tier 5 (Search-Only) Movies ===\n');

  // Build a set of TMDb IDs already in the curated set
  const curatedTmdbIds = new Set(CURATED_MOVIE_IDS);
  let tier5Movies = [];
  let tier5Failed = 0;
  let totalDiscovered = 0;
  let skippedExisting = 0;

  // Paginate through TMDb Discover API
  // TMDb allows up to 500 pages (20 results per page = 10,000 max)
  const maxPages = 500;

  console.log('Discovering movies with 400+ votes from TMDb...');

  for (let page = 1; page <= maxPages; page++) {
    const discoverData = await tmdbFetch(
      `/discover/movie?sort_by=vote_count.desc&vote_count.gte=400&page=${page}`
    );

    if (!discoverData || !discoverData.results || discoverData.results.length === 0) {
      console.log(`\n  No more results at page ${page}`);
      break;
    }

    totalDiscovered += discoverData.results.length;

    // Filter out movies already in the curated set
    const newMovieIds = discoverData.results
      .map(m => m.id)
      .filter(id => !curatedTmdbIds.has(id));

    skippedExisting += (discoverData.results.length - newMovieIds.length);

    // Fetch full details for new movies in batches
    for (let i = 0; i < newMovieIds.length; i += batchSize) {
      const detailBatch = newMovieIds.slice(i, i + batchSize);
      const detailResults = await Promise.all(
        detailBatch.map(id => getMovieDetails(id).catch(() => { tier5Failed++; return null; }))
      );
      const validResults = detailResults
        .filter(m => m !== null)
        .map(m => ({ ...m, tier: 5 })); // All get tier 5
      tier5Movies.push(...validResults);

      // Rate limiting between detail batches
      if (i + batchSize < newMovieIds.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    process.stdout.write(
      `\r  Page ${page}/${discoverData.total_pages || '?'} | ` +
      `Discovered: ${totalDiscovered} | New tier 5: ${tier5Movies.length} | ` +
      `Skipped (curated): ${skippedExisting} | Failed: ${tier5Failed}`
    );

    // Stop if we've gone past the total pages
    if (page >= (discoverData.total_pages || maxPages)) break;

    // Rate limiting: 1s pause every 40 pages to stay well within TMDb rate limits
    if (page % 40 === 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n\nFetched ${tier5Movies.length} tier 5 movies successfully\n`);

  // Upsert tier 5 movies to Supabase in batches
  if (tier5Movies.length > 0) {
    console.log('Inserting tier 5 movies to Supabase...');
    let tier5Inserted = 0, tier5Errors = 0;

    for (let i = 0; i < tier5Movies.length; i += insertBatchSize) {
      const batch = tier5Movies.slice(i, i + insertBatchSize);
      const { error } = await supabase.from('movies').upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error(`\n  Tier 5 batch error:`, error.message);
        tier5Errors += batch.length;
      } else {
        tier5Inserted += batch.length;
      }
      process.stdout.write(`\r  Inserted ${tier5Inserted}/${tier5Movies.length} (${tier5Errors} errors)`);
    }
    console.log('');
  }

  // Final count
  const { count: totalCount } = await supabase.from('movies').select('*', { count: 'exact', head: true });
  const { count: t5Count } = await supabase.from('movies').select('*', { count: 'exact', head: true }).eq('tier', 5);
  console.log(`\n=== All Phases Complete ===`);
  console.log(`Total movies in Supabase: ${totalCount}`);
  console.log(`  Tiers 1-4 (curated): ${totalCount - (t5Count || 0)}`);
  console.log(`  Tier 5 (search-only): ${t5Count}\n`);
}

main().catch(console.error);
