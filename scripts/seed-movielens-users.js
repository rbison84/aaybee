/**
 * Seed MovieLens Users for Aaybee Cold-Start Recommendations
 *
 * Creates ~1000 seed users from the MovieLens 32M dataset with realistic
 * Bradley-Terry rankings derived from real taste data. These users provide
 * a diverse correlation pool for collaborative filtering recommendations.
 *
 * Prerequisites:
 *   1. Download MovieLens 32M: https://grouplens.org/datasets/movielens/
 *   2. Place links.csv and ratings.csv in data/movielens/ directory
 *   3. Run the is_seed migration first
 *
 * Usage:
 *   node scripts/seed-movielens-users.js
 *
 * Options:
 *   --dry-run    Preview what would be inserted without writing to Supabase
 *   --limit=N    Only process N users (default: 1000)
 *   --min-overlap=N  Minimum overlapping ratings required (default: 100)
 *   --comparisons=N  Number of synthetic comparisons per user (default: 300)
 *
 * Required environment variables:
 *   SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DELETE_EXISTING = args.includes('--delete-existing');
const USER_LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000', 10);
const MIN_OVERLAP = parseInt(args.find(a => a.startsWith('--min-overlap='))?.split('=')[1] || '30', 10);
const COMPARISONS_PER_USER = parseInt(args.find(a => a.startsWith('--comparisons='))?.split('=')[1] || '300', 10);
const MAX_TIER = parseInt(args.find(a => a.startsWith('--max-tier='))?.split('=')[1] || '2', 10);

const DATA_DIR = path.join(__dirname, '..', 'data', 'movielens');
const LINKS_CSV = path.join(DATA_DIR, 'links.csv');
const RATINGS_CSV = path.join(DATA_DIR, 'ratings.csv');

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
  console.error('Missing required environment variables:');
  console.error('  SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nUse --dry-run to preview without Supabase connection.');
  process.exit(1);
}

// Verify data files exist
if (!fs.existsSync(LINKS_CSV)) {
  console.error(`Missing file: ${LINKS_CSV}`);
  console.error('\nDownload MovieLens 32M from https://grouplens.org/datasets/movielens/');
  console.error('Place links.csv and ratings.csv in data/movielens/');
  process.exit(1);
}
if (!fs.existsSync(RATINGS_CSV)) {
  console.error(`Missing file: ${RATINGS_CSV}`);
  console.error('\nDownload MovieLens 32M from https://grouplens.org/datasets/movielens/');
  console.error('Place links.csv and ratings.csv in data/movielens/');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================
// RATING TO BETA MAPPING
// ============================================

// MovieLens 5-star ratings → "true preference" beta values
const RATING_TO_BETA = {
  '5.0': 2.0,
  '4.5': 1.5,
  '4.0': 1.0,
  '3.5': 0.5,
  '3.0': 0.0,
  '2.5': -0.5,
  '2.0': -1.0,
  '1.5': -1.5,
  '1.0': -2.0,
  '0.5': -2.0, // Treat 0.5 same as 1.0
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate beta score from win/loss counts using Bradley-Terry model
 * (Same implementation as seed-test-users.js)
 */
function calculateBeta(wins, losses) {
  const total = wins + losses;
  if (total === 0) return 0;
  const winRate = (wins + 0.5) / (total + 1);
  return Math.log(winRate / (1 - winRate)) * 0.5;
}

/**
 * Parse a CSV line, handling quoted fields
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Read a CSV file line-by-line using streams (memory efficient for 32M rows)
 */
