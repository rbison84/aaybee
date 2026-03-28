const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get old movie IDs
  const { data: oldMovies } = await supabase.from('movies').select('id').is('tmdb_id', null);
  const oldIds = oldMovies?.map(m => m.id) || [];
  console.log('Old movies:', oldIds.length);

  // Check comparisons referencing old movies
  const { data: compsA } = await supabase.from('comparisons').select('id').in('movie_a_id', oldIds);
  const { data: compsB } = await supabase.from('comparisons').select('id').in('movie_b_id', oldIds);

  const compIds = new Set([...(compsA || []).map(c => c.id), ...(compsB || []).map(c => c.id)]);
  console.log('Comparisons referencing old movies:', compIds.size);

  // Check user_movies referencing old movies
  const { data: userMovies } = await supabase.from('user_movies').select('id').in('movie_id', oldIds);
  console.log('User_movies referencing old movies:', userMovies?.length || 0);

  // Total comparisons for context
  const { count: totalComps } = await supabase.from('comparisons').select('*', { count: 'exact', head: true });
  console.log('\nTotal comparisons in DB:', totalComps);
}

main();
