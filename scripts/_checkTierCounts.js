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
  // Count by tier and language
  const { data } = await client.from('movies').select('tier, original_language').lte('tier', 4);

  const counts = {};
  for (const m of data) {
    const key = `tier${m.tier}_${m.original_language === 'en' ? 'en' : 'non-en'}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  console.log('=== Tier × Language counts ===');
  for (let t = 1; t <= 4; t++) {
    console.log(`Tier ${t}: ${counts[`tier${t}_en`] || 0} English, ${counts[`tier${t}_non-en`] || 0} non-English`);
  }

  // Check Wolfwalkers tier
  const { data: ww } = await client.from('movies').select('id, title, tier, original_language, vote_count, vote_average')
    .ilike('title', '%wolfwalkers%');
  console.log('\n=== Wolfwalkers ===');
  ww.forEach(m => console.log(m));
}
main();
