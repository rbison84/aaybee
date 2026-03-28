import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

if (supabaseAnonKey && (supabaseAnonKey.startsWith('sb_secret_') || supabaseAnonKey.includes('service_role'))) {
  console.error(
    '[Supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY contains a secret/service key. ' +
    'Replace it with the anon/public key from Supabase Dashboard > Settings > API.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important for React Native
  },
});

// Type exports for convenience
export type { User, Session } from '@supabase/supabase-js';
