import { loadInitialTransactions } from './storage.js';
import { onAuthStateChange, restoreSavedSession, getRememberedLoginEmail } from './authService.js';
import { hideMessage, showMessage } from './uiHelpers.js';
import { getErrorMessage } from './utils/dom.js';
import { refreshAuthenticationPanel as renderAuthenticationPanel, sendLoginLinkFromForm, signOutAndReloadData } from './ui/authPanel.js';
import { initializeAiAnalysisPanel, refreshAiCompanyOptions } from './ui/aiAnalysisPanel.js';
import { initializeAnalysisReportTable, refreshAnalysisReportTable } from './ui/analysisReportTable.js';

const authPanel = document.querySelector('#authPanel');
const authForm = document.querySelector('#authForm');
const authEmailInput = document.querySelector('#authEmail');
const authStatus = document.querySelector('#authStatus');
const signOutButton = document.querySelector('#signOutButton');
const messageBox = document.querySelector('#messageBox');

let transactions = [];

initializeAnalysisPage().catch(error => {
  showMessage(messageBox, `Analysis page startup failed: ${getErrorMessage(error)}`, 'error');
});

async function initializeAnalysisPage() {
  bindAnalysisPageEvents();
  prefillRememberedEmail();
  await restoreSavedSession();
  await updateAuthenticationPanel();

  onAuthStateChange(async () => {
    try {
      await updateAuthenticationPanel();
      transactions = await loadInitialTransactions();
      refreshAiCompanyOptions(transactions);
      await refreshAnalysisReportTable();
    } catch (error) {
      showMessage(messageBox, `Authentication refresh failed: ${getErrorMessage(error)}`, 'error');
    }
  });

  transactions = await loadInitialTransactions();
  initializeAnalysisReportTable();
  initializeAiAnalysisPanel({ getTransactions: () => transactions });
}

function bindAnalysisPageEvents() {
  authForm?.addEventListener('submit', event => sendLoginLinkFromForm(event, authEmailInput, messageBox));
  signOutButton?.addEventListener('click', handleSignOut);
}

function prefillRememberedEmail() {
  if (!authEmailInput) return;
  authEmailInput.value = getRememberedLoginEmail();
}

async function updateAuthenticationPanel() {
  await renderAuthenticationPanel({ authPanel, authForm, authStatus, signOutButton });
}

async function handleSignOut() {
  await signOutAndReloadData({
    loadData: loadInitialTransactions,
    refreshAuthPanel: updateAuthenticationPanel,
    afterSignOut: async reloadedTransactions => {
      transactions = reloadedTransactions;
      refreshAiCompanyOptions(transactions);
      await refreshAnalysisReportTable();
      hideMessage(messageBox);
    },
    messageBox
  });
}
