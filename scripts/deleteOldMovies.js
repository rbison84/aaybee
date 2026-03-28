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
  // Get old entries (no tmdb_id)
  const { data: oldMovies } = await supabase.from('movies').select('id').is('tmdb_id', null);
  console.log('Found', oldMovies?.length || 0, 'old movies to delete');

  if (!oldMovies || oldMovies.length === 0) {
    console.log('Nothing to delete');
    return;
  }

  // Delete them
  const { error } = await supabase
    .from('movies')
    .delete()
    .is('tmdb_id', null);

  if (error) {
    console.error('Delete error:', error.message);
    return;
  }

  // Verify
  const { count } = await supabase.from('movies').select('*', { count: 'exact', head: true });
  console.log('Movies remaining:', count);
}

main();
