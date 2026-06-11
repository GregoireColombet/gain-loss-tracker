import { supabaseClient, isSupabaseConfigured } from './supabaseClient.js';

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data.user || null;
}

export async function sendLoginLink(email) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured yet. Fill in js/supabaseClient.js first.');
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) throw error;
}

export async function signOutUser() {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = supabaseClient.auth.onAuthStateChange(() => callback());
  return () => data.subscription.unsubscribe();
}