function createLineReader(filePath) {
  return readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// STEP 1: Build ID Mapping
// ============================================

async function buildIdMapping(aaybeeMovieIds) {
  console.log('Step 1: Building MovieLens → Aaybee ID mapping...');

  // Read links.csv: movieId,imdbId,tmdbId
  const mlToAaybee = new Map(); // MovieLens movieId → aaybee tmdb-{id}
  const rl = createLineReader(LINKS_CSV);
  let headerSkipped = false;
  let totalLinks = 0;
  let matchedLinks = 0;

  for await (const line of rl) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    const fields = parseCSVLine(line);
    if (fields.length < 3) continue;

    const mlMovieId = fields[0];
    const tmdbId = fields[2];

    if (!tmdbId || tmdbId === '') continue;

    totalLinks++;
    const aaybeeId = `tmdb-${tmdbId}`;

    if (aaybeeMovieIds.has(aaybeeId)) {
      mlToAaybee.set(mlMovieId, aaybeeId);
      matchedLinks++;
    }
  }

  console.log(`  Total links: ${totalLinks}`);
  console.log(`  Matched to aaybee movies: ${matchedLinks}`);

  return mlToAaybee;
}

// ============================================
// STEP 2: Collect User Ratings & Select Users
// ============================================

async function collectUserRatings(mlToAaybee) {
  console.log('\nStep 2: Streaming ratings.csv to collect user data...');

  // Map: mlUserId → Map<aaybeeMovieId, rating>
  const userRatings = new Map();
  const rl = createLineReader(RATINGS_CSV);
  let headerSkipped = false;
  let totalRatings = 0;
  let relevantRatings = 0;

  for await (const line of rl) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }

    const fields = parseCSVLine(line);
    if (fields.length < 3) continue;

    totalRatings++;
    if (totalRatings % 5_000_000 === 0) {
      console.log(`  Processed ${(totalRatings / 1_000_000).toFixed(0)}M ratings...`);
    }

    const mlUserId = fields[0];
    const mlMovieId = fields[1];
    const rating = fields[2];

    const aaybeeId = mlToAaybee.get(mlMovieId);
    if (!aaybeeId) continue;

    relevantRatings++;

    if (!userRatings.has(mlUserId)) {
      userRatings.set(mlUserId, new Map());
    }
    userRatings.get(mlUserId).set(aaybeeId, parseFloat(rating));
  }

  console.log(`  Total ratings processed: ${totalRatings.toLocaleString()}`);
  console.log(`  Relevant ratings (overlapping movies): ${relevantRatings.toLocaleString()}`);
  console.log(`  Users with any overlapping ratings: ${userRatings.size.toLocaleString()}`);

  // Filter to users with MIN_OVERLAP+ overlapping ratings
  const qualifiedUsers = new Map();
  for (const [userId, ratings] of userRatings) {
    if (ratings.size >= MIN_OVERLAP) {
      qualifiedUsers.set(userId, ratings);
    }
  }

  console.log(`  Users with ${MIN_OVERLAP}+ overlapping ratings: ${qualifiedUsers.size.toLocaleString()}`);

  // Random sample if we have more than USER_LIMIT
  let selectedUsers;
  if (qualifiedUsers.size <= USER_LIMIT) {
    selectedUsers = qualifiedUsers;
    console.log(`  Using all ${qualifiedUsers.size} qualified users`);
  } else {
    selectedUsers = new Map();
    const userIds = Array.from(qualifiedUsers.keys());

    // Fisher-Yates shuffle for unbiased random sample
    for (let i = userIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [userIds[i], userIds[j]] = [userIds[j], userIds[i]];
    }

    for (let i = 0; i < USER_LIMIT; i++) {
      const userId = userIds[i];
      selectedUsers.set(userId, qualifiedUsers.get(userId));
    }

    console.log(`  Randomly sampled ${USER_LIMIT} users from pool of ${qualifiedUsers.size}`);
  }

  return selectedUsers;
}

// ============================================
// STEP 3: Generate Synthetic Comparisons
// ============================================

