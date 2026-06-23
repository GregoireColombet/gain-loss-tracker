import { getCurrentUser, sendLoginLink, signOutUser } from '../authService.js';
import { isSupabaseConfigured } from '../supabaseClient.js';
import { showMessage } from '../uiHelpers.js';
import { getErrorMessage } from '../utils/dom.js';
import { updateVersionElement } from '../config/version.js';

const STATUS_CLASS_NAMES = [
  'sync-bar--checking',
  'sync-bar--connected',
  'sync-bar--disconnected',
  'sync-bar--local',
  'sync-bar--error'
];


async function updateVersionLabel(authPanel) {
  const versionElement = authPanel?.querySelector('[data-app-version]');
  await updateVersionElement(versionElement);
}

function setSyncStatus(authPanel, authStatus, status, text) {
  if (!authPanel || !authStatus) return;
  authPanel.classList.remove(...STATUS_CLASS_NAMES);
  authPanel.classList.add(`sync-bar--${status}`);
  authStatus.textContent = text;
}

export async function refreshAuthenticationPanel({ authPanel, authForm, authStatus, signOutButton }) {
  if (!authPanel) return;
  await updateVersionLabel(authPanel);

  setSyncStatus(authPanel, authStatus, 'checking', 'Checking sync status...');

  if (!isSupabaseConfigured()) {
    setSyncStatus(authPanel, authStatus, 'local', 'Local only · Supabase not configured');
    if (authForm) authForm.hidden = true;
    if (signOutButton) signOutButton.hidden = true;
    return;
  }

  try {
    const currentUser = await getCurrentUser();

    if (currentUser) {
      setSyncStatus(authPanel, authStatus, 'connected', `Connected · ${currentUser.email}`);
      if (authForm) authForm.hidden = true;
      if (signOutButton) signOutButton.hidden = false;
      return;
    }

    setSyncStatus(authPanel, authStatus, 'disconnected', 'Not connected');
    if (authForm) authForm.hidden = false;
    if (signOutButton) signOutButton.hidden = true;
  } catch (error) {
    setSyncStatus(authPanel, authStatus, 'error', `Sync error · ${getErrorMessage(error)}`);
    if (authForm) authForm.hidden = false;
    if (signOutButton) signOutButton.hidden = true;
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
