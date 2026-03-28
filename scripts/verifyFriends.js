const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
try {
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      const value = valueParts.join('=').trim();
      if (value) process.env[key.trim()] = value;
    }
  });
} catch (e) {}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log('========================================');
  console.log('   VERIFYING FRIEND DATA');
  console.log('========================================\n');

  // 1. Check friendships
  const { data: friendships } = await supabase
    .from('friendships')
    .select('*');

  console.log(`Friendships: ${friendships?.length || 0} records`);

  // 2. Check user_profiles
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name, total_comparisons');

  console.log(`User profiles: ${profiles?.length || 0} records\n`);

  // 3. Check each friend's movies
  console.log('Friend movie rankings:');
  for (const profile of (profiles || [])) {
    const { count } = await supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('status', 'known');

    console.log(`  ${profile.display_name}: ${count || 0} movies`);
  }

  // 4. Check a sample friend's top movies
  const sampleFriend = profiles?.find(p => p.display_name === 'Sarah Chen');
  if (sampleFriend) {
    console.log('\nSarah Chen\'s top 5 movies:');
    const { data: topMovies } = await supabase
      .from('user_movies')
      .select('movie_id, beta')
      .eq('user_id', sampleFriend.id)
      .eq('status', 'known')
      .order('beta', { ascending: false })
      .limit(5);

    if (topMovies && topMovies.length > 0) {
      const movieIds = topMovies.map(m => m.movie_id);
      const { data: movies } = await supabase
        .from('movies')
        .select('id, title')
        .in('id', movieIds);

      topMovies.forEach((m, i) => {
        const movie = movies?.find(mov => mov.id === m.movie_id);
        console.log(`  ${i + 1}. ${movie?.title || 'Unknown'} (beta: ${m.beta.toFixed(1)})`);
      });
    } else {
      console.log('  No movies found!');
    }
  }

  console.log('\n========================================');
  console.log('   VERIFICATION COMPLETE');
  console.log('========================================\n');
}

main().catch(console.error);
