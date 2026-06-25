import { loadInitialTransactions, saveTransactions, exportTransactionsAsJson } from './storage.js';
import { createTransactionFromForm, validateTransactionSet } from './validation.js';
import { hideMessage, showMessage } from './uiHelpers.js';
import { getErrorMessage, setButtonProcessing } from './utils/dom.js';
import { createPageAuthController } from './app/pageAuthController.js';
import { bindLiveValidationCleanup, clearFormValidation, validateTransactionFormUi } from './ui/formValidation.js';
import { TRANSACTION_SORT_DIRECTIONS, TRANSACTION_SORT_FIELDS, renderTransactionTable as renderEditableTransactionTable } from './ui/editTransactionTable.js';
import { renderImpactDialog } from './ui/impactPreviewDialog.js';
import { initializeCommandPalette } from './ui/commandPalette.js';

const editForm = document.querySelector('#editForm');
const transactionTableBody = document.querySelector('#transactionTableBody');
const messageBox = document.querySelector('#messageBox');
const impactDialog = document.querySelector('#impactDialog');
const impactContent = document.querySelector('#impactContent');
const confirmImpactButton = document.querySelector('#confirmImpactButton');
const cancelImpactButton = document.querySelector('#cancelImpactButton');
const clearFormButton = document.querySelector('#clearFormButton');
const exportButton = document.querySelector('#exportButton');
const authPanel = document.querySelector('#authPanel');
const authForm = document.querySelector('#authForm');
const authEmailInput = document.querySelector('#authEmail');
const authStatus = document.querySelector('#authStatus');
const signOutButton = document.querySelector('#signOutButton');
const transactionSortFieldSelect = document.querySelector('#transactionSortField');
const transactionSortDirectionSelect = document.querySelector('#transactionSortDirection');
const transactionSortStatus = document.querySelector('#transactionSortStatus');
const sortableHeaderButtons = document.querySelectorAll('.column-sort-button');

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
    renderEditableTransactionRows();
  }
});

let transactions = [];
let pendingTransactionsAfterChange = null;
let pendingSuccessMessage = '';
let editEventsBound = false;
let transactionSortConfig = {
  field: TRANSACTION_SORT_FIELDS.DATE,
  direction: TRANSACTION_SORT_DIRECTIONS.DESC
};

initializeEditPage().catch(error => {
  showMessage(messageBox, `Edit page startup failed: ${getErrorMessage(error)}`, 'error');
});

async function initializeEditPage() {
  // Initialize authentication first so the sync bar never stays stuck when
  // optional edit-page UI wiring fails during future refactors.
  await pageAuthController.initialize();
  bindEditEvents();
  initializeCommandPalette(getEditCommandPaletteItems);
  transactions = await loadInitialTransactions();
  renderEditableTransactionRows();
}

window.addEventListener('pagehide', () => {
  pageAuthController.destroy();
});


function bindEditEvents() {
  if (editEventsBound) return;
  editEventsBound = true;

  editForm?.addEventListener('submit', handleEditFormSubmit);
  clearFormButton?.addEventListener('click', () => {
    clearEditForm();
    showMessage(messageBox, 'Form cleared.', 'info');
  });
  exportButton?.addEventListener('click', () => exportTransactionsAsJson(transactions));
  confirmImpactButton?.addEventListener('click', confirmPendingChange);
  cancelImpactButton?.addEventListener('click', cancelPendingChange);
  transactionSortFieldSelect?.addEventListener('change', handleSortFieldChange);
  transactionSortDirectionSelect?.addEventListener('change', handleSortDirectionChange);
  sortableHeaderButtons.forEach(button => button.addEventListener('click', handleSortableHeaderClick));
  bindLiveValidationCleanup(editForm);
}

function renderEditableTransactionRows() {
  syncSortControls();
  renderEditableTransactionTable(transactions, transactionTableBody, handleTableActionClick, transactionSortConfig);
}

function getSortDirectionLabel() {
  if (transactionSortConfig.field === TRANSACTION_SORT_FIELDS.COMPANY) {
    return transactionSortConfig.direction === TRANSACTION_SORT_DIRECTIONS.ASC ? 'A → Z' : 'Z → A';
  }

  return transactionSortConfig.direction === TRANSACTION_SORT_DIRECTIONS.ASC ? 'Oldest first' : 'Newest first';
}

