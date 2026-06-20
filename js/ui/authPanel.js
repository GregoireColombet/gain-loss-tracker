import { getCurrentUser, sendLoginLink, signOutUser } from '../authService.js';
import { isSupabaseConfigured } from '../supabaseClient.js';
import { showMessage } from '../uiHelpers.js';
import { getErrorMessage } from '../utils/dom.js';

export async function refreshAuthenticationPanel({ authPanel, authForm, authStatus, signOutButton }) {
  if (!authPanel) return;

  if (!isSupabaseConfigured()) {
    authStatus.textContent = 'Supabase is not configured yet. The app is using localStorage.';
    authForm.hidden = true;
    signOutButton.hidden = true;
    return;
  }

  const currentUser = await getCurrentUser();
  if (currentUser) {
    authStatus.textContent = `Automatically connected as ${currentUser.email}. Transactions sync to Supabase.`;
    authForm.hidden = true;
    signOutButton.hidden = false;
  } else {
    authStatus.textContent = 'No saved session found. Enter your email once; future visits will connect automatically on this browser.';
    authForm.hidden = false;
    signOutButton.hidden = true;
  }
}

export async function sendLoginLinkFromForm(event, authEmailInput, messageBox) {
  event.preventDefault();
  const email = authEmailInput.value.trim();
  if (!email) return;
  try {
    await sendLoginLink(email);
    showMessage(messageBox, 'Login link sent. Check your email. After you open the link, this browser will remember your session automatically.', 'success');
  } catch (error) {
    showMessage(messageBox, error.message, 'error');
  }
}

export async function signOutAndReloadData({ loadData, refreshAuthPanel, afterSignOut, messageBox }) {
  try {
    await signOutUser();
    const reloadedData = await loadData();
    await refreshAuthPanel();
    await afterSignOut(reloadedData);
    showMessage(messageBox, 'Signed out successfully.', 'success');
  } catch (error) {
    showMessage(messageBox, `Logout failed: ${getErrorMessage(error)}`, 'error');
  }
}
