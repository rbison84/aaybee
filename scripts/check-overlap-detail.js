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
  console.log('User: ' + (realUsers[0].display_name || userId.slice(0, 8)) + ' (' + realUsers[0].total_comparisons + ' comparisons)');

  // Get ALL of this user's ranked movies (not just top-25)
  const { data: userMovies } = await supabase
    .from('user_movies')
    .select('movie_id, beta, total_comparisons, status')
    .eq('user_id', userId)
    .eq('status', 'known')
    .gt('total_comparisons', 0)
    .order('beta', { ascending: false });

  console.log('\nTotal ranked movies: ' + (userMovies || []).length);

  // Get tiers for user's movies
  const userMovieIds = (userMovies || []).map(m => m.movie_id);
  const { data: userMovieTiers } = await supabase
    .from('movies')
    .select('id, title, tier')
    .in('id', userMovieIds);
  const tierMap = new Map((userMovieTiers || []).map(m => [m.id, m]));

  // Show tier distribution of user's ranked movies
  const userTierCounts = {};
  for (const m of (userMovies || [])) {
    const movie = tierMap.get(m.movie_id);
    const tier = movie ? movie.tier : '?';
    userTierCounts[tier] = (userTierCounts[tier] || 0) + 1;
  }
  console.log('Tier distribution of ranked movies:', userTierCounts);

  // Show user's top-25 with tiers
  console.log('\nUser top-25:');
  for (const m of (userMovies || []).slice(0, 25)) {
    const movie = tierMap.get(m.movie_id);
    console.log('  ' + (movie ? movie.title : m.movie_id) + ' (tier=' + (movie ? movie.tier : '?') + ', beta=' + m.beta.toFixed(3) + ')');
  }

  // Now check a seed user's top-25
  const { data: seedUsers } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('is_seed', true)
    .limit(1);

  if (seedUsers && seedUsers.length > 0) {
    const seedId = seedUsers[0].id;
    const { data: seedMovies } = await supabase
      .from('user_movies')
      .select('movie_id, beta')
      .eq('user_id', seedId)
      .eq('status', 'known')
      .order('beta', { ascending: false })
      .limit(25);

    const seedMovieIds = (seedMovies || []).map(m => m.movie_id);
    const { data: seedMovieTiers } = await supabase
      .from('movies')
      .select('id, title, tier')
      .in('id', seedMovieIds);
    const seedTierMap = new Map((seedMovieTiers || []).map(m => [m.id, m]));

    console.log('\nSample seed user top-25:');
    for (const m of (seedMovies || []).slice(0, 25)) {
      const movie = seedTierMap.get(m.movie_id);
      const inUserTop25 = userMovieIds.slice(0, 25).includes(m.movie_id);
      console.log('  ' + (movie ? movie.title : m.movie_id) + ' (tier=' + (movie ? movie.tier : '?') + ', beta=' + m.beta.toFixed(3) + ')' + (inUserTop25 ? ' ** OVERLAP **' : ''));
    }

    // Check: how many of the user's top-25 movies exist in this seed user's FULL movie list?
    const { data: seedAllMovies } = await supabase
      .from('user_movies')
      .select('movie_id')
      .eq('user_id', seedId)
      .eq('status', 'known');
    const seedAllSet = new Set((seedAllMovies || []).map(m => m.movie_id));

    let inSeedData = 0;
    for (const m of (userMovies || []).slice(0, 25)) {
      if (seedAllSet.has(m.movie_id)) inSeedData++;
    }
    console.log('\nOf user top-25: ' + inSeedData + ' exist in this seed user\'s full movie list (' + seedAllSet.size + ' movies)');
  }
}

check().catch(console.error);
