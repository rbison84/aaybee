// Update all movies with poster URLs from TMDB
// Run: node scripts/updateMoviePosters.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3NmE0M2IyZDRjNzczYjIwNTk2ZWM2M2Q4OWE4MzM4NiIsIm5iZiI6MTc0MDI1NjE1MS4wNjA5OTk5LCJzdWIiOiI2N2JhMzM5NzU1ZTM5OTRiYmQ0NjY5OWQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.AkPI68pg5yxF79_qmR6xv9h2f_UHqKNi_mv_MiSg8WY';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

async function fetchTmdbMovie(tmdbId) {
  const response = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`  Failed to fetch TMDB ${tmdbId}: ${response.status}`);
    return null;
  }

  return response.json();
}

async function updateMoviePosters() {
  console.log('Fetching all movies from database...\n');

  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, title, year, poster_url')
    .order('title');

  if (error) {
    console.error('Failed to fetch movies:', error);
    return;
  }

  console.log(`Found ${movies.length} movies to update\n`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const movie of movies) {
    // Extract TMDB ID from movie ID (format: tmdb-12345)
    const tmdbIdMatch = movie.id.match(/^tmdb-(\d+)$/);
    if (!tmdbIdMatch) {
      console.log(`  SKIP: ${movie.title} - Invalid ID format: ${movie.id}`);
      skipped++;
      continue;
    }

    const tmdbId = parseInt(tmdbIdMatch[1]);

    // Fetch from TMDB
    const tmdbData = await fetchTmdbMovie(tmdbId);
    if (!tmdbData || !tmdbData.poster_path) {
      console.log(`  FAIL: ${movie.title} - No poster available`);
      failed++;
      continue;
    }

    const posterUrl = `${IMAGE_BASE_URL}${tmdbData.poster_path}`;

    // Update in database
    const { error: updateError } = await supabase
      .from('movies')
      .update({ poster_url: posterUrl })
      .eq('id', movie.id);

    if (updateError) {
      console.log(`  FAIL: ${movie.title} - Update error: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  OK: ${movie.title}`);
      updated++;
    }

    // Small delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n========================================');
  console.log(`Updated: ${updated}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total:   ${movies.length}`);
  console.log('========================================\n');

  // Verify the update
  const { count: withPoster } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true })
    .not('poster_url', 'is', null)
    .neq('poster_url', '');

  console.log(`Movies with poster_url: ${withPoster}/${movies.length}`);
}

updateMoviePosters().catch(console.error);
