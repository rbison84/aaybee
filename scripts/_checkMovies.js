const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check Wolf Children and Wolfwalkers
  const { data } = await client
    .from('movies')
    .select('id, title, original_language, tier, certification, vote_count')
    .or('title.ilike.%wolf children%,title.ilike.%wolfwalkers%');

  console.log('=== Problem movies ===');
  data.forEach(m => console.log(m.id, m.title, '| lang:', m.original_language, '| tier:', m.tier, '| votes:', m.vote_count));

  // Count non-English movies in tiers 1-4
  const { data: foreign } = await client
    .from('movies')
    .select('id, title, original_language, tier')
    .lte('tier', 4)
    .neq('original_language', 'en');

  console.log('\n=== Non-English movies in tiers 1-4 ===');
  console.log('Total:', foreign.length);
  const byLang = {};
  foreign.forEach(m => { byLang[m.original_language || 'NULL'] = (byLang[m.original_language || 'NULL'] || 0) + 1; });
  Object.entries(byLang).sort((a,b) => b[1]-a[1]).forEach(([l,c]) => console.log(' ', l, ':', c));

  // Check how many movies have NULL original_language in tiers 1-4
  const { data: nullLang } = await client
    .from('movies')
    .select('id, title, tier')
    .lte('tier', 4)
    .is('original_language', null);

  console.log('\n=== Movies with NULL language in tiers 1-4 ===');
  console.log('Total:', nullLang.length);
  if (nullLang.length <= 10) nullLang.forEach(m => console.log(' ', m.id, m.title, '| tier:', m.tier));
}
main();
