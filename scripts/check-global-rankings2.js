require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  // 1. Check tier 5 movies in global_movie_stats - do they have ANY user_movies rows?
  const { data: t5stats } = await supabase
    .from('global_movie_stats')
    .select('movie_id, global_beta, unique_users_count, total_global_comparisons')
    .order('global_beta', { ascending: false })
    .limit(200);

  // Get their tiers
  const ids = (t5stats || []).map(s => s.movie_id);
  const { data: movieTiers } = await supabase
    .from('movies')
    .select('id, title, tier')
    .in('id', ids.slice(0, 200));
  const tierMap = new Map((movieTiers || []).map(m => [m.id, m]));

  // Find tier 5 entries
  const tier5entries = (t5stats || []).filter(s => {
    const m = tierMap.get(s.movie_id);
    return m && m.tier === 5;
  });

  console.log('=== TIER 5 MOVIES IN GLOBAL STATS: ' + tier5entries.length + ' ===');

  // For a few tier 5 entries, check user_movies (including total_comparisons = 0)
  for (const entry of tier5entries.slice(0, 5)) {
    const m = tierMap.get(entry.movie_id);
    console.log('\n' + m.title + ' (' + entry.movie_id + ')');
    console.log('  global_beta=' + entry.global_beta.toFixed(3) + ', users=' + entry.unique_users_count + ', comps=' + entry.total_global_comparisons);

    // Check ALL user_movies rows (not just comparisons > 0)
    const { data: allUm, count } = await supabase
      .from('user_movies')
      .select('user_id, beta, total_comparisons, status', { count: 'exact' })
      .eq('movie_id', entry.movie_id)
      .limit(5);

    console.log('  user_movies rows: ' + (count || 0));
    if (allUm) {
      for (const um of allUm) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('display_name, is_seed')
          .eq('id', um.user_id)
          .single();
        console.log('    user=' + (profile ? profile.display_name : um.user_id.slice(0,8)) + ', is_seed=' + (profile ? profile.is_seed : '?') + ', beta=' + um.beta.toFixed(3) + ', comps=' + um.total_comparisons + ', status=' + um.status);
      }
    }
  }

  // 2. Check: are there user_movies rows for non tier 1-2 movies from seed users?
  console.log('\n=== SEED USERS WITH TIER 5 MOVIES ===');
  const { data: seedUsers } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('is_seed', true)
    .limit(10);

  if (seedUsers && seedUsers.length > 0) {
    const sampleSeed = seedUsers[0];
    const { data: seedMovies, count: seedMovieCount } = await supabase
      .from('user_movies')
      .select('movie_id', { count: 'exact' })
      .eq('user_id', sampleSeed.id);

    console.log('Sample seed user ' + sampleSeed.id.slice(0, 8) + ' has ' + seedMovieCount + ' movie rows');

    if (seedMovies) {
      const seedMovieIds = seedMovies.map(m => m.movie_id);
      const { data: seedMovieTiers } = await supabase
        .from('movies')
        .select('id, tier')
        .in('id', seedMovieIds.slice(0, 200));

      const seedTierCounts = {};
      (seedMovieTiers || []).forEach(m => {
        seedTierCounts[m.tier] = (seedTierCounts[m.tier] || 0) + 1;
      });
      console.log('Tier distribution of their movies:', seedTierCounts);
    }
  }

  // 3. How did recalculateAllGlobalStats get triggered? Check if there are non-seed users
  const { count: totalUsers } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true });
  const { count: seedCount } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_seed', true);

  console.log('\n=== USER COUNTS ===');
  console.log('Total users: ' + totalUsers);
  console.log('Seed users: ' + seedCount);
  console.log('Real users: ' + (totalUsers - seedCount));
}

check().catch(console.error);
