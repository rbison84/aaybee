/**
 * Populate MPAA certification for movies from TMDB
 * Run: npx ts-node scripts/populateCertifications.ts
 *
 * First add the column to Supabase:
 * ALTER TABLE movies ADD COLUMN IF NOT EXISTS certification TEXT;
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TMDB_API_TOKEN = process.env.EXPO_PUBLIC_TMDB_API_TOKEN!;
const TMDB_BASE = 'https://api.themoviedb.org/3';

interface ReleaseDate {
  certification: string;
  type: number; // 3 = theatrical
}

interface ReleaseDateResult {
  iso_3166_1: string;
  release_dates: ReleaseDate[];
}

async function getCertification(tmdbId: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}/release_dates`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_API_TOKEN}`,
        },
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const results: ReleaseDateResult[] = data.results || [];

    // Find US release
    const usRelease = results.find(r => r.iso_3166_1 === 'US');
    if (!usRelease) return null;

    // Prefer theatrical (type 3), then any with certification
    const theatrical = usRelease.release_dates.find(
      r => r.type === 3 && r.certification
    );
    if (theatrical?.certification) return theatrical.certification;

    const any = usRelease.release_dates.find(r => r.certification);
    return any?.certification || null;
  } catch {
    return null;
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function populateCertifications() {
  console.log('Fetching movies without certification...\n');

  // Get movies with tmdb_id but no certification
  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, tmdb_id, title, year')
    .not('tmdb_id', 'is', null)
    .is('certification', null)
    .order('year', { ascending: false });

  if (error) {
    console.error('Failed to fetch movies:', error.message);
    return;
  }

  console.log(`Found ${movies?.length || 0} movies to process\n`);

  let updated = 0;
  let failed = 0;

  for (const movie of movies || []) {
    const cert = await getCertification(movie.tmdb_id);

    if (cert) {
      const { error: updateError } = await supabase
        .from('movies')
        .update({ certification: cert })
        .eq('id', movie.id);

      if (updateError) {
        console.error(`❌ ${movie.title}: ${updateError.message}`);
        failed++;
      } else {
        console.log(`✅ ${movie.title} (${movie.year}): ${cert}`);
        updated++;
      }
    } else {
      console.log(`⏭️  ${movie.title} (${movie.year}): No US certification`);
    }

    // Rate limit: TMDB allows 40 requests/10s
    await sleep(300);
  }

  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
}

populateCertifications().catch(console.error);
