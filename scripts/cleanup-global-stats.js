/**
 * Cleanup orphaned global_movie_stats rows
 *
 * Removes entries that have no backing user_movies data,
 * then recalculates stats for movies that do have data.
 *
 * Usage:
 *   node scripts/cleanup-global-stats.js
 *   node scripts/cleanup-global-stats.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('=== CLEANUP ORPHANED GLOBAL MOVIE STATS ===');
  if (DRY_RUN) console.log('*** DRY RUN ***\n');

  // 1. Get all movie IDs in global_movie_stats
  const { data: allStats, error: statsErr } = await supabase
    .from('global_movie_stats')
    .select('movie_id');

  if (statsErr || !allStats) {
    console.error('Failed to fetch global_movie_stats:', statsErr);
    process.exit(1);
  }

  console.log('Total global_movie_stats rows: ' + allStats.length);

  // 2. Get all movie IDs that have actual user_movies data with comparisons
  const { data: activeMovies, error: activeErr } = await supabase
    .from('user_movies')
    .select('movie_id')
    .gt('total_comparisons', 0);

  if (activeErr) {
    console.error('Failed to fetch user_movies:', activeErr);
    process.exit(1);
  }

  const activeIds = new Set((activeMovies || []).map(m => m.movie_id));
  console.log('Movies with actual user_movies data: ' + activeIds.size);

  // 3. Find orphans
  const orphanIds = allStats
    .map(s => s.movie_id)
    .filter(id => !activeIds.has(id));

  console.log('Orphaned global_movie_stats rows: ' + orphanIds.length);

  if (orphanIds.length === 0) {
    console.log('\nNo orphans found. Nothing to clean up.');
    return;
  }

  // Show some examples
  const sampleIds = orphanIds.slice(0, 10);
  const { data: sampleMovies } = await supabase
    .from('movies')
    .select('id, title, tier')
    .in('id', sampleIds);
  const movieMap = new Map((sampleMovies || []).map(m => [m.id, m]));

  console.log('\nSample orphans:');
  for (const id of sampleIds) {
    const m = movieMap.get(id);
    console.log('  ' + (m ? m.title + ' (tier=' + m.tier + ')' : id));
  }

  // 4. Delete orphans
  if (!DRY_RUN) {
    const batchSize = 50;
    let deleted = 0;
    for (let i = 0; i < orphanIds.length; i += batchSize) {
      const batch = orphanIds.slice(i, i + batchSize);
      const { error: delErr } = await supabase
        .from('global_movie_stats')
        .delete()
        .in('movie_id', batch);

      if (delErr) {
        console.error('Delete error:', delErr);
      } else {
        deleted += batch.length;
      }
    }
    console.log('\nDeleted ' + deleted + ' orphaned rows.');
  } else {
    console.log('\nWould delete ' + orphanIds.length + ' rows. Run without --dry-run to execute.');
  }

  // 5. Verify
  if (!DRY_RUN) {
    const { count } = await supabase
      .from('global_movie_stats')
      .select('*', { count: 'exact', head: true });
    console.log('Remaining global_movie_stats rows: ' + count);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
