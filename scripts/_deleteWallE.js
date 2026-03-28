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
  // Delete in FK order
  for (const table of ['comparisons', 'user_movies', 'global_movie_stats', 'recommendation_feedback']) {
    const { error } = await client.from(table).delete().or(`movie_id.eq.${ID},movie_a_id.eq.${ID},movie_b_id.eq.${ID}`);
    if (error && error.code !== '42703') console.log(`  ${table}:`, error.message);
    else console.log(`  ${table}: cleared`);
  }
  // Now delete the movie
  const { error } = await client.from('movies').delete().eq('id', ID);
  if (error) console.log('DELETE FAILED:', error.message);
  else console.log('\nDeleted', ID);
}
main();
