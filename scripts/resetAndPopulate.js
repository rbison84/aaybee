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
  console.log('=== Resetting Database ===\n');

  // 1. Delete all comparisons
  console.log('Deleting comparisons...');
  await supabase.from('comparisons').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 2. Delete all user_movies
  console.log('Deleting user_movies...');
  await supabase.from('user_movies').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 3. Delete all movies
  console.log('Deleting movies...');
  await supabase.from('movies').delete().neq('id', 'x');

  // Verify
  const { count } = await supabase.from('movies').select('*', { count: 'exact', head: true });
  console.log('\nMovies remaining:', count);
  console.log('\nNow run: node scripts/populateMovies.js');
}

main();
