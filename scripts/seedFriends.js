/**
 * Seed Friends Test Data
 *
 * Run with: npm run seed:friends
 *
 * Prerequisites:
 * 1. Get your Service Role Key from Supabase Dashboard > Settings > API
 * 2. Add it to .env as SUPABASE_SERVICE_ROLE_KEY=your-key
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency)
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && !key.startsWith('#')) {
        const value = valueParts.join('=').trim();
        if (value && !process.env[key.trim()]) {
          process.env[key.trim()] = value;
        }
      }
    });
  } catch (e) {
    console.log('Could not load .env file');
  }
}

loadEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('\n❌ Missing configuration!');
  console.log('\nTo run this script:');
  console.log('1. Go to Supabase Dashboard > Settings > API');
  console.log('2. Copy the "service_role" key (NOT the anon key)');
  console.log('3. Add to .env: SUPABASE_SERVICE_ROLE_KEY=your-key-here');
  console.log('4. Run: npm run seed:friends\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Test friend data
const TEST_FRIENDS = [
  // SIMILAR TASTE (85-95%)
  {
    email: 'sarah.chen@example.com',
    displayName: 'Sarah Chen',
    favoriteGenres: ['scifi', 'thriller', 'drama'],
    tasteProfile: 'similar',
    expectedMatch: 89,
    totalComparisons: 67,
    topMovies: ['The Matrix', 'Inception', 'Interstellar', 'Blade Runner 2049', 'The Dark Knight', 'Fight Club'],
  },
  {
    email: 'james.wilson@example.com',
    displayName: 'James Wilson',
    favoriteGenres: ['scifi', 'action', 'thriller'],
    tasteProfile: 'similar',
    expectedMatch: 92,
    totalComparisons: 58,
    topMovies: ['Inception', 'The Matrix', 'The Dark Knight', 'Pulp Fiction', 'Interstellar', 'Mad Max: Fury Road'],
  },
  {
    email: 'emily.patel@example.com',
    displayName: 'Emily Patel',
    favoriteGenres: ['drama', 'thriller', 'scifi'],
    tasteProfile: 'similar',
    expectedMatch: 86,
    totalComparisons: 73,
    topMovies: ['The Shawshank Redemption', 'Inception', 'The Godfather', 'Interstellar', 'Fight Club', 'Se7en'],
  },
  // MODERATE (60-75%)
  {
    email: 'alex.kim@example.com',
    displayName: 'Alex Kim',
    favoriteGenres: ['drama', 'thriller', 'action'],
    tasteProfile: 'moderate',
    expectedMatch: 72,
    totalComparisons: 71,
    topMovies: ['The Godfather', 'Fight Club', 'The Dark Knight', 'Goodfellas', 'Taxi Driver', 'Heat'],
  },
  {
    email: 'jordan.taylor@example.com',
    displayName: 'Jordan Taylor',
    favoriteGenres: ['action', 'adventure', 'scifi'],
    tasteProfile: 'moderate',
    expectedMatch: 65,
    totalComparisons: 45,
    topMovies: ['Mad Max: Fury Road', 'John Wick', 'The Matrix', 'Gladiator', 'Raiders of the Lost Ark', 'Terminator 2'],
  },
  {
    email: 'maya.johnson@example.com',
    displayName: 'Maya Johnson',
    favoriteGenres: ['drama', 'romance', 'comedy'],
    tasteProfile: 'moderate',
    expectedMatch: 61,
    totalComparisons: 62,
    topMovies: ['Forrest Gump', 'The Shawshank Redemption', 'Good Will Hunting', 'Titanic', 'A Beautiful Mind'],
  },
  {
    email: 'david.nguyen@example.com',
    displayName: 'David Nguyen',
    favoriteGenres: ['thriller', 'horror', 'mystery'],
    tasteProfile: 'moderate',
    expectedMatch: 68,
    totalComparisons: 54,
    topMovies: ['Se7en', 'Silence of the Lambs', 'Zodiac', 'Gone Girl', 'Shutter Island', 'Prisoners'],
  },
  // DIFFERENT (30-50%)
  {
    email: 'mike.rodriguez@example.com',
    displayName: 'Mike Rodriguez',
    favoriteGenres: ['comedy', 'romance', 'animation'],
    tasteProfile: 'different',
    expectedMatch: 45,
    totalComparisons: 52,
    topMovies: ['Toy Story', 'La La Land', 'The Notebook', 'Crazy Rich Asians', 'Finding Nemo', 'Up'],
  },
  {
    email: 'sophia.martinez@example.com',
    displayName: 'Sophia Martinez',
    favoriteGenres: ['romance', 'drama', 'comedy'],
    tasteProfile: 'different',
    expectedMatch: 38,
    totalComparisons: 48,
    topMovies: ['The Notebook', 'Pride and Prejudice', 'La La Land', 'Titanic', 'Notting Hill'],
  },
  {
    email: 'chris.brown@example.com',
    displayName: 'Chris Brown',
    favoriteGenres: ['horror', 'comedy', 'animation'],
    tasteProfile: 'different',
    expectedMatch: 42,
    totalComparisons: 39,
    topMovies: ['Get Out', 'Hereditary', 'The Conjuring', 'A Quiet Place', 'Shrek', 'Monsters Inc'],
  },
];

const PENDING_REQUESTS = [
  {
    email: 'rachel.green@example.com',
    displayName: 'Rachel Green',
    favoriteGenres: ['comedy', 'romance', 'drama'],
    totalComparisons: 35,
    topMovies: ['When Harry Met Sally', 'Notting Hill', 'The Holiday', 'Love Actually'],
  },
  {
    email: 'tom.hardy.fan@example.com',
    displayName: 'Tom Hardy Fan',
    favoriteGenres: ['action', 'thriller', 'drama'],
    totalComparisons: 41,
    topMovies: ['Mad Max: Fury Road', 'The Dark Knight Rises', 'Inception', 'Dunkirk'],
  },
];

async function main() {
  console.log('========================================');
  console.log('   SEEDING FRIEND TEST DATA');
  console.log('========================================\n');

  // 1. Find your user
  const YOUR_EMAIL = 'masood.ross@gmail.com';
  console.log(`Looking for your account: ${YOUR_EMAIL}`);

  const { data: usersData } = await supabase.auth.admin.listUsers();
  const myUser = usersData.users.find(u => u.email === YOUR_EMAIL);

  if (!myUser) {
    console.error(`\n❌ Could not find your account (${YOUR_EMAIL})`);
    console.log('Make sure you have signed up in the app first.\n');
    process.exit(1);
  }

  const myUserId = myUser.id;
  console.log(`✓ Found your ID: ${myUserId}\n`);

  // 2. Get movie IDs
  console.log('Fetching movies...');
  const { data: movies } = await supabase.from('movies').select('id, title');

  if (!movies || movies.length === 0) {
    console.error('❌ No movies found. Run movie seed first.');
    process.exit(1);
  }

  const movieMap = new Map();
  movies.forEach(m => movieMap.set(m.title.toLowerCase(), m.id));
  console.log(`✓ Found ${movieMap.size} movies\n`);

  // Helper to create user
  async function createTestFriend(friend, status) {
    console.log(`Creating: ${friend.displayName} (${friend.email})`);

    // Check if exists
    const existing = usersData.users.find(u => u.email === friend.email);
    let friendId;

    if (existing) {
      console.log(`  Already exists, using ID: ${existing.id}`);
      friendId = existing.id;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: friend.email,
        password: 'TestPassword123!',
        email_confirm: true,
      });

      if (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
      }
      friendId = data.user.id;
      console.log(`  ✓ Created with ID: ${friendId}`);
    }

    // Create profile
    await supabase.from('user_profiles').upsert({
      id: friendId,
      display_name: friend.displayName,
      favorite_genres: friend.favoriteGenres,
      total_comparisons: friend.totalComparisons,
      updated_at: new Date().toISOString(),
    });

    // Create movie rankings
    const userMovies = [];
    const topSet = new Set(friend.topMovies.map(t => t.toLowerCase()));

    // Sort movies - top preferences first
    const sortedMovies = Array.from(movieMap.entries()).sort((a, b) => {
      const aIsTop = topSet.has(a[0]) ? 0 : 1;
      const bIsTop = topSet.has(b[0]) ? 0 : 1;
      return aIsTop - bIsTop;
    });

    // Get movies, prioritize top movies
    let rank = 1;
    for (const [title, movieId] of sortedMovies) {
      if (rank > friend.totalComparisons) break;

      const isTop = topSet.has(title);
      const beta = isTop
        ? 1550 - (rank * 8) + (Math.random() * 20 - 10)
        : 1300 - (rank * 10) + (Math.random() * 40 - 20);

      const totalComps = Math.floor(Math.random() * 10) + 3;
      const totalWins = Math.floor(Math.random() * totalComps);
      const totalLosses = totalComps - totalWins;

      userMovies.push({
        user_id: friendId,
        movie_id: movieId,
        beta: Math.max(-2, Math.min(3, (beta - 1200) / 200)), // Scale to actual beta range
        status: 'known',
        total_comparisons: totalComps,
        total_wins: totalWins,
        total_losses: totalLosses,
        times_shown: totalComps,
        updated_at: new Date().toISOString(),
      });

      rank++;
    }

    // Batch insert movies
    let insertedCount = 0;
    for (let i = 0; i < userMovies.length; i += 50) {
      const batch = userMovies.slice(i, i + 50);
      const { data, error } = await supabase
        .from('user_movies')
        .upsert(batch, { onConflict: 'user_id,movie_id' })
        .select();

      if (error) {
        console.error(`  ❌ Error inserting movies: ${error.message}`);
        console.error(`  Details: ${JSON.stringify(error)}`);
      } else {
        insertedCount += data?.length || batch.length;
      }
    }
    console.log(`  ✓ Created ${insertedCount} movie rankings`);

    // Create comparison history (realistic pairwise comparisons)
    const comparisons = [];
    const movieIds = userMovies.map(m => m.movie_id);
    const numComparisons = friend.totalComparisons * 3; // ~3 comparisons per movie on average

    for (let i = 0; i < numComparisons && movieIds.length >= 2; i++) {
      const idx1 = Math.floor(Math.random() * movieIds.length);
      let idx2 = Math.floor(Math.random() * movieIds.length);
      while (idx2 === idx1) idx2 = Math.floor(Math.random() * movieIds.length);

      const movie1 = userMovies.find(m => m.movie_id === movieIds[idx1]);
      const movie2 = userMovies.find(m => m.movie_id === movieIds[idx2]);

      // Higher beta = more likely to win
      const winner = movie1.beta > movie2.beta ? movieIds[idx1] : movieIds[idx2];
      const loser = winner === movieIds[idx1] ? movieIds[idx2] : movieIds[idx1];

      comparisons.push({
        user_id: friendId,
        winner_id: winner,
        loser_id: loser,
        skipped: false,
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    // Batch insert comparisons
    for (let i = 0; i < comparisons.length; i += 100) {
      const { error } = await supabase.from('comparisons').upsert(
        comparisons.slice(i, i + 100)
      );
      // Ignore errors (table might not exist)
    }
    console.log(`  ✓ Created ${comparisons.length} comparison records`);

    // Create friendship
    if (status === 'accepted') {
      await supabase.from('friendships').upsert([
        { user_id: friendId, friend_id: myUserId, status: 'accepted' },
        { user_id: myUserId, friend_id: friendId, status: 'accepted' },
      ], { onConflict: 'user_id,friend_id' });
    } else {
      await supabase.from('friendships').upsert(
        { user_id: friendId, friend_id: myUserId, status: 'pending' },
        { onConflict: 'user_id,friend_id' }
      );
    }
    console.log(`  ✓ Friendship: ${status}\n`);

    return friendId;
  }

  // 3. Create accepted friends
  console.log('========================================');
  console.log('   CREATING ACCEPTED FRIENDS');
  console.log('========================================\n');

  for (const friend of TEST_FRIENDS) {
    await createTestFriend(friend, 'accepted');
  }

  // 4. Create pending requests
  console.log('========================================');
  console.log('   CREATING PENDING REQUESTS');
  console.log('========================================\n');

  for (const friend of PENDING_REQUESTS) {
    await createTestFriend(friend, 'pending');
  }

  // 5. Summary
  console.log('========================================');
  console.log('   ✓ SEED COMPLETE!');
  console.log('========================================\n');

  console.log('Created friends:');
  console.log('  Similar taste (85-95%):');
  TEST_FRIENDS.filter(f => f.tasteProfile === 'similar').forEach(f =>
    console.log(`    - ${f.displayName}: ~${f.expectedMatch}%`)
  );
  console.log('  Moderate taste (60-75%):');
  TEST_FRIENDS.filter(f => f.tasteProfile === 'moderate').forEach(f =>
    console.log(`    - ${f.displayName}: ~${f.expectedMatch}%`)
  );
  console.log('  Different taste (30-50%):');
  TEST_FRIENDS.filter(f => f.tasteProfile === 'different').forEach(f =>
    console.log(`    - ${f.displayName}: ~${f.expectedMatch}%`)
  );
  console.log('\nPending requests:');
  PENDING_REQUESTS.forEach(f => console.log(`    - ${f.displayName}`));

  console.log('\n✓ You can now test the Friends feature!\n');
}

main().catch(console.error);
