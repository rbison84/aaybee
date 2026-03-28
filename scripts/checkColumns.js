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
  const { data, error } = await supabase.from('movies').select('*').limit(1);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Current columns in movies table:');
    Object.keys(data[0]).forEach(col => console.log(`  - ${col}`));
  } else {
    // Try to get column info from an empty query
    const { data: empty, error: emptyError } = await supabase.from('movies').select('id, title, collection_id, tier').limit(0);
    if (emptyError) {
      console.log('Missing columns error:', emptyError.message);
    } else {
      console.log('Query worked, columns may exist');
    }
  }
}

main();