function syncSortDirectionOptions() {
  if (!transactionSortDirectionSelect) return;

  const options = transactionSortConfig.field === TRANSACTION_SORT_FIELDS.COMPANY
    ? [
      { value: TRANSACTION_SORT_DIRECTIONS.ASC, label: 'A → Z' },
      { value: TRANSACTION_SORT_DIRECTIONS.DESC, label: 'Z → A' }
    ]
    : [
      { value: TRANSACTION_SORT_DIRECTIONS.DESC, label: 'Newest first' },
      { value: TRANSACTION_SORT_DIRECTIONS.ASC, label: 'Oldest first' }
    ];

  transactionSortDirectionSelect.innerHTML = options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join('');
  transactionSortDirectionSelect.value = transactionSortConfig.direction;
}

function syncSortableHeaders() {
  sortableHeaderButtons.forEach(button => {
    const headerCell = button.closest('th');
    const indicator = button.querySelector('.sort-indicator');
    const isActiveSortColumn = button.dataset.sortField === transactionSortConfig.field;

    if (!headerCell || !indicator) return;

    headerCell.setAttribute('aria-sort', isActiveSortColumn
      ? (transactionSortConfig.direction === TRANSACTION_SORT_DIRECTIONS.ASC ? 'ascending' : 'descending')
      : 'none');

    if (!isActiveSortColumn) {
      indicator.textContent = '↕';
      return;
    }

    if (transactionSortConfig.field === TRANSACTION_SORT_FIELDS.COMPANY) {
      indicator.textContent = transactionSortConfig.direction === TRANSACTION_SORT_DIRECTIONS.ASC ? 'A→Z' : 'Z→A';
      return;
    }

    indicator.textContent = transactionSortConfig.direction === TRANSACTION_SORT_DIRECTIONS.ASC ? '↑' : '↓';
  });
}

function syncSortControls() {
  if (transactionSortFieldSelect) transactionSortFieldSelect.value = transactionSortConfig.field;
  syncSortDirectionOptions();
  syncSortableHeaders();
  if (transactionSortStatus) {
    const fieldLabel = transactionSortConfig.field === TRANSACTION_SORT_FIELDS.COMPANY ? 'Company' : 'Date';
    transactionSortStatus.textContent = `Sorted by ${fieldLabel}, ${getSortDirectionLabel()}.`;
  }
}

function handleSortFieldChange(event) {
  const nextField = event.target.value;
  transactionSortConfig = {
    field: nextField,
    direction: nextField === TRANSACTION_SORT_FIELDS.COMPANY
      ? TRANSACTION_SORT_DIRECTIONS.ASC
      : TRANSACTION_SORT_DIRECTIONS.DESC
  };
  renderEditableTransactionRows();
}

function handleSortDirectionChange(event) {
  transactionSortConfig = {
    ...transactionSortConfig,
    direction: event.target.value
  };
  renderEditableTransactionRows();
}

function handleSortableHeaderClick(event) {
  const selectedField = event.currentTarget.dataset.sortField;
  const isCurrentField = selectedField === transactionSortConfig.field;

  transactionSortConfig = {
    field: selectedField,
    direction: isCurrentField
      ? (transactionSortConfig.direction === TRANSACTION_SORT_DIRECTIONS.ASC ? TRANSACTION_SORT_DIRECTIONS.DESC : TRANSACTION_SORT_DIRECTIONS.ASC)
      : (selectedField === TRANSACTION_SORT_FIELDS.COMPANY ? TRANSACTION_SORT_DIRECTIONS.ASC : TRANSACTION_SORT_DIRECTIONS.DESC)
  };
  renderEditableTransactionRows();
}

function handleTableActionClick(event) {
  const actionButton = event.target.closest('button');
  if (!actionButton) return;

  const transactionId = actionButton.dataset.id;
  const action = actionButton.dataset.action;

  if (action === 'edit') fillEditForm(transactionId);
  if (action === 'delete') requestDeleteTransaction(transactionId);
}

