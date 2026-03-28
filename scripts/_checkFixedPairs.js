const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ids = [
  'tmdb-11', 'tmdb-597',    // Star Wars vs Titanic
  'tmdb-862', 'tmdb-155',   // Toy Story vs Dark Knight
  'tmdb-8587', 'tmdb-313369', // Lion King vs La La Land
  'tmdb-120', 'tmdb-13',    // LOTR vs Forrest Gump
  'tmdb-278', 'tmdb-680',   // Shawshank vs Pulp Fiction
];

async function main() {
  const { data } = await client.from('movies').select('id, title, tier, original_language').in('id', ids);
  const byId = new Map(data.map(m => [m.id, m]));

  console.log('=== Fixed Onboarding Pairs ===');
  for (let i = 0; i < ids.length; i += 2) {
    const a = byId.get(ids[i]);
    const b = byId.get(ids[i+1]);
    console.log(`Pair ${i/2+1}: ${a?.title} (tier ${a?.tier}) vs ${b?.title} (tier ${b?.tier})`);
  }
}
main();
