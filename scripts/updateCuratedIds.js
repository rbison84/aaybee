const fs = require('fs');

// Read the current tmdb.ts
const tmdbPath = 'src/services/tmdb.ts';
const content = fs.readFileSync(tmdbPath, 'utf-8');

// Read the new IDs
const newIds = JSON.parse(fs.readFileSync('scripts/final_curated_ids.json', 'utf-8'));

// Find the start of the comment before CURATED_MOVIE_IDS
const startPattern = /\/\/ ~1800\+ movies[^\n]*\n\/\/ Note:[^\n]*\nexport const CURATED_MOVIE_IDS = \[[\s\S]*?\];/;
const match = content.match(startPattern);

if (!match) {
  console.error('Could not find CURATED_MOVIE_IDS array');
  process.exit(1);
}

// Build new array content
const today = new Date().toISOString().split('T')[0];
const newArrayContent = `// 1278 curated movies: Top 1000 all-time + Top 200 per decade (1000+ votes)
// Ranked by weighted score: rating * log10(votes)
// Generated: ${today}
export const CURATED_MOVIE_IDS = [
  ${newIds.join(',\n  ')},
];`;

// Replace in content
const newContent = content.replace(startPattern, newArrayContent);

fs.writeFileSync(tmdbPath, newContent);
console.log('Updated CURATED_MOVIE_IDS with ' + newIds.length + ' movies');

// Verify
const verify = fs.readFileSync(tmdbPath, 'utf-8');
const verifyMatch = verify.match(/CURATED_MOVIE_IDS = \[([\s\S]*?)\];/);
const count = verifyMatch ? verifyMatch[1].match(/\d+/g).length : 0;
console.log('Verified: ' + count + ' IDs in file');