function fillEditForm(transactionId) {
  const transaction = transactions.find(item => item.id === transactionId);
  if (!transaction) {
    showMessage(messageBox, 'Unable to edit: transaction was not found. Refresh the page and try again.', 'error');
    return;
  }

  editForm.transactionId.value = transaction.id;
  editForm.type.value = transaction.type;
  editForm.companyName.value = transaction.companyName;
  editForm.ticker.value = transaction.ticker;
  editForm.date.value = transaction.date;
  editForm.sharePrice.value = transaction.sharePrice;
  editForm.quantity.value = transaction.quantity;
  editForm.transactionFee.value = transaction.transactionFee;
  editForm.createdAt.value = transaction.createdAt || new Date().toISOString();
}

function clearEditForm() {
  editForm.reset();
  editForm.transactionId.value = '';
  editForm.createdAt.value = '';
  clearFormValidation(editForm);
}

function handleEditFormSubmit(event) {
  event.preventDefault();
  hideMessage(messageBox);

  const editedTransaction = createTransactionFromForm(editForm);
  const existingTransactionId = editForm.transactionId.value;
  const existingTransaction = transactions.find(transaction => transaction.id === existingTransactionId);
  if (existingTransaction) {
    editedTransaction.createdAt = existingTransaction.createdAt || editedTransaction.createdAt;
  }

  if (validateTransactionFormUi(editForm, editedTransaction, transactions, existingTransactionId, messageBox)) return;

  const newTransactions = existingTransactionId
    ? transactions.map(transaction => transaction.id === existingTransactionId ? editedTransaction : transaction)
    : [...transactions, editedTransaction];

  openImpactDialog(transactions, newTransactions, existingTransactionId ? 'Modification' : 'New transaction');
}

function requestDeleteTransaction(transactionId) {
  const transactionToDelete = transactions.find(transaction => transaction.id === transactionId);
  if (!transactionToDelete) {
    showMessage(messageBox, 'Unable to delete: transaction was not found. Refresh the page and try again.', 'error');
    return;
  }

  const userConfirmed = confirm(`Delete this transaction?\n${transactionToDelete.type} ${transactionToDelete.ticker} on ${transactionToDelete.date}`);
  if (!userConfirmed) return;

  const newTransactions = transactions.filter(transaction => transaction.id !== transactionId);
  const errors = validateTransactionSet(newTransactions);

  if (errors.length) {
    showMessage(
      messageBox,
      `Deletion canceled because it would create invalid later transaction(s). ${errors.join(' ')}`,
      'error'
    );
    return;
  }

  openImpactDialog(transactions, newTransactions, 'Deletion');
}

function openImpactDialog(oldTransactions, newTransactions, actionLabel) {
  pendingTransactionsAfterChange = newTransactions;
  pendingSuccessMessage = `${actionLabel} saved successfully.`;
  renderImpactDialog({ oldTransactions, newTransactions, actionLabel, impactDialog, impactContent });
}

async function confirmPendingChange() {
  if (!pendingTransactionsAfterChange) {
    showMessage(messageBox, 'No pending change to save.', 'error');
    return;
  }
  setButtonProcessing(confirmImpactButton, true, 'Saving...');
  transactions = pendingTransactionsAfterChange;
  try {
    await saveTransactions(transactions);
    pendingTransactionsAfterChange = null;
    impactDialog.close();
    clearEditForm();
    renderEditableTransactionRows();
    showMessage(messageBox, pendingSuccessMessage, 'success');
  } catch (error) {
    transactions = await loadInitialTransactions();
    showMessage(messageBox, `Unable to save records. Records were reloaded. ${getErrorMessage(error)}`, 'error');
  } finally {
    setButtonProcessing(confirmImpactButton, false);
  }
}

function cancelPendingChange() {
  pendingTransactionsAfterChange = null;
  impactDialog.close();
  showMessage(messageBox, 'Change canceled. Records were not modified.', 'info');
}


function getEditCommandPaletteItems() {
  return transactions.map(transaction => ({
    title: `${transaction.companyName || transaction.ticker} (${transaction.ticker})`,
    subtitle: `${transaction.type} ${transaction.date} · edit transaction`,
    action: () => {
      const rowButton = document.querySelector(`[data-action="edit"][data-id="${transaction.id}"]`);
      rowButton?.click();
    }
  }));
}
