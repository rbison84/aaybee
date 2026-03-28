/**
 * Seed Test Users for Aaybee
 *
 * This script populates Supabase with dummy test accounts to validate:
 * - Global Rankings (Milestone 5)
 * - R² Correlation & Recommendations (Milestone 6)
 *
 * Usage:
 *   node scripts/seed-test-users.js
 *
 * Required environment variables:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (NOT anon key)
 */

const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables:');
  console.error('  SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nExample:');
  console.error('  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/seed-test-users.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================
// TEST USER PROFILES
// ============================================

// Define taste profiles - each user has genre preferences and favorite movies
const TEST_USERS = [
  // Action/Sci-Fi lovers (Group A - should have high R² with each other)
  {
    name: 'Alex Chen',
    email: 'alex.chen@test.local',
    tasteProfile: 'action-scifi',
    favoriteGenres: ['action', 'scifi'],
    topMovies: ['tmdb-603', 'tmdb-155', 'tmdb-27205', 'tmdb-157336', 'tmdb-299536'], // Matrix, Dark Knight, Inception, Interstellar, Infinity War
    dislikedMovies: ['tmdb-597', 'tmdb-114', 'tmdb-313369'], // Titanic, Pretty Woman, La La Land
    comparisonCount: 75,
  },
  {
    name: 'Jordan Kim',
    email: 'jordan.kim@test.local',
    tasteProfile: 'action-scifi',
    favoriteGenres: ['action', 'scifi'],
    topMovies: ['tmdb-155', 'tmdb-603', 'tmdb-27205', 'tmdb-299534', 'tmdb-24428'], // Dark Knight, Matrix, Inception, Endgame, Avengers
    dislikedMovies: ['tmdb-4348', 'tmdb-508', 'tmdb-114'], // Pride & Prejudice, Love Actually, Pretty Woman
    comparisonCount: 85,
  },
  {
    name: 'Sam Rivera',
    email: 'sam.rivera@test.local',
    tasteProfile: 'action-scifi',
    favoriteGenres: ['scifi', 'action', 'thriller'],
    topMovies: ['tmdb-27205', 'tmdb-157336', 'tmdb-603', 'tmdb-11', 'tmdb-1891'], // Inception, Interstellar, Matrix, Star Wars ANH, ESB
    dislikedMovies: ['tmdb-597', 'tmdb-637', 'tmdb-346698'], // Titanic, Life is Beautiful, Barbie
    comparisonCount: 60,
  },

  // Drama/Classic lovers (Group B - should have high R² with each other)
  {
    name: 'Morgan Taylor',
    email: 'morgan.taylor@test.local',
    tasteProfile: 'drama-classic',
    favoriteGenres: ['drama', 'crime'],
    topMovies: ['tmdb-278', 'tmdb-238', 'tmdb-240', 'tmdb-389', 'tmdb-424'], // Shawshank, Godfather 1&2, 12 Angry Men, Schindler's List
    dislikedMovies: ['tmdb-24428', 'tmdb-118340', 'tmdb-502356'], // Avengers, Guardians, Mario
    comparisonCount: 90,
  },
  {
    name: 'Casey Brooks',
    email: 'casey.brooks@test.local',
    tasteProfile: 'drama-classic',
    favoriteGenres: ['drama', 'history'],
    topMovies: ['tmdb-238', 'tmdb-278', 'tmdb-497', 'tmdb-424', 'tmdb-680'], // Godfather, Shawshank, Green Mile, Schindler's, Pulp Fiction
    dislikedMovies: ['tmdb-862', 'tmdb-585', 'tmdb-346698'], // Toy Story, Monsters Inc, Barbie
    comparisonCount: 70,
  },
  {
    name: 'Riley Morgan',
    email: 'riley.morgan@test.local',
    tasteProfile: 'drama-classic',
    favoriteGenres: ['drama', 'thriller'],
    topMovies: ['tmdb-550', 'tmdb-807', 'tmdb-680', 'tmdb-278', 'tmdb-769'], // Fight Club, Se7en, Pulp Fiction, Shawshank, Goodfellas
    dislikedMovies: ['tmdb-12', 'tmdb-354912', 'tmdb-114'], // Finding Nemo, Coco, Pretty Woman
    comparisonCount: 55,
  },

  // Animation/Family lovers (Group C)
  {
    name: 'Taylor Swift', // Different from the singer!
    email: 'taylor.swift@test.local',
    tasteProfile: 'animation-family',
    favoriteGenres: ['animation', 'family', 'comedy'],
    topMovies: ['tmdb-862', 'tmdb-12', 'tmdb-354912', 'tmdb-585', 'tmdb-10193'], // Toy Story, Nemo, Coco, Monsters Inc, TS3
    dislikedMovies: ['tmdb-694', 'tmdb-493922', 'tmdb-539'], // Shining, Hereditary, Psycho
    comparisonCount: 45,
  },
  {
    name: 'Jamie Lee',
    email: 'jamie.lee@test.local',
    tasteProfile: 'animation-family',
    favoriteGenres: ['animation', 'comedy', 'family'],
    topMovies: ['tmdb-354912', 'tmdb-862', 'tmdb-863', 'tmdb-12', 'tmdb-502356'], // Coco, Toy Story 1&2, Nemo, Mario
    dislikedMovies: ['tmdb-807', 'tmdb-73', 'tmdb-111'], // Se7en, American History X, Scarface
    comparisonCount: 50,
  },

  // Romance/Drama lovers (Group D)
  {
    name: 'Emma Watson',
    email: 'emma.watson@test.local',
    tasteProfile: 'romance-drama',
    favoriteGenres: ['romance', 'drama'],
    topMovies: ['tmdb-597', 'tmdb-4348', 'tmdb-313369', 'tmdb-152601', 'tmdb-508'], // Titanic, Pride, La La Land, Her, Love Actually
    dislikedMovies: ['tmdb-299536', 'tmdb-111', 'tmdb-694'], // Infinity War, Scarface, Shining
    comparisonCount: 65,
  },
  {
    name: 'Noah Parker',
    email: 'noah.parker@test.local',
    tasteProfile: 'romance-drama',
    favoriteGenres: ['romance', 'drama', 'comedy'],
    topMovies: ['tmdb-313369', 'tmdb-4348', 'tmdb-597', 'tmdb-13', 'tmdb-637'], // La La Land, Pride, Titanic, Forrest Gump, Life is Beautiful
    dislikedMovies: ['tmdb-493922', 'tmdb-419430', 'tmdb-539'], // Hereditary, Get Out, Psycho
    comparisonCount: 40,
  },

  // Horror/Thriller lovers (Group E)
  {
    name: 'Blake Horror',
    email: 'blake.horror@test.local',
    tasteProfile: 'horror-thriller',
    favoriteGenres: ['horror', 'thriller'],
    topMovies: ['tmdb-694', 'tmdb-493922', 'tmdb-419430', 'tmdb-539', 'tmdb-807'], // Shining, Hereditary, Get Out, Psycho, Se7en
    dislikedMovies: ['tmdb-862', 'tmdb-12', 'tmdb-114'], // Toy Story, Nemo, Pretty Woman
    comparisonCount: 55,
  },
  {
    name: 'Skyler Night',
    email: 'skyler.night@test.local',
    tasteProfile: 'horror-thriller',
    favoriteGenres: ['horror', 'thriller', 'crime'],
    topMovies: ['tmdb-419430', 'tmdb-694', 'tmdb-493922', 'tmdb-680', 'tmdb-550'], // Get Out, Shining, Hereditary, Pulp Fiction, Fight Club
    dislikedMovies: ['tmdb-354912', 'tmdb-508', 'tmdb-346698'], // Coco, Love Actually, Barbie
    comparisonCount: 35,
  },

  // Eclectic taste (Mixed - for testing edge cases)
  {
    name: 'Quinn Diverse',
    email: 'quinn.diverse@test.local',
    tasteProfile: 'eclectic',
    favoriteGenres: ['scifi', 'drama', 'animation'],
    topMovies: ['tmdb-157336', 'tmdb-278', 'tmdb-354912', 'tmdb-872585', 'tmdb-313369'], // Interstellar, Shawshank, Coco, Oppenheimer, La La Land
    dislikedMovies: ['tmdb-111', 'tmdb-311'], // Scarface, Once Upon a Time in America
    comparisonCount: 100,
  },
  {
    name: 'Avery Mix',
    email: 'avery.mix@test.local',
    tasteProfile: 'eclectic',
    favoriteGenres: ['comedy', 'drama', 'action'],
    topMovies: ['tmdb-13', 'tmdb-346698', 'tmdb-155', 'tmdb-120', 'tmdb-872585'], // Forrest Gump, Barbie, Dark Knight, LOTR, Oppenheimer
    dislikedMovies: ['tmdb-539', 'tmdb-311'], // Psycho, Once Upon a Time
    comparisonCount: 80,
  },
];

// All movie IDs from seed_movies.sql
const ALL_MOVIES = [
  'tmdb-603', 'tmdb-155', 'tmdb-157336', 'tmdb-27205', 'tmdb-24428', 'tmdb-118340',
  'tmdb-11', 'tmdb-1891', 'tmdb-140607', 'tmdb-299536', 'tmdb-278', 'tmdb-238',
  'tmdb-240', 'tmdb-550', 'tmdb-13', 'tmdb-489', 'tmdb-807', 'tmdb-120', 'tmdb-121',
  'tmdb-122', 'tmdb-862', 'tmdb-863', 'tmdb-10193', 'tmdb-585', 'tmdb-12', 'tmdb-354912',
  'tmdb-597', 'tmdb-114', 'tmdb-4348', 'tmdb-313369', 'tmdb-152601', 'tmdb-508',
  'tmdb-694', 'tmdb-539', 'tmdb-493922', 'tmdb-419430', 'tmdb-111', 'tmdb-680',
  'tmdb-389', 'tmdb-424', 'tmdb-497', 'tmdb-637', 'tmdb-769', 'tmdb-73', 'tmdb-311',
  'tmdb-299534', 'tmdb-284054', 'tmdb-346698', 'tmdb-872585', 'tmdb-502356'
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate beta score based on wins/losses using Bradley-Terry model
 */
function calculateBeta(wins, losses) {
  const total = wins + losses;
  if (total === 0) return 0;

  // Simple beta calculation: log odds with smoothing
  const winRate = (wins + 0.5) / (total + 1);
  return Math.log(winRate / (1 - winRate)) * 0.5;
}

/**
 * Generate random comparison outcomes for a user based on their taste profile
 */
function generateComparisons(user, movieBetas) {
  const comparisons = [];
  const usedPairs = new Set();

  for (let i = 0; i < user.comparisonCount; i++) {
    // Pick two random movies that haven't been compared
    let movieA, movieB;
    let attempts = 0;

    do {
      const idx1 = Math.floor(Math.random() * ALL_MOVIES.length);
      const idx2 = Math.floor(Math.random() * ALL_MOVIES.length);
      movieA = ALL_MOVIES[idx1];
      movieB = ALL_MOVIES[idx2];
      attempts++;
    } while ((movieA === movieB || usedPairs.has(`${movieA}-${movieB}`) || usedPairs.has(`${movieB}-${movieA}`)) && attempts < 100);

    if (attempts >= 100) continue;

    usedPairs.add(`${movieA}-${movieB}`);

    // Determine winner based on user preferences
    const betaA = movieBetas[movieA] || 0;
    const betaB = movieBetas[movieB] || 0;

    // Use logistic function to determine probability of A winning
    const probAWins = 1 / (1 + Math.exp(-(betaA - betaB)));
    const choice = Math.random() < probAWins ? 'A' : 'B';

    comparisons.push({
      movieA,
      movieB,
      choice,
      comparisonNumber: i + 1,
    });
  }

  return comparisons;
}

/**
 * Create initial beta values for movies based on user's taste profile
 */
function createUserMovieBetas(user) {
  const betas = {};

  // Start all movies at 0
  ALL_MOVIES.forEach(movieId => {
    betas[movieId] = 0;
  });

  // Boost top movies significantly
  user.topMovies.forEach((movieId, index) => {
    // Higher rank = higher beta (index 0 is best)
    betas[movieId] = 2.5 - (index * 0.3) + (Math.random() * 0.3);
  });

  // Lower disliked movies
  user.dislikedMovies.forEach((movieId) => {
    betas[movieId] = -1.5 - (Math.random() * 0.5);
  });

  // Add some noise to other movies
  ALL_MOVIES.forEach(movieId => {
    if (!user.topMovies.includes(movieId) && !user.dislikedMovies.includes(movieId)) {
      betas[movieId] = (Math.random() - 0.5) * 1.5;
    }
  });

  return betas;
}

/**
 * Process comparisons to compute final movie stats
 */
function computeMovieStats(comparisons) {
  const stats = {};

  // Initialize all movies
  ALL_MOVIES.forEach(movieId => {
    stats[movieId] = { wins: 0, losses: 0, comparisons: 0 };
  });

  // Process each comparison
  comparisons.forEach(comp => {
    stats[comp.movieA].comparisons++;
    stats[comp.movieB].comparisons++;

    if (comp.choice === 'A') {
      stats[comp.movieA].wins++;
      stats[comp.movieB].losses++;
    } else {
      stats[comp.movieB].wins++;
      stats[comp.movieA].losses++;
    }
  });

  // Calculate final beta for each movie
  Object.keys(stats).forEach(movieId => {
    stats[movieId].beta = calculateBeta(stats[movieId].wins, stats[movieId].losses);
  });

  return stats;
}

// ============================================
// MAIN SEEDING FUNCTIONS
// ============================================

async function createTestUser(userData) {
  console.log(`Creating user: ${userData.name} (${userData.email})`);

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: userData.email,
    password: 'TestPassword123!',
    email_confirm: true,
    user_metadata: {
      display_name: userData.name,
    },
  });

  if (authError) {
    // User might already exist
    if (authError.message.includes('already been registered')) {
      console.log(`  User ${userData.email} already exists, fetching...`);

      // Get existing user
      const { data: users } = await supabase.auth.admin.listUsers();
      const existingUser = users.users.find(u => u.email === userData.email);

      if (existingUser) {
        return existingUser.id;
      }
    }
    console.error(`  Error creating user: ${authError.message}`);
    return null;
  }

  return authData.user.id;
}

