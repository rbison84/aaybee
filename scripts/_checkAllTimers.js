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
  'tmdb-278','tmdb-238','tmdb-240','tmdb-155','tmdb-550','tmdb-680','tmdb-13','tmdb-603',
  'tmdb-120','tmdb-122','tmdb-27205','tmdb-157336','tmdb-11','tmdb-1891','tmdb-329',
  'tmdb-597','tmdb-274','tmdb-807','tmdb-78','tmdb-105','tmdb-389','tmdb-429',
  'tmdb-496243','tmdb-299536',
];

async function main() {
  const { data } = await client.from('movies').select('id, title, tier').in('id', ids);
  data.sort((a, b) => a.tier - b.tier);
  console.log('=== ALL_TIMER_MOVIE_IDS tiers ===');
  data.forEach(m => console.log(`  tier ${m.tier} | ${m.title}`));

  const t1 = data.filter(m => m.tier === 1).length;
  const t2 = data.filter(m => m.tier >= 2).length;
  console.log(`\nTier 1: ${t1}, Tier 2+: ${t2}`);
}
main();
