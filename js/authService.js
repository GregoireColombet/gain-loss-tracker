import { supabaseClient, isSupabaseConfigured } from './supabaseClient.js';

export async function getCurrentSession() {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) return null;
  return data.session || null;
}

export async function getCurrentUser() {
  const currentSession = await getCurrentSession();
  return currentSession?.user || null;
}

export async function restoreSavedSession() {
  // Supabase restores the persisted localStorage session automatically.
  // This wrapper makes page initialization wait for that restored session before loading records.
  return getCurrentSession();
}

export function rememberLastLoginEmail(email) {
  localStorage.setItem('stock-tracker-last-login-email', email);
}

export function getRememberedLoginEmail() {
  return localStorage.getItem('stock-tracker-last-login-email') || '';
}

export async function sendLoginLink(email) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured yet. Fill in js/supabaseClient.js first.');
  }

  rememberLastLoginEmail(email);

  const redirectUrl = new URL(window.location.href);
  redirectUrl.hash = '';
  redirectUrl.search = '';

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl.toString(),
      shouldCreateUser: true
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
  const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
