const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const famousIds = [
  'tmdb-496243', 'tmdb-129', 'tmdb-128', 'tmdb-8392', 'tmdb-194',
  'tmdb-637', 'tmdb-1417', 'tmdb-146', 'tmdb-77338', 'tmdb-11216',
  'tmdb-396535', 'tmdb-372058', 'tmdb-598',
];

async function main() {
  const { data } = await client.from('movies').select('id, title, tier, original_language').in('id', famousIds);
  console.log('=== FAMOUS_FOREIGN_FILM_IDS current tiers ===');
  data.sort((a, b) => a.tier - b.tier);
  data.forEach(m => console.log(`  tier ${m.tier} | ${m.original_language} | ${m.title}`));
}
main();
