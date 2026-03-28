const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && line[0] !== '#') process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  // Test fuzzy search
  const { data, error } = await client.rpc('search_movies_fuzzy', {
    search_query: 'dark nite',
    result_limit: 5,
  });
  if (error) {
    console.log('SEARCH FAILED:', error);
  } else {
    console.log('Search for "dark nite" returned:');
    data.forEach(m => console.log(' ', m.title, `(${m.year})`, '| lang:', m.original_language));
  }

  // Test original_language column
  const { data: langData, error: langErr } = await client
    .from('movies')
    .select('original_language')
    .not('original_language', 'is', null)
    .limit(1);
  if (langErr) console.log('LANGUAGE COLUMN FAILED:', langErr);
  else console.log('\noriginal_language column works:', langData.length > 0 ? 'YES' : 'NO');
}
test();
