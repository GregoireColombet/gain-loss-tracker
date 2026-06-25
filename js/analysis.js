import { loadInitialTransactions } from './storage.js';
import { showMessage } from './uiHelpers.js';
import { getErrorMessage } from './utils/dom.js';
import { createPageAuthController } from './app/pageAuthController.js';
import { initializeAiAnalysisPanel, refreshAiCompanyOptions } from './ui/aiAnalysisPanel.js';
import { initializeAnalysisReportTable, refreshAnalysisReportTable } from './ui/analysisReportTable.js';
import { initializePromptEditor } from './ui/promptEditor.js';

const authPanel = document.querySelector('#authPanel');
const authForm = document.querySelector('#authForm');
const authEmailInput = document.querySelector('#authEmail');
const authStatus = document.querySelector('#authStatus');
const signOutButton = document.querySelector('#signOutButton');
const messageBox = document.querySelector('#messageBox');

const pageAuthController = createPageAuthController({
  authPanel,
  authForm,
  authEmailInput,
  authStatus,
  signOutButton,
  messageBox,
  loadData: loadInitialTransactions,
  onDataReloaded: async reloadedTransactions => {
    transactions = reloadedTransactions;
    refreshAiCompanyOptions(transactions);
    await refreshAnalysisReportTable();
  }
});

let transactions = [];

initializeAnalysisPage().catch(error => {
  showMessage(messageBox, `Analysis page startup failed: ${getErrorMessage(error)}`, 'error');
});

async function initializeAnalysisPage() {
  await pageAuthController.initialize();
  transactions = await loadInitialTransactions();
  initializeAnalysisReportTable();
  await initializePromptEditor();
  await initializeAiAnalysisPanel({ getTransactions: () => transactions });
}

window.addEventListener('pagehide', () => {
  pageAuthController.destroy();
});
