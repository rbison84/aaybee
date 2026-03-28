// Check movie poster_url status
// Run: node scripts/checkMoviePosters.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPosters() {
  console.log('Checking movie poster_url status...\n');

  // Get total count
  const { count: totalCount } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true });

  // Get count with poster_url
  const { count: withPoster } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true })
    .not('poster_url', 'is', null)
    .neq('poster_url', '');

  // Get count without poster_url
  const { count: withoutPoster } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true })
    .or('poster_url.is.null,poster_url.eq.');

  console.log(`Total movies: ${totalCount}`);
  console.log(`With poster_url: ${withPoster}`);
  console.log(`Without poster_url: ${withoutPoster}`);
  console.log(`\nCoverage: ${((withPoster / totalCount) * 100).toFixed(1)}%`);

  // Sample some movies with missing posters
  console.log('\n--- Sample movies without posters ---');
  const { data: missingPosters } = await supabase
    .from('movies')
    .select('id, title, year, poster_url')
    .or('poster_url.is.null,poster_url.eq.')
    .limit(10);

  if (missingPosters?.length > 0) {
    missingPosters.forEach(m => {
      console.log(`  - ${m.title} (${m.year}) - poster_url: ${m.poster_url === null ? 'NULL' : `"${m.poster_url}"`}`);
    });
  } else {
    console.log('  None found!');
  }

  // Sample some movies with posters
  console.log('\n--- Sample movies WITH posters ---');
  const { data: withPosters } = await supabase
    .from('movies')
    .select('id, title, year, poster_url')
    .not('poster_url', 'is', null)
    .neq('poster_url', '')
    .limit(5);

  if (withPosters?.length > 0) {
    withPosters.forEach(m => {
      console.log(`  - ${m.title} (${m.year})`);
      console.log(`    URL: ${m.poster_url?.slice(0, 60)}...`);
    });
  }

  // Check movies that friends have rated
  console.log('\n--- Checking friend-rated movies ---');
  const { data: friendMovieIds } = await supabase
    .from('user_movies')
    .select('movie_id')
    .limit(100);

  if (friendMovieIds?.length > 0) {
    const uniqueIds = [...new Set(friendMovieIds.map(m => m.movie_id))];

    const { data: friendMovies } = await supabase
      .from('movies')
      .select('id, title, poster_url')
      .in('id', uniqueIds.slice(0, 20));

    let missingCount = 0;
    friendMovies?.forEach(m => {
      if (!m.poster_url) {
        console.log(`  MISSING: ${m.title} (id: ${m.id})`);
        missingCount++;
      }
    });
    console.log(`\n  ${missingCount} out of ${friendMovies?.length || 0} sample friend-rated movies missing posters`);
  }
}

checkPosters().catch(console.error);
