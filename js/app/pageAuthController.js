import { getRememberedLoginEmail, onAuthStateChange, restoreSavedSession } from '../authService.js';
import { hideMessage, showMessage } from '../uiHelpers.js';
import { getErrorMessage } from '../utils/dom.js';
import { refreshAuthenticationPanel, sendLoginLinkFromForm, signOutAndReloadData } from '../ui/authPanel.js';

/**
 * Shared page authentication controller used by Dashboard, Edit and Analysis.
 *
 * Responsibilities:
 * - bind the login/logout UI only once
 * - restore the persisted Supabase session before page data loads
 * - keep the slim sync bar out of the permanent "Checking" state
 * - register a single auth listener and ignore stale overlapping reloads
 * - expose a destroy hook for browser page-cache/navigation cleanup
 */
export function createPageAuthController({
  authPanel,
  authForm,
  authEmailInput,
  authStatus,
  signOutButton,
  messageBox,
  loadData,
  onDataReloaded,
  onAuthErrorMessage = 'Authentication refresh failed'
}) {
  let authListenerSubscription = null;
  let eventsBound = false;
  let initialized = false;
  let activeReloadId = 0;

  function prefillRememberedEmail() {
    if (authEmailInput) authEmailInput.value = getRememberedLoginEmail();
  }

  async function updateAuthenticationPanel() {
    await refreshAuthenticationPanel({ authPanel, authForm, authStatus, signOutButton });
  }

  async function reloadPageDataAfterAuthChange() {
    const reloadId = ++activeReloadId;

    try {
      await updateAuthenticationPanel();
      const reloadedData = await loadData();

      // Avoid rendering stale results when multiple auth/session events arrive quickly.
      if (reloadId !== activeReloadId) return;

      await onDataReloaded(reloadedData);
    } catch (error) {
      await updateAuthenticationPanel().catch(() => {});
      showMessage(messageBox, `${onAuthErrorMessage}: ${getErrorMessage(error)}`, 'error');
    }
  }

  function scheduleAuthReload() {
    // Keep Supabase's auth callback lightweight and avoid overlapping synchronous work.
    window.setTimeout(() => {
      reloadPageDataAfterAuthChange();
    }, 0);
  }

  async function handleSignOut() {
    activeReloadId += 1;

    await signOutAndReloadData({
      messageBox,
      loadData,
      refreshAuthPanel: updateAuthenticationPanel,
      afterSignOut: async reloadedData => {
        await onDataReloaded(reloadedData);
        hideMessage(messageBox);
      }
    });
  }

  function bindEventsOnce() {
    if (eventsBound) return;
    eventsBound = true;
    authForm?.addEventListener('submit', event => sendLoginLinkFromForm(event, authEmailInput, messageBox));
    signOutButton?.addEventListener('click', handleSignOut);
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;

    bindEventsOnce();
    prefillRememberedEmail();

    try {
      await restoreSavedSession();
    } catch (error) {
      // Session restoration should never block the page UI. The panel refresh below
      // will show local/error state if Supabase is unavailable.
      showMessage(messageBox, `Session restore failed: ${getErrorMessage(error)}`, 'error');
    }

    await updateAuthenticationPanel();

    if (!authListenerSubscription) {
      authListenerSubscription = onAuthStateChange(scheduleAuthReload);
    }
  }

  function destroy() {
    if (authListenerSubscription) {
      authListenerSubscription();
      authListenerSubscription = null;
    }
    initialized = false;
    activeReloadId += 1;
  }

  return {
    initialize,
    updateAuthenticationPanel,
    prefillRememberedEmail,
    destroy
  };
}