async function updateUserProfile(userId, userData) {
  console.log(`  Updating profile for ${userData.name}`);

  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      display_name: userData.name,
      favorite_genres: userData.favoriteGenres,
      onboarding_complete: true,
      total_comparisons: userData.comparisonCount,
    });

  if (error) {
    console.error(`  Error updating profile: ${error.message}`);
  }
}

async function insertUserMovies(userId, movieStats) {
  console.log(`  Inserting movie data...`);

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

  // Insert in batches
  const batchSize = 20;
  for (let i = 0; i < userMovies.length; i += batchSize) {
    const batch = userMovies.slice(i, i + batchSize);

    const { error } = await supabase
      .from('user_movies')
      .upsert(batch, { onConflict: 'user_id,movie_id' });

    if (error) {
      console.error(`  Error inserting movies batch: ${error.message}`);
    }
  }

  console.log(`  Inserted ${userMovies.length} movie records`);
}

async function insertComparisons(userId, comparisons) {
  console.log(`  Inserting ${comparisons.length} comparisons...`);

  const comparisonRecords = comparisons.map(comp => ({
    user_id: userId,
    movie_a_id: comp.movieA,
    movie_b_id: comp.movieB,
    choice: comp.choice,
    comparison_number: comp.comparisonNumber,
  }));

  // Insert in batches
  const batchSize = 25;
  for (let i = 0; i < comparisonRecords.length; i += batchSize) {
    const batch = comparisonRecords.slice(i, i + batchSize);

    const { error } = await supabase
      .from('comparisons')
      .insert(batch);

    if (error) {
      console.error(`  Error inserting comparisons batch: ${error.message}`);
    }
  }
}

