#!/usr/bin/env node
/**
 * Run the Group Decide migration
 * Usage: node scripts/run-migration.js
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mudhuegqmvlibsutbbqh.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11ZGh1ZWdxbXZsaWJzdXRiYnFoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU2NTU5OSwiZXhwIjoyMDg1MTQxNTk5fQ.p3ztxTCnXQvc8TfJjJ10s9CyNp46dNOk6JuAAx7ztTE';

// Read the migration SQL
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20240205_group_decide.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

// Split into individual statements
const statements = sql
  .split(/;\s*$/m)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

async function runMigration() {
  console.log('Running Group Decide migration...\n');

  // We need to use the Management API for DDL statements
  // Since we don't have an access token, we'll output instructions
  console.log('='.repeat(60));
  console.log('MANUAL MIGRATION REQUIRED');
  console.log('='.repeat(60));
  console.log('\nThe Supabase CLI is not linked. Please run the migration manually:\n');
  console.log('1. Go to https://supabase.com/dashboard/project/mudhuegqmvlibsutbbqh/sql/new');
  console.log('2. Copy the contents of: supabase/migrations/20240205_group_decide.sql');
  console.log('3. Paste into the SQL Editor and click "Run"\n');
  console.log('Or use this command to copy the SQL to clipboard:');
  console.log('  cat supabase/migrations/20240205_group_decide.sql | clip\n');
  console.log('='.repeat(60));

  // Also output the SQL for easy copy
  console.log('\n--- SQL MIGRATION CONTENT ---\n');
  console.log(sql);
}

runMigration().catch(console.error);
