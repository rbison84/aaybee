/**
 * Run database migration to add new columns to movies table
 *
 * Usage: node scripts/runMigration.js
 *
 * Prerequisites:
 * - Add SUPABASE_DB_URL to .env (get from Supabase Dashboard > Settings > Database)
 * - Or run the SQL manually in Supabase Dashboard > SQL Editor
 */

const { Client } = require('pg');
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
} catch (e) {
  console.error('Failed to load .env:', e.message);
  process.exit(1);
}

const MIGRATION_SQL = `
-- Add missing columns to movies table for comprehensive tier system

-- Add tmdb_id for easy reference
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_id INTEGER;

-- Add voting stats for tier calculation
ALTER TABLE movies ADD COLUMN IF NOT EXISTS vote_count INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS vote_average NUMERIC(3,1) DEFAULT 0;

-- Add tier (1-4) computed from vote_count ranking
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tier INTEGER DEFAULT 1;

-- Add poster path (TMDb's path, not full URL)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS poster_path TEXT;

-- Add collection/franchise info for tier grouping
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_id INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS collection_name TEXT;

-- Add director info
ALTER TABLE movies ADD COLUMN IF NOT EXISTS director_name TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS director_id INTEGER;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_tier ON movies(tier);
CREATE INDEX IF NOT EXISTS idx_movies_vote_count ON movies(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_movies_collection_id ON movies(collection_id);
`;

async function runWithPg() {
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    return false;
  }

  console.log('Connecting to Supabase PostgreSQL...');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected! Running migration...\n');

    await client.query(MIGRATION_SQL);

    console.log('Migration completed successfully!');

    // Verify columns
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'movies' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    console.log('\nCurrent movies table columns:');
    result.rows.forEach(row => console.log(`  - ${row.column_name}`));

    await client.end();
    return true;
  } catch (error) {
    console.error('Migration failed:', error.message);
    await client.end().catch(() => {});
    return false;
  }
}

async function main() {
  console.log('===========================================');
  console.log('MIGRATION: Add movie tier fields');
  console.log('===========================================\n');

  const success = await runWithPg();

  if (!success) {
    console.log('SUPABASE_DB_URL not found in .env');
    console.log('');
    console.log('Option 1: Add SUPABASE_DB_URL to .env');
    console.log('  Get it from: Supabase Dashboard > Project Settings > Database');
    console.log('  Format: postgresql://postgres.PROJECT-REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres');
    console.log('');
    console.log('Option 2: Run this SQL manually in Supabase Dashboard > SQL Editor:');
    console.log('-------------------------------------------');
    console.log(MIGRATION_SQL);
    console.log('-------------------------------------------');
  }

  console.log('\n===========================================');
  console.log('After migration, run: node scripts/populateMovies.js');
  console.log('===========================================');
}

main().catch(console.error);
