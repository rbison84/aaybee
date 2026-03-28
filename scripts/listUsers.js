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
  console.log('Fetching all users...\n');

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data.users.length === 0) {
    console.log('No users found in database.');
    console.log('\nYou need to sign up in the app first before running seed:friends');
  } else {
    console.log(`Found ${data.users.length} user(s):\n`);
    data.users.forEach(u => {
      console.log(`  Email: ${u.email}`);
      console.log(`  ID: ${u.id}`);
      console.log(`  Created: ${u.created_at}`);
      console.log('');
    });
  }
}

main().catch(console.error);
