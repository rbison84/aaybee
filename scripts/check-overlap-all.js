require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  // Find the real user
  const { data: realUsers } = await supabase
    .from('user_profiles')
    .select('id, display_name, total_comparisons')
    .or('is_seed.is.null,is_seed.eq.false')
    .order('total_comparisons', { ascending: false })
    .limit(1);

  const userId = realUsers[0].id;
  console.log('User: ' + realUsers[0].total_comparisons + ' comparisons');

  // Get user's top-25
  const { data: userMovies } = await supabase
    .from('user_movies')
    .select('movie_id, beta')
    .eq('user_id', userId)
    .eq('status', 'known')
    .order('beta', { ascending: false })
    .limit(25);

  const userTop25Set = new Set((userMovies || []).map(m => m.movie_id));
  const userBetaMap = new Map((userMovies || []).map(m => [m.movie_id, m.beta]));
  console.log('User top-25 movies: ' + userTop25Set.size);

  // Get ALL seed users
  const { data: seedUsers } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('is_seed', true);

  console.log('Seed users: ' + (seedUsers || []).length);

  // For each seed user, fetch top-25 and compute overlap + correlation
  let overlapDist = {};
  let correlationResults = [];
  let processedCount = 0;

  for (const seed of (seedUsers || [])) {
    const { data: seedMovies } = await supabase
      .from('user_movies')
      .select('movie_id, beta')
      .eq('user_id', seed.id)
      .eq('status', 'known')
      .order('beta', { ascending: false })
      .limit(25);

    const seedTop25Set = new Set((seedMovies || []).map(m => m.movie_id));
    const seedBetaMap = new Map((seedMovies || []).map(m => [m.movie_id, m.beta]));

    // Count overlap
    let overlap = 0;
    const overlapMovies = [];
    for (const id of userTop25Set) {
      if (seedTop25Set.has(id)) {
        overlap++;
        overlapMovies.push(id);
      }
    }

    overlapDist[overlap] = (overlapDist[overlap] || 0) + 1;

    // Compute correlation if enough overlap
    if (overlap >= 8) {
      const pairs = [];
      for (const movieId of overlapMovies) {
        pairs.push({ a: userBetaMap.get(movieId), b: seedBetaMap.get(movieId) });
      }

      const meanA = pairs.reduce((s, p) => s + p.a, 0) / pairs.length;
      const meanB = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
      let num = 0, denA = 0, denB = 0;
      for (const p of pairs) {
        num += (p.a - meanA) * (p.b - meanB);
        denA += (p.a - meanA) ** 2;
        denB += (p.b - meanB) ** 2;
      }
      let rSquared = 0;
      if (denA > 0 && denB > 0) {
        const r = num / Math.sqrt(denA * denB);
        rSquared = r * r;
      }
      correlationResults.push({ seedId: seed.id, overlap, rSquared });
    }

    processedCount++;
    if (processedCount % 200 === 0) console.log('  Processed ' + processedCount + '...');
  }

  console.log('\n=== OVERLAP DISTRIBUTION (top-25 vs top-25) ===');
  const sortedKeys = Object.keys(overlapDist).map(Number).sort((a, b) => a - b);
  for (const k of sortedKeys) {
    console.log('  ' + k + ' overlapping movies: ' + overlapDist[k] + ' users');
  }

  console.log('\n=== USERS WITH 8+ OVERLAP: ' + correlationResults.length + ' ===');

  if (correlationResults.length > 0) {
    correlationResults.sort((a, b) => b.rSquared - a.rSquared);
    console.log('\nR² distribution:');
    console.log('  >= 0.25: ' + correlationResults.filter(r => r.rSquared >= 0.25).length);
    console.log('  >= 0.10: ' + correlationResults.filter(r => r.rSquared >= 0.10).length);
    console.log('  >= 0.05: ' + correlationResults.filter(r => r.rSquared >= 0.05).length);
    console.log('  < 0.05: ' + correlationResults.filter(r => r.rSquared < 0.05).length);

    console.log('\nTop 10 by R²:');
    for (const r of correlationResults.slice(0, 10)) {
      console.log('  R²=' + r.rSquared.toFixed(4) + ', overlap=' + r.overlap);
    }
  }
}

check().catch(console.error);
