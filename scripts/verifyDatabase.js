const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // Get tier counts
  let allMovies = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('tier, year, title, vote_average, vote_count')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allMovies.push(...data);
    from += pageSize;
    if (data.length < pageSize) break;
  }

  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const decadeCounts = {};

  allMovies.forEach(m => {
    tierCounts[m.tier]++;
    const decade = Math.floor(m.year / 10) * 10 + 's';
    decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
  });

  console.log('=== FINAL VERIFICATION ===\n');
  console.log('Total movies: ' + allMovies.length);
  console.log('\nBy Tier:');
  console.log('  Tier 1: ' + tierCounts[1]);
  console.log('  Tier 2: ' + tierCounts[2]);
  console.log('  Tier 3: ' + tierCounts[3]);
  console.log('  Tier 4: ' + tierCounts[4]);

  console.log('\nBy Decade:');
  Object.keys(decadeCounts).sort().forEach(d => {
    console.log('  ' + d + ': ' + decadeCounts[d]);
  });

  // Check Five Feet Apart
  const ffa = allMovies.find(m => m.title === 'Five Feet Apart');
  if (ffa) {
    console.log('\nFive Feet Apart: Tier ' + ffa.tier + ' (rating: ' + ffa.vote_average + ', votes: ' + ffa.vote_count + ')');
  } else {
    console.log('\nFive Feet Apart: Not in database');
  }
}
main().catch(console.error);
