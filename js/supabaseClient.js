import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1) Create a Supabase project.
// 2) Copy Project URL and anon public key here.
// The anon key is designed to be public in browser apps. Keep the service_role key private and never put it here.
export const SUPABASE_URL = "https://wetqkbqvrosripahngni.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldHFrYnF2cm9zcmlwYWhuZ25pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDMyODAsImV4cCI6MjA5NjcxOTI4MH0.VBJWRyXsmcT3v8bu5mI6IEjI5dLlsvLgoHG-G9OusU0";

export function isSupabaseConfigured() {
  return (
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_ANON_KEY.startsWith("PASTE_")
  );
}

export const supabaseClient = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: "stock-tracker-supabase-session",
      },
    })
  : null;