async function seedUser(userData) {
  // Create user
  const userId = await createTestUser(userData);
  if (!userId) return null;

  // Update profile
  await updateUserProfile(userId, userData);

  // Generate movie betas based on taste profile
  const movieBetas = createUserMovieBetas(userData);

  // Generate comparisons
  const comparisons = generateComparisons(userData, movieBetas);

  // Compute final stats from comparisons
  const movieStats = computeMovieStats(comparisons);

  // Insert user_movies
  await insertUserMovies(userId, movieStats);

  // Insert comparisons
  await insertComparisons(userId, comparisons);

  return userId;
}

async function recalculateGlobalStats() {
  console.log('\nRecalculating global movie stats...');

  for (const movieId of ALL_MOVIES) {
    // Get all user ratings for this movie
    const { data: userMovies, error } = await supabase
      .from('user_movies')
      .select('beta, total_wins, total_losses, total_comparisons')
      .eq('movie_id', movieId)
      .gt('total_comparisons', 0);

    if (error || !userMovies || userMovies.length === 0) continue;

    // Calculate weighted global beta
    let totalWeight = 0;
    let weightedBetaSum = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalComparisons = 0;
    const betas = [];

    userMovies.forEach(um => {
      const weight = Math.sqrt(um.total_comparisons + 1);
      totalWeight += weight;
      weightedBetaSum += um.beta * weight;
      totalWins += um.total_wins;
      totalLosses += um.total_losses;
      totalComparisons += um.total_comparisons;
      betas.push(um.beta);
    });

    const globalBeta = totalWeight > 0 ? weightedBetaSum / totalWeight : 0;

    // Calculate percentiles
    betas.sort((a, b) => a - b);
    const p25 = betas[Math.floor(betas.length * 0.25)] || 0;
    const median = betas[Math.floor(betas.length * 0.5)] || 0;
    const p75 = betas[Math.floor(betas.length * 0.75)] || 0;
    const average = betas.reduce((a, b) => a + b, 0) / betas.length;

    // Upsert global stats
    const { error: upsertError } = await supabase
      .from('global_movie_stats')
      .upsert({
        movie_id: movieId,
        global_beta: globalBeta,
        total_global_wins: totalWins,
        total_global_losses: totalLosses,
        total_global_comparisons: totalComparisons,
        unique_users_count: userMovies.length,
        average_user_beta: average,
        median_user_beta: median,
        percentile_25: p25,
        percentile_75: p75,
        last_calculated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error(`  Error updating global stats for ${movieId}: ${upsertError.message}`);
    }
  }

  console.log('Global stats updated!');
}

async function printSummary() {
  console.log('\n========================================');
  console.log('SEEDING COMPLETE - SUMMARY');
  console.log('========================================\n');

  // Count users
  const { count: userCount } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true });

  console.log(`Total users: ${userCount}`);

  // Count comparisons
  const { count: compCount } = await supabase
    .from('comparisons')
    .select('*', { count: 'exact', head: true });

  console.log(`Total comparisons: ${compCount}`);

  // Top global movies
  const { data: topMovies } = await supabase
    .from('global_movie_stats')
    .select('movie_id, global_beta, unique_users_count')
    .order('global_beta', { ascending: false })
    .limit(10);

  console.log('\nTop 10 Global Movies:');
  if (topMovies) {
    topMovies.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.movie_id} (beta: ${m.global_beta.toFixed(2)}, users: ${m.unique_users_count})`);
    });
  }

  // Taste profile groups
  console.log('\nTaste Profile Groups:');
  console.log('  - Action/Sci-Fi: Alex Chen, Jordan Kim, Sam Rivera');
  console.log('  - Drama/Classic: Morgan Taylor, Casey Brooks, Riley Morgan');
  console.log('  - Animation/Family: Taylor Swift, Jamie Lee');
  console.log('  - Romance/Drama: Emma Watson, Noah Parker');
  console.log('  - Horror/Thriller: Blake Horror, Skyler Night');
  console.log('  - Eclectic: Quinn Diverse, Avery Mix');

  console.log('\nTest Accounts Password: TestPassword123!');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('========================================');
  console.log('AAYBEE TEST DATA SEEDER');
  console.log('========================================\n');

  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Users to create: ${TEST_USERS.length}\n`);

  // Seed each user
  for (const userData of TEST_USERS) {
    console.log('----------------------------------------');
    await seedUser(userData);
    console.log('');
  }

  // Recalculate global stats
  await recalculateGlobalStats();

  // Print summary
  await printSummary();
}

main().catch(console.error);
