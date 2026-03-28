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
  const { count } = await supabase.from('movies').select('*', { count: 'exact', head: true });
  console.log('Total movies:', count);

  const { data: noTmdbId, error } = await supabase.from('movies').select('id, title').is('tmdb_id', null);
  console.log('Without tmdb_id (old entries):', noTmdbId?.length || 0);

  if (noTmdbId && noTmdbId.length > 0) {
    console.log('\nOld entries to delete:');
    noTmdbId.slice(0, 10).forEach(m => console.log(' ', m.id, '-', m.title));
    if (noTmdbId.length > 10) console.log('  ... and', noTmdbId.length - 10, 'more');
  }

  const { data: withTmdbId } = await supabase.from('movies').select('id').not('tmdb_id', 'is', null);
  console.log('\nWith tmdb_id (new entries):', withTmdbId?.length || 0);
}

main();