function generateSeedUserData(mlUserId, ratings) {
  const ratedMovies = Array.from(ratings.entries());

  // Convert star ratings to "true preference" betas with noise
  const movieBetas = {};
  for (const [movieId, rating] of ratedMovies) {
    const ratingKey = rating.toFixed(1);
    const baseBeta = RATING_TO_BETA[ratingKey] ?? 0;
    // Add small random noise (±0.2) for natural variation
    const noise = (Math.random() - 0.5) * 0.4;
    movieBetas[movieId] = baseBeta + noise;
  }

  const movieIds = ratedMovies.map(([id]) => id);
  const comparisons = [];
  const usedPairs = new Set();
  const movieStats = {};

  // Initialize stats for all rated movies
  for (const movieId of movieIds) {
    movieStats[movieId] = { wins: 0, losses: 0, comparisons: 0 };
  }

  // Generate comparisons
  for (let i = 0; i < COMPARISONS_PER_USER; i++) {
    let movieA, movieB;
    let attempts = 0;

    do {
      const idx1 = Math.floor(Math.random() * movieIds.length);
      const idx2 = Math.floor(Math.random() * movieIds.length);
      movieA = movieIds[idx1];
      movieB = movieIds[idx2];
      attempts++;
    } while (
      (movieA === movieB ||
        usedPairs.has(`${movieA}-${movieB}`) ||
        usedPairs.has(`${movieB}-${movieA}`)) &&
      attempts < 100
    );

    if (attempts >= 100) continue;

    usedPairs.add(`${movieA}-${movieB}`);

    // Use logistic function on beta difference to determine winner
    const betaA = movieBetas[movieA];
    const betaB = movieBetas[movieB];
    const probAWins = 1 / (1 + Math.exp(-(betaA - betaB)));
    const choice = Math.random() < probAWins ? 'A' : 'B';

    comparisons.push({
      movieA,
      movieB,
      choice,
      comparisonNumber: i + 1,
    });

    // Track stats
    movieStats[movieA].comparisons++;
    movieStats[movieB].comparisons++;
    if (choice === 'A') {
      movieStats[movieA].wins++;
      movieStats[movieB].losses++;
    } else {
      movieStats[movieB].wins++;
      movieStats[movieA].losses++;
    }
  }

  // Compute final beta from outcomes
  for (const movieId of movieIds) {
    const stats = movieStats[movieId];
    stats.beta = calculateBeta(stats.wins, stats.losses);
  }

  return { comparisons, movieStats };
}

// ============================================
// STEP 4: Insert into Supabase
// ============================================

async function createSeedUser(mlUserId) {
  const email = `seed-${mlUserId}@movielens.local`;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: 'SeedUser123!',
    email_confirm: true,
    user_metadata: {
      display_name: `MovieLens User ${mlUserId}`,
    },
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      // Try to find existing user by listing (only works for small sets)
      // Use a direct query approach instead
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('display_name', `MovieLens User ${mlUserId}`)
        .single();

      if (profile) return profile.id;

      // Fallback: try to get from auth
      const { data: { users } } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        // Can't filter by email in listUsers, skip this user
      });

      console.warn(`  Skipping user ${mlUserId}: already exists but couldn't find ID`);
      return null;
    }
    console.error(`  Error creating user seed-${mlUserId}: ${authError.message}`);
    return null;
  }

  return authData.user.id;
}

