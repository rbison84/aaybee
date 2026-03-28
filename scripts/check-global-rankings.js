require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function check() {
  // 1. Top 10 global rankings (no filter)
  const { data: top } = await supabase
    .from('global_movie_stats')
    .select('movie_id, global_beta, unique_users_count, total_global_comparisons')
    .order('global_beta', { ascending: false })
    .limit(15);

  if (top && top.length > 0) {
    const ids = top.map(t => t.movie_id);
    const { data: movies } = await supabase
      .from('movies')
      .select('id, title, tier')
      .in('id', ids);
    const movieMap = new Map((movies || []).map(m => [m.id, m]));

    console.log('=== TOP 15 GLOBAL RANKINGS (no filter) ===');
    top.forEach((t, i) => {
      const m = movieMap.get(t.movie_id);
      const title = m ? m.title : t.movie_id;
      const tier = m ? m.tier : '?';
      console.log('  ' + (i + 1) + '. ' + title + ' (tier=' + tier + ', beta=' + t.global_beta.toFixed(3) + ', users=' + t.unique_users_count + ', comps=' + t.total_global_comparisons + ')');
    });
  }

  // 2. Tier distribution in global_movie_stats
  const { data: allStats } = await supabase
    .from('global_movie_stats')
    .select('movie_id');

  if (allStats) {
    // Fetch in batches since there could be many
    const allIds = allStats.map(s => s.movie_id);
    const tierCounts = {};
    const batchSize = 200;

    for (let i = 0; i < allIds.length; i += batchSize) {
      const batch = allIds.slice(i, i + batchSize);
      const { data: batchMovies } = await supabase
        .from('movies')
        .select('id, tier')
        .in('id', batch);

      (batchMovies || []).forEach(m => {
        tierCounts[m.tier] = (tierCounts[m.tier] || 0) + 1;
      });
    }

    console.log('\n=== TIER DISTRIBUTION IN global_movie_stats ===');
    Object.keys(tierCounts).sort().forEach(t => {
      console.log('  Tier ' + t + ': ' + tierCounts[t] + ' movies');
    });
    console.log('  Total: ' + allStats.length);
  }

  // 3. Check who has a tier 5 movie in user_movies (pick first tier 5 from global stats)
  if (allStats) {
    const allIds = allStats.map(s => s.movie_id);
    const { data: t5movies } = await supabase
      .from('movies')
      .select('id, title, tier')
      .in('id', allIds.slice(0, 500))
      .eq('tier', 5)
      .limit(3);

    if (t5movies && t5movies.length > 0) {
      console.log('\n=== TIER 5 MOVIES IN GLOBAL STATS (sample) ===');
      for (const m of t5movies) {
        console.log('\n  Movie: ' + m.title + ' (' + m.id + ')');
        const { data: userMovies } = await supabase
          .from('user_movies')
          .select('user_id, beta, total_comparisons')
          .eq('movie_id', m.id)
          .gt('total_comparisons', 0)
          .limit(5);

        if (userMovies) {
          for (const um of userMovies) {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('display_name, is_seed')
              .eq('id', um.user_id)
              .single();
            console.log('    user=' + (profile ? profile.display_name : um.user_id) + ', is_seed=' + (profile ? profile.is_seed : '?') + ', beta=' + um.beta.toFixed(3) + ', comps=' + um.total_comparisons);
          }
        }
      }
    }
  }
}

check().catch(console.error);
