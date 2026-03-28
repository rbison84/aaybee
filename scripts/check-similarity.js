require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  // Find the real (non-seed) user with the most comparisons
  const { data: realUsers } = await supabase
    .from('user_profiles')
    .select('id, display_name, total_comparisons')
    .or('is_seed.is.null,is_seed.eq.false')
    .order('total_comparisons', { ascending: false })
    .limit(5);

  console.log('=== REAL USERS ===');
  for (const u of realUsers || []) {
    console.log('  ' + (u.display_name || u.id.slice(0, 8)) + ': ' + u.total_comparisons + ' comparisons');
  }

  if (!realUsers || realUsers.length === 0) return;
  const userId = realUsers[0].id;
  console.log('\nUsing: ' + (realUsers[0].display_name || userId.slice(0, 8)));

  // Get this user's top-25 movies
  const { data: userMovies } = await supabase
    .from('user_movies')
    .select('movie_id, beta, total_comparisons')
    .eq('user_id', userId)
    .eq('status', 'known')
    .order('beta', { ascending: false })
    .limit(25);

  console.log('\nUser top-25 movies: ' + (userMovies || []).length);
  const userTop25 = new Set((userMovies || []).map(m => m.movie_id));

  // Get movie titles for display
  const { data: movieDetails } = await supabase
    .from('movies')
    .select('id, title')
    .in('id', Array.from(userTop25));
  const titleMap = new Map((movieDetails || []).map(m => [m.id, m.title]));

  console.log('User top-10:');
  for (const m of (userMovies || []).slice(0, 10)) {
    console.log('  ' + (titleMap.get(m.movie_id) || m.movie_id) + ' (beta=' + m.beta.toFixed(3) + ', comps=' + m.total_comparisons + ')');
  }

  // Sample some seed users and check overlap
  const { data: seedUsers } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('is_seed', true)
    .limit(50);

  let overlapCounts = [];
  let rSquaredValues = [];

  for (const seed of (seedUsers || [])) {
    const { data: seedMovies } = await supabase
      .from('user_movies')
      .select('movie_id, beta')
      .eq('user_id', seed.id)
      .eq('status', 'known')
      .order('beta', { ascending: false })
      .limit(25);

    const seedTop25 = new Set((seedMovies || []).map(m => m.movie_id));

    // Count overlap
    let overlap = 0;
    for (const id of userTop25) {
      if (seedTop25.has(id)) overlap++;
    }
    overlapCounts.push(overlap);

    // If enough overlap, compute correlation
    if (overlap >= 8) {
      const seedMap = new Map((seedMovies || []).map(m => [m.movie_id, m.beta]));
      const pairs = [];
      for (const um of (userMovies || [])) {
        const seedBeta = seedMap.get(um.movie_id);
        if (seedBeta !== undefined) {
          pairs.push({ a: um.beta, b: seedBeta });
        }
      }

      if (pairs.length >= 8) {
        const meanA = pairs.reduce((s, p) => s + p.a, 0) / pairs.length;
        const meanB = pairs.reduce((s, p) => s + p.b, 0) / pairs.length;
        let num = 0, denA = 0, denB = 0;
        for (const p of pairs) {
          num += (p.a - meanA) * (p.b - meanB);
          denA += (p.a - meanA) ** 2;
          denB += (p.b - meanB) ** 2;
        }
        if (denA > 0 && denB > 0) {
          const r = num / Math.sqrt(denA * denB);
          rSquaredValues.push(r * r);
        }
      }
    }
  }

  overlapCounts.sort((a, b) => a - b);
  console.log('\n=== OVERLAP WITH 50 SAMPLE SEED USERS (top-25 vs top-25) ===');
  console.log('  Min: ' + overlapCounts[0]);
  console.log('  Median: ' + overlapCounts[Math.floor(overlapCounts.length / 2)]);
  console.log('  Max: ' + overlapCounts[overlapCounts.length - 1]);
  console.log('  With 8+ overlap: ' + overlapCounts.filter(c => c >= 8).length + '/50');

  if (rSquaredValues.length > 0) {
    rSquaredValues.sort((a, b) => a - b);
    console.log('\n=== R² VALUES (where overlap >= 8) ===');
    console.log('  Count: ' + rSquaredValues.length);
    console.log('  Min: ' + rSquaredValues[0].toFixed(4));
    console.log('  Median: ' + rSquaredValues[Math.floor(rSquaredValues.length / 2)].toFixed(4));
    console.log('  Max: ' + rSquaredValues[rSquaredValues.length - 1].toFixed(4));
    console.log('  With R² >= 0.25: ' + rSquaredValues.filter(r => r >= 0.25).length);
    console.log('  With R² >= 0.10: ' + rSquaredValues.filter(r => r >= 0.10).length);
  }

  // Check: how many tier 1-2 movies does the user NOT have in user_movies?
  const { data: allUserMovies } = await supabase
    .from('user_movies')
    .select('movie_id')
    .eq('user_id', userId);
  const allUserMovieIds = new Set((allUserMovies || []).map(m => m.movie_id));

  const { data: tier12movies } = await supabase
    .from('movies')
    .select('id')
    .lte('tier', 2);
  const unseenTier12 = (tier12movies || []).filter(m => !allUserMovieIds.has(m.id));
  console.log('\n=== COVERAGE ===');
  console.log('  Total tier 1-2 movies: ' + (tier12movies || []).length);
  console.log('  User has interacted with: ' + (allUserMovieIds.size));
  console.log('  Unseen tier 1-2 movies: ' + unseenTier12.length);
}

check().catch(console.error);
