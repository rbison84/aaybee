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
  const { data: oldMovies } = await supabase
    .from('movies')
    .select('id, title, tier, vote_count')
    .is('tmdb_id', null);

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, null: 0 };
  for (const m of (oldMovies || [])) {
    tierCounts[m.tier || 'null']++;
  }

  console.log('Old movies tier distribution:');
  console.log('  Tier 1:', tierCounts[1]);
  console.log('  Tier 2:', tierCounts[2]);
  console.log('  Tier 3:', tierCounts[3]);
  console.log('  Tier 4:', tierCounts[4]);
  console.log('  null:', tierCounts['null']);

  console.log('\nSample old Tier 1 movies:');
  oldMovies?.filter(m => m.tier === 1).slice(0, 5).forEach(m =>
    console.log(' ', m.title)
  );
}

main();
