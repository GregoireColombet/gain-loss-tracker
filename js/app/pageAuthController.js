import { getRememberedLoginEmail, onAuthStateChange, restoreSavedSession } from '../authService.js';
import { hideMessage, showMessage } from '../uiHelpers.js';
import { getErrorMessage } from '../utils/dom.js';
import { refreshAuthenticationPanel, sendLoginLinkFromForm, signOutAndReloadData } from '../ui/authPanel.js';

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

  function prefillRememberedEmail() {
    if (authEmailInput) authEmailInput.value = getRememberedLoginEmail();
  }

  async function updateAuthenticationPanel() {
    await refreshAuthenticationPanel({ authPanel, authForm, authStatus, signOutButton });
  }

  async function handleAuthChange() {
    try {
      await updateAuthenticationPanel();
      const reloadedData = await loadData();
      await onDataReloaded(reloadedData);
    } catch (error) {
      showMessage(messageBox, `${onAuthErrorMessage}: ${getErrorMessage(error)}`, 'error');
    }
  }

  async function handleSignOut() {
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
    bindEventsOnce();
    prefillRememberedEmail();
    await restoreSavedSession();
    await updateAuthenticationPanel();

    if (!authListenerSubscription) {
      authListenerSubscription = onAuthStateChange(handleAuthChange);
    }
  }

  function destroy() {
    if (authListenerSubscription) {
      authListenerSubscription();
      authListenerSubscription = null;
    }
  }

  return {
    initialize,
    updateAuthenticationPanel,
    prefillRememberedEmail,
    destroy
  };
}
