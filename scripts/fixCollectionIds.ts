/**
 * Fix missing collection_id for franchise movies in Supabase
 * Run: npx ts-node scripts/fixCollectionIds.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Need service role for updates
);

// TMDB collection IDs for major franchises
const FRANCHISES: Record<string, { collectionId: number; pattern: string }> = {
  'Harry Potter': { collectionId: 1241, pattern: '%Harry Potter%' },
  'Lord of the Rings': { collectionId: 119, pattern: '%Lord of the Rings%' },
  'The Hobbit': { collectionId: 121938, pattern: '%Hobbit%' },
  'Star Wars': { collectionId: 10, pattern: '%Star Wars%' },
  'Avengers': { collectionId: 86311, pattern: '%Avengers%' },
  'Iron Man': { collectionId: 131292, pattern: '%Iron Man%' },
  'Captain America': { collectionId: 131295, pattern: '%Captain America%' },
  'Thor': { collectionId: 131296, pattern: '%Thor%' },
  'Spider-Man MCU': { collectionId: 531241, pattern: '%Spider-Man%Home%' },
  'Toy Story': { collectionId: 10194, pattern: '%Toy Story%' },
  'The Dark Knight': { collectionId: 263, pattern: '%Dark Knight%' },
  'Pirates of the Caribbean': { collectionId: 295, pattern: '%Pirates of the Caribbean%' },
  'Jurassic Park': { collectionId: 328, pattern: '%Jurassic%' },
  'Fast & Furious': { collectionId: 9485, pattern: '%Fast%Furious%' },
  'Transformers': { collectionId: 8650, pattern: '%Transformers%' },
  'Mission Impossible': { collectionId: 87359, pattern: '%Mission%Impossible%' },
  'Matrix': { collectionId: 2344, pattern: '%Matrix%' },
  'Back to the Future': { collectionId: 264, pattern: '%Back to the Future%' },
  'Indiana Jones': { collectionId: 84, pattern: '%Indiana Jones%' },
  'Shrek': { collectionId: 2150, pattern: '%Shrek%' },
  'Despicable Me': { collectionId: 86066, pattern: '%Despicable Me%' },
  'Frozen': { collectionId: 386382, pattern: '%Frozen%' },
  'Finding Nemo': { collectionId: 137697, pattern: '%Finding%Nemo%' },
  'The Incredibles': { collectionId: 468222, pattern: '%Incredibles%' },
  'Batman': { collectionId: 263, pattern: '%Batman%' },
  'X-Men': { collectionId: 748, pattern: '%X-Men%' },
  'Hunger Games': { collectionId: 131635, pattern: '%Hunger Games%' },
  'Twilight': { collectionId: 33514, pattern: '%Twilight%' },
  'John Wick': { collectionId: 404609, pattern: '%John Wick%' },
  'Guardians of the Galaxy': { collectionId: 284433, pattern: '%Guardians of the Galaxy%' },
};

async function fixCollectionIds() {
  console.log('Fixing collection IDs for franchise movies...\n');

  for (const [name, { collectionId, pattern }] of Object.entries(FRANCHISES)) {
    const { data, error } = await supabase
      .from('movies')
      .update({ collection_id: collectionId, collection_name: name })
      .ilike('title', pattern)
      .is('collection_id', null)
      .select('id, title');

    if (error) {
      console.error(`❌ ${name}: ${error.message}`);
    } else if (data?.length) {
      console.log(`✅ ${name} (${collectionId}): Updated ${data.length} movies`);
      data.forEach(m => console.log(`   - ${m.title}`));
    } else {
      console.log(`⏭️  ${name}: No movies needed updating`);
    }
  }

  console.log('\nDone!');
}

fixCollectionIds().catch(console.error);