async function insertSeedUserData(userId, mlUserId, movieStats, comparisons) {
  // Update profile
  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      display_name: `MovieLens User ${mlUserId}`,
      onboarding_complete: true,
      total_comparisons: comparisons.length,
      is_seed: true,
    });

  if (profileError) {
    console.error(`  Error updating profile: ${profileError.message}`);
    return false;
  }

  // Insert user_movies (only movies that were actually compared)
  const userMovies = Object.entries(movieStats)
    .filter(([_, stats]) => stats.comparisons > 0)
    .map(([movieId, stats]) => ({
      user_id: userId,
      movie_id: movieId,
      beta: stats.beta,
      total_wins: stats.wins,
      total_losses: stats.losses,
      total_comparisons: stats.comparisons,
      times_shown: stats.comparisons,
      status: 'known',
    }));

  // Insert user_movies in batches
  const movieBatchSize = 20;
  for (let i = 0; i < userMovies.length; i += movieBatchSize) {
    const batch = userMovies.slice(i, i + movieBatchSize);
    const { error } = await supabase
      .from('user_movies')
      .upsert(batch, { onConflict: 'user_id,movie_id' });

    if (error) {
      console.error(`  Error inserting movies batch: ${error.message}`);
      return false;
    }
  }

  // Insert comparisons in batches
  const compRecords = comparisons.map(comp => ({
    user_id: userId,
    movie_a_id: comp.movieA,
    movie_b_id: comp.movieB,
    choice: comp.choice,
    comparison_number: comp.comparisonNumber,
  }));

  const compBatchSize = 25;
  for (let i = 0; i < compRecords.length; i += compBatchSize) {
    const batch = compRecords.slice(i, i + compBatchSize);
    const { error } = await supabase
      .from('comparisons')
      .insert(batch);

    if (error) {
      console.error(`  Error inserting comparisons batch: ${error.message}`);
      return false;
    }
  }

  return true;
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('========================================');
  console.log('AAYBEE MOVIELENS SEED USER GENERATOR');
  console.log('========================================\n');

  if (DRY_RUN) {
    console.log('*** DRY RUN MODE - No data will be written ***\n');
  }

  console.log(`Config:`);
  console.log(`  User limit: ${USER_LIMIT}`);
  console.log(`  Min overlap: ${MIN_OVERLAP} ratings`);
  console.log(`  Comparisons per user: ${COMPARISONS_PER_USER}`);
  console.log(`  Max tier: ${MAX_TIER}`);
  console.log(`  Delete existing: ${DELETE_EXISTING}`);
  console.log(`  Data dir: ${DATA_DIR}\n`);

  // Get list of aaybee movie IDs from Supabase (or use a fallback for dry-run)
  let aaybeeMovieIds;
  if (DRY_RUN) {
    // In dry-run mode, we don't have Supabase — accept all tmdb IDs from links.csv
    console.log('  (Dry run: accepting all tmdb IDs from links.csv)\n');
    aaybeeMovieIds = null; // Will be set after reading links.csv
  } else {
    console.log(`Fetching aaybee movie IDs (tier <= ${MAX_TIER}) from Supabase...`);
    const allMovieIds = new Set();
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('movies')
        .select('id')
        .lte('tier', MAX_TIER)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error(`Error fetching movies: ${error.message}`);
        process.exit(1);
      }

      if (!data || data.length === 0) break;

      for (const row of data) {
        allMovieIds.add(row.id);
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    aaybeeMovieIds = allMovieIds;
    console.log(`  Found ${aaybeeMovieIds.size} tier 1-${MAX_TIER} movies in aaybee database\n`);
  }

  // Step 1: Build ID mapping
  let mlToAaybee;
  if (DRY_RUN) {
    // For dry run, build mapping with all tmdb IDs
    console.log('Step 1: Building MovieLens → TMDb ID mapping (dry run)...');
    mlToAaybee = new Map();
    const rl = createLineReader(LINKS_CSV);
    let headerSkipped = false;

    for await (const line of rl) {
      if (!headerSkipped) { headerSkipped = true; continue; }
      const fields = parseCSVLine(line);
      if (fields.length < 3 || !fields[2]) continue;
      mlToAaybee.set(fields[0], `tmdb-${fields[2]}`);
    }

    console.log(`  Total mappings: ${mlToAaybee.size}\n`);
  } else {
    mlToAaybee = await buildIdMapping(aaybeeMovieIds);
  }

  // Step 2: Select seed users
  const selectedUsers = await collectUserRatings(mlToAaybee);

  if (selectedUsers.size === 0) {
    console.error('\nNo qualified users found! Check your data files and MIN_OVERLAP setting.');
    process.exit(1);
  }

  // Delete existing seed users if requested
  if (!DRY_RUN && DELETE_EXISTING) {
    console.log('\nDeleting existing seed users...');

    // Find all seed user IDs
    const seedUserIds = [];
    let seedFrom = 0;
    while (true) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('is_seed', true)
        .range(seedFrom, seedFrom + 999);

      if (error) {
        console.error(`Error fetching seed users: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      seedUserIds.push(...data.map(u => u.id));
      if (data.length < 1000) break;
      seedFrom += 1000;
    }

    console.log(`  Found ${seedUserIds.length} existing seed users to delete`);

    // Delete in chunks (comparisons, user_movies, profiles, then auth users)
    const DEL_CHUNK = 20;
    for (let i = 0; i < seedUserIds.length; i += DEL_CHUNK) {
      const chunk = seedUserIds.slice(i, i + DEL_CHUNK);

      // Delete comparisons
      await supabase.from('comparisons').delete().in('user_id', chunk);
      // Delete user_movies
      await supabase.from('user_movies').delete().in('user_id', chunk);
      // Delete profiles
      await supabase.from('user_profiles').delete().in('id', chunk);
      // Delete auth users
      for (const uid of chunk) {
        await supabase.auth.admin.deleteUser(uid);
      }

      if ((i + DEL_CHUNK) % 200 === 0) {
        console.log(`  Deleted ${Math.min(i + DEL_CHUNK, seedUserIds.length)}/${seedUserIds.length}...`);
      }
    }

    console.log(`  Deleted ${seedUserIds.length} seed users`);
  }

  // Step 3 & 4: Generate comparisons and insert
  console.log(`\nStep 3-4: Generating comparisons and inserting ${selectedUsers.size} seed users...\n`);

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let totalMovieRecords = 0;
  let totalComparisonRecords = 0;
  let userIndex = 0;

  for (const [mlUserId, ratings] of selectedUsers) {
    userIndex++;

    // Progress indicator
    if (userIndex % 50 === 0 || userIndex === 1) {
      console.log(`[${userIndex}/${selectedUsers.size}] Processing ML user ${mlUserId} (${ratings.size} ratings)...`);
    }

    // Generate synthetic comparisons
    const { comparisons, movieStats } = generateSeedUserData(mlUserId, ratings);

    const comparedMovieCount = Object.values(movieStats).filter(s => s.comparisons > 0).length;

    if (DRY_RUN) {
      successCount++;
      totalMovieRecords += comparedMovieCount;
      totalComparisonRecords += comparisons.length;
      continue;
    }

    // Create auth user
    const userId = await createSeedUser(mlUserId);
    if (!userId) {
      skipCount++;
      continue;
    }

    // Insert data
    const success = await insertSeedUserData(userId, mlUserId, movieStats, comparisons);
    if (success) {
      successCount++;
      totalMovieRecords += comparedMovieCount;
      totalComparisonRecords += comparisons.length;
    } else {
      failCount++;
    }

    // Small delay every 10 users to avoid rate limits
    if (userIndex % 10 === 0) {
      await sleep(100);
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('SEEDING COMPLETE - SUMMARY');
  console.log('========================================\n');

  if (DRY_RUN) {
    console.log('*** DRY RUN - No data was written ***\n');
  }

  console.log(`Users created: ${successCount}`);
  console.log(`Users skipped: ${skipCount}`);
  console.log(`Users failed: ${failCount}`);
  console.log(`Total movie records: ${totalMovieRecords.toLocaleString()}`);
  console.log(`Total comparison records: ${totalComparisonRecords.toLocaleString()}`);
  console.log(`Avg movies per user: ${successCount > 0 ? Math.round(totalMovieRecords / successCount) : 0}`);
  console.log(`Avg comparisons per user: ${successCount > 0 ? Math.round(totalComparisonRecords / successCount) : 0}`);

  if (!DRY_RUN) {
    console.log('\nVerification:');

    const { count: seedCount } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_seed', true);

    console.log(`  Seed users in DB: ${seedCount}`);
    console.log(`\nVerification queries to run in Supabase SQL editor:`);
    console.log(`  SELECT COUNT(*) FROM user_profiles WHERE is_seed = true;`);
    console.log(`  SELECT COUNT(DISTINCT movie_id) FROM user_movies um JOIN user_profiles up ON um.user_id = up.id WHERE up.is_seed = true;`);
    console.log(`\nSeed user email format: seed-{mlUserId}@movielens.local`);
    console.log(`Seed user password: SeedUser123!`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
