const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ID = 'tmdb-1631542';

async function main() {
  // Delete comparisons referencing this movie (movie_a_id or movie_b_id)
  let r;
  r = await client.from('comparisons').delete().eq('movie_a_id', ID);
  console.log('comparisons (movie_a):', r.error ? r.error.message : 'cleared');
  r = await client.from('comparisons').delete().eq('movie_b_id', ID);
  console.log('comparisons (movie_b):', r.error ? r.error.message : 'cleared');

  // Delete user_movies
  r = await client.from('user_movies').delete().eq('movie_id', ID);
  console.log('user_movies:', r.error ? r.error.message : 'cleared');

  // Delete global_movie_stats
  r = await client.from('global_movie_stats').delete().eq('movie_id', ID);
  console.log('global_movie_stats:', r.error ? r.error.message : 'cleared');

  // Delete the movie
  r = await client.from('movies').delete().eq('id', ID);
  console.log('movies:', r.error ? r.error.message : 'DELETED');
}
main();
