const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && !key.startsWith('#')) {
    const value = valueParts.join('=').trim();
    if (value) process.env[key.trim()] = value;
  }
});

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log('Clearing movies table...');

  // Delete all movies
  const { error: deleteError } = await supabase
    .from('movies')
    .delete()
    .neq('id', 'impossible-id'); // Delete all rows

  if (deleteError) {
    console.error('Delete error:', deleteError.message);
    return;
  }

  // Verify empty
  const { count } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true });

  console.log('Movies after clear:', count);
  console.log('\nNow run: node scripts/populateMovies.js');
}

main();
