/**
 * Add new movies to Supabase database
 *
 * Usage:
 *   node scripts/addMovies.js <tmdb_id1> <tmdb_id2> ...
 *   node scripts/addMovies.js --file movies.txt
 *   node scripts/addMovies.js --recompute-tiers
 *
 * Examples:
 *   node scripts/addMovies.js 550 278 238         # Add Fight Club, Shawshank, Godfather
 *   node scripts/addMovies.js --file new-ids.txt  # Add IDs from file (one per line)
 *   node scripts/addMovies.js --recompute-tiers   # Recompute all tiers without adding
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      const value = valueParts.join('=').trim();
      if (value) process.env[key.trim()] = value;
    }
  });
} catch (e) {
  console.error('Failed to load .env:', e.message);
  process.exit(1);
}

// TMDb API
const API_TOKEN = process.env.EXPO_PUBLIC_TMDB_API_TOKEN;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Supabase client
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Genre mapping
const GENRE_MAP = {
  28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy',
  80: 'thriller', 99: 'drama', 18: 'drama', 10751: 'comedy',
  14: 'fantasy', 36: 'drama', 27: 'horror', 10402: 'drama',
  9648: 'thriller', 10749: 'romance', 878: 'scifi', 10770: 'drama',
  53: 'thriller', 10752: 'action', 37: 'adventure',
};

// Tier sizes
const TIER_SIZES = { tier1: 100, tier2: 175, tier3: 275, tier4: Infinity };

async function tmdbFetch(endpoint) {
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
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
    tier: 4, // New movies start at tier 4, will be recomputed
    collection_id: data.belongs_to_collection?.id || null,
    collection_name: data.belongs_to_collection?.name || null,
    director_name: director?.name || null,
    director_id: director?.id || null,
    original_language: data.original_language || null,
    tmdb_data: data,
  };
}

async function addMovies(tmdbIds) {
  console.log(`\nAdding ${tmdbIds.length} movies...\n`);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const tmdbId of tmdbIds) {
    const movie = await getMovieDetails(tmdbId);
    if (!movie) {
      console.log(`  ✗ ${tmdbId}: Not found on TMDb`);
      failed++;
      continue;
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('movies')
      .select('id')
      .eq('id', movie.id)
      .single();

    if (existing) {
      console.log(`  ○ ${tmdbId}: ${movie.title} (already exists)`);
      skipped++;
      continue;
    }

    // Insert
    const { error } = await supabase.from('movies').insert(movie);
    if (error) {
      console.log(`  ✗ ${tmdbId}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${tmdbId}: ${movie.title} (${movie.year})`);
      added++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nSummary: ${added} added, ${skipped} skipped, ${failed} failed`);
  return added > 0;
}

async function recomputeTiers() {
  console.log('\nRecomputing tiers for all movies...\n');

  // Fetch all movies
  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, vote_average, collection_id');

  if (error || !movies) {
    console.error('Failed to fetch movies:', error?.message);
    return;
  }

  console.log(`Found ${movies.length} movies`);

  // Group by collection
  const collections = new Map();
  const standalone = [];

  for (const movie of movies) {
    if (movie.collection_id) {
      const group = collections.get(movie.collection_id) || [];
      group.push(movie);
      collections.set(movie.collection_id, group);
    } else {
      standalone.push(movie);
    }
  }

  // Compute tiers
  const primaryFromCollections = [];
  const secondaryFromCollections = [];

  for (const [, group] of collections) {
    group.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    primaryFromCollections.push(group[0]);
    secondaryFromCollections.push(...group.slice(1));
  }

  const tier1Candidates = [...primaryFromCollections, ...standalone];
  tier1Candidates.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  secondaryFromCollections.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

  const updates = [];

  // Primary candidates
  for (let i = 0; i < tier1Candidates.length; i++) {
    const movie = tier1Candidates[i];
    let tier;
    if (i < TIER_SIZES.tier1) tier = 1;
    else if (i < TIER_SIZES.tier2) tier = 2;
    else if (i < TIER_SIZES.tier3) tier = 3;
    else tier = 4;
    updates.push({ id: movie.id, tier });
  }

  // Secondary (franchise sequels)
  for (let i = 0; i < secondaryFromCollections.length; i++) {
    const movie = secondaryFromCollections[i];
    let tier;
    if (i < 50) tier = 2;
    else if (i < 125) tier = 3;
    else tier = 4;
    updates.push({ id: movie.id, tier });
  }

  // Apply updates in batches
  console.log('Updating tiers...');
  const batchSize = 100;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    for (const { id, tier } of batch) {
      await supabase.from('movies').update({ tier }).eq('id', id);
    }
    process.stdout.write(`\r  Updated ${Math.min(i + batchSize, updates.length)}/${updates.length}`);
  }

  // Count tiers
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  updates.forEach(u => tierCounts[u.tier]++);

  console.log('\n');
  console.log('New tier distribution:');
  console.log(`  Tier 1: ${tierCounts[1]} movies`);
  console.log(`  Tier 2: ${tierCounts[2]} movies`);
  console.log(`  Tier 3: ${tierCounts[3]} movies`);
  console.log(`  Tier 4: ${tierCounts[4]} movies`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/addMovies.js <tmdb_id1> <tmdb_id2> ...');
    console.log('  node scripts/addMovies.js --file <path>');
    console.log('  node scripts/addMovies.js --recompute-tiers');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/addMovies.js 550 278 238');
    console.log('  node scripts/addMovies.js --file new-movies.txt');
    process.exit(0);
  }

  // Parse arguments
  if (args[0] === '--recompute-tiers') {
    await recomputeTiers();
    return;
  }

  let tmdbIds;
  if (args[0] === '--file') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Please provide a file path');
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    tmdbIds = content.split('\n')
      .map(line => parseInt(line.trim(), 10))
      .filter(id => !isNaN(id));
  } else {
    tmdbIds = args.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  }

  if (tmdbIds.length === 0) {
    console.error('No valid TMDb IDs provided');
    process.exit(1);
  }

  const moviesAdded = await addMovies(tmdbIds);

  if (moviesAdded) {
    console.log('\nRecomputing tiers to include new movies...');
    await recomputeTiers();
  }
}

main().catch(console.error);
