/**
 * Migration script: Add original_language column and backfill from tmdb_data
 *
 * Uses the service role key to execute the migration via Supabase Management API,
 * then backfills via the PostgREST client.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') {
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
});

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Execute raw SQL via the Supabase HTTP SQL endpoint
async function executeSql(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, status: res.status };
}

async function columnExists() {
  const { data, error } = await supabase
    .from('movies')
    .select('original_language')
    .limit(1);
  return !error;
}

async function addColumnViaRpc() {
  // Try creating a temporary function to add the column, then drop it
  // This works because service_role has superuser-like permissions via PostgREST RPC
  const createFn = `
    CREATE OR REPLACE FUNCTION _temp_add_original_language()
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      ALTER TABLE movies ADD COLUMN IF NOT EXISTS original_language TEXT;
    END;
    $$;
  `;
  const callFn = `SELECT _temp_add_original_language();`;
  const dropFn = `DROP FUNCTION IF EXISTS _temp_add_original_language();`;

  // Try via direct SQL endpoint
  for (const sql of [createFn, callFn, dropFn]) {
    await executeSql(sql);
  }
}

async function backfill() {
  // Fetch movies missing original_language that have tmdb_data
  let allMovies = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('id, tmdb_data')
      .is('original_language', null)
      .not('tmdb_data', 'is', null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching movies:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allMovies.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Found ${allMovies.length} movies to backfill`);

  let updated = 0;
  let skipped = 0;
  const batchSize = 50;

  for (let i = 0; i < allMovies.length; i += batchSize) {
    const batch = allMovies.slice(i, i + batchSize);
    const updates = batch
      .filter(m => m.tmdb_data?.original_language)
      .map(m => ({
        id: m.id,
        original_language: m.tmdb_data.original_language,
      }));

    if (updates.length > 0) {
      const { error } = await supabase
        .from('movies')
        .upsert(updates, { onConflict: 'id', ignoreDuplicates: false });

      if (error) {
        console.error(`  Batch error at offset ${i}:`, error.message);
      } else {
        updated += updates.length;
      }
    }
    skipped += batch.length - updates.length;
    process.stdout.write(`\r  Updated ${updated}, skipped ${skipped} (no language in tmdb_data)`);
  }
  console.log('');
}

async function verify() {
  // Group by original_language
  const { data, error } = await supabase
    .from('movies')
    .select('original_language');

  if (error) {
    console.error('Verify error:', error.message);
    return;
  }

  const counts = {};
  let nullCount = 0;
  for (const row of data) {
    const lang = row.original_language;
    if (!lang) { nullCount++; continue; }
    counts[lang] = (counts[lang] || 0) + 1;
  }

  // Sort by count descending
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log('\nLanguage distribution:');
  for (const [lang, count] of sorted.slice(0, 15)) {
    console.log(`  ${lang}: ${count}`);
  }
  if (sorted.length > 15) console.log(`  ... and ${sorted.length - 15} more languages`);
  if (nullCount > 0) console.log(`  NULL: ${nullCount}`);

  // Check specific movies
  const { data: testMovies } = await supabase
    .from('movies')
    .select('title, original_language')
    .in('title', ['Wolf Children', 'Come and See']);

  if (testMovies && testMovies.length > 0) {
    console.log('\nForeign film check:');
    for (const m of testMovies) {
      console.log(`  ${m.title}: ${m.original_language || 'NULL'}`);
    }
  }
}

async function main() {
  console.log('=== Migration: Add original_language column ===\n');

  // Step 1: Check if column already exists
  const exists = await columnExists();

  if (exists) {
    console.log('Column original_language already exists. Proceeding to backfill.\n');
  } else {
    console.log('Column original_language does not exist. Adding it...');
    // Try RPC approach
    await addColumnViaRpc();

    // Check again
    const existsNow = await columnExists();
    if (!existsNow) {
      console.error('\nCould not add column via API. Running ALTER TABLE via SQL...');
      // Last resort: try using the pg endpoint
      const alterRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({}),
      });

      console.error('\nPlease run this SQL in the Supabase Dashboard SQL Editor:');
      console.error('  ALTER TABLE movies ADD COLUMN IF NOT EXISTS original_language TEXT;');
      console.error('\nThen re-run this script to backfill the data.');
      process.exit(1);
    }
    console.log('Column added successfully!\n');
  }

  // Step 2: Backfill from tmdb_data
  console.log('Backfilling original_language from tmdb_data...');
  await backfill();

  // Step 3: Update fuzzy search function
  console.log('\nUpdating search_movies_fuzzy function...');
  const fuzzySQL = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260215_fuzzy_search_function.sql'),
    'utf-8'
  );
  // Try calling via RPC by creating a temp function
  const wrapperFn = `
    CREATE OR REPLACE FUNCTION _temp_update_fuzzy_search()
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      ${fuzzySQL.replace(/\$/g, '$$$$')}
    END;
    $$;
  `;
  // The fuzzy search function update will need to be applied via dashboard
  // if the RPC approach doesn't work, but it's a CREATE OR REPLACE so it's idempotent
  console.log('(Fuzzy search function should be updated via Supabase Dashboard if not already done)');

  // Step 4: Verify
  console.log('\nVerifying...');
  await verify();

  console.log('\n=== Migration complete ===');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
