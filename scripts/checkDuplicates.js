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
  // Get old movie IDs (without tmdb_id)
  const { data: oldMovies } = await supabase.from('movies').select('id, title, tier').is('tmdb_id', null);

  // Get new movies (with tmdb_id)
  const { data: newMovies } = await supabase.from('movies').select('id, tmdb_id').not('tmdb_id', 'is', null);
  const newTmdbIds = new Set(newMovies?.map(m => m.tmdb_id) || []);

  // Check if old movies exist in new set (by extracting tmdb id from the id string)
  let inCurated = 0;
  let notInCurated = [];

  for (const old of (oldMovies || [])) {
    // Extract numeric ID from "tmdb-123456"
    const match = old.id.match(/tmdb-(\d+)/);
    if (match) {
      const numericId = parseInt(match[1], 10);
      if (newTmdbIds.has(numericId)) {
        inCurated++;
      } else {
        notInCurated.push({ id: old.id, title: old.title });
      }
    }
  }

  console.log('Old movies that ARE in curated list (duplicates):', inCurated);
  console.log('Old movies NOT in curated list:', notInCurated.length);

  if (notInCurated.length > 0 && notInCurated.length <= 20) {
    console.log('\nNot in curated:');
    notInCurated.forEach(m => console.log(' ', m.id, '-', m.title));
  }
}

main();
