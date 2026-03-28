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
  console.log('Checking user_movies table...\n');

  // Try to get one row to see columns
  const { data, error } = await supabase
    .from('user_movies')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in user_movies:');
    Object.keys(data[0]).forEach(col => {
      console.log(`  - ${col}: ${typeof data[0][col]} (${data[0][col]})`);
    });
  } else {
    console.log('No data in user_movies, trying insert test...');

    // Get a movie ID
    const { data: movies } = await supabase.from('movies').select('id').limit(1);
    const { data: users } = await supabase.auth.admin.listUsers();

    if (movies?.length && users?.users?.length) {
      const testInsert = {
        user_id: users.users[0].id,
        movie_id: movies[0].id,
        beta: 1200,
        status: 'known',
        total_comparisons: 5,
        wins: 3,
        losses: 2,
      };

      console.log('Test insert:', testInsert);

      const { data: inserted, error: insertError } = await supabase
        .from('user_movies')
        .upsert(testInsert, { onConflict: 'user_id,movie_id' })
        .select();

      if (insertError) {
        console.error('Insert error:', insertError.message);
        console.error('Full error:', JSON.stringify(insertError, null, 2));
      } else {
        console.log('Insert success:', inserted);
      }
    }
  }
}

main().catch(console.error);
