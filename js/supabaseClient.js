import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1) Create a Supabase project.
// 2) Copy Project URL and anon public key here.
// The anon key is designed to be public in browser apps. Keep the service_role key private and never put it here.
export const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
export const SUPABASE_ANON_KEY = 'PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE';

export function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
}

export const supabaseClient = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'stock-tracker-supabase-session'
      }
    })
  : null;
