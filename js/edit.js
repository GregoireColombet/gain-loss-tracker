import { calculatePortfolioFromTransactions, createImpactPreview } from './calculations.js';
import { loadInitialTransactions, saveTransactions, exportTransactionsAsJson } from './storage.js';
import { createTransactionFromForm, validateTransaction, validateTransactionSet } from './validation.js';
import { getCurrentUser, sendLoginLink, signOutUser, onAuthStateChange, restoreSavedSession, getRememberedLoginEmail } from './authService.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { formatMoney, formatQuantity, getGainLossClass, showMessage, hideMessage } from './uiHelpers.js';

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

let transactions = [];
let pendingTransactionsAfterChange = null;
let pendingSuccessMessage = '';


function setButtonProcessing(buttonElement, isProcessing, processingText = 'Saving...') {
  if (!buttonElement) return;
  if (isProcessing) {
    buttonElement.dataset.originalText = buttonElement.textContent;
    buttonElement.textContent = processingText;
    buttonElement.disabled = true;
    return;
  }
  buttonElement.textContent = buttonElement.dataset.originalText || buttonElement.textContent;
  buttonElement.disabled = false;
  delete buttonElement.dataset.originalText;
}

function clearFieldError(fieldElement) {
  if (!fieldElement) return;
  fieldElement.classList.remove('input-error');
  fieldElement.removeAttribute('aria-invalid');
  const labelElement = fieldElement.closest('label');
  const errorElement = labelElement?.querySelector('.field-error-message');
  errorElement?.remove();
}

function setFieldError(fieldElement, message) {
  if (!fieldElement) return;
  fieldElement.classList.add('input-error');
  fieldElement.setAttribute('aria-invalid', 'true');
  const labelElement = fieldElement.closest('label');
  if (!labelElement) return;
  let errorElement = labelElement.querySelector('.field-error-message');
  if (!errorElement) {
    errorElement = document.createElement('span');
    errorElement.className = 'field-error-message';
    labelElement.appendChild(errorElement);
  }
  errorElement.textContent = message;
}

function clearFormValidation(formElement) {
  if (!formElement) return;
  formElement.querySelectorAll('.input-error').forEach(clearFieldError);
  formElement.querySelectorAll('.field-error-message').forEach(element => element.remove());
}

function bindLiveValidationCleanup(formElement) {
  if (!formElement) return;
  formElement.addEventListener('input', event => {
    if (event.target.matches('input, select')) clearFieldError(event.target);
  });
  formElement.addEventListener('change', event => {
    if (event.target.matches('input, select')) clearFieldError(event.target);
  });
}

function scrollToFirstInvalidField(formElement) {
  const firstInvalidField = formElement?.querySelector('.input-error');
  firstInvalidField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  firstInvalidField?.focus({ preventScroll: true });
}

function getRequiredTransactionFieldErrors(formElement) {
  const fieldErrors = [];
  const requiredFields = [
    { field: formElement?.elements.type, message: 'Action is required.' },
    { field: formElement?.elements.companyName, message: 'Company name is required.' },
    { field: formElement?.elements.ticker, message: 'Ticker is required.' },
    { field: formElement?.elements.date, message: 'Date is required.' },
    { field: formElement?.elements.sharePrice, message: 'Share price must be greater than 0.' },
    { field: formElement?.elements.quantity, message: 'Quantity must be greater than 0.' },
    { field: formElement?.elements.transactionFee, message: 'Transaction fee cannot be negative.' }
  ];

  requiredFields.forEach(({ field, message }) => {
    if (!field) return;
    const rawValue = String(field.value || '').trim();
    if (field.name === 'sharePrice' || field.name === 'quantity') {
      const numericValue = Number(rawValue);
      if (!rawValue || !Number.isFinite(numericValue) || numericValue <= 0) fieldErrors.push({ field, message });
      return;
    }
    if (field.name === 'transactionFee') {
      const numericValue = Number(rawValue || 0);
      if (!Number.isFinite(numericValue) || numericValue < 0) fieldErrors.push({ field, message });
      return;
    }
    if (!rawValue) fieldErrors.push({ field, message });
  });

  return fieldErrors;
}

function applyTransactionFormValidation(formElement, transaction, existingTransactions, transactionIdToIgnore = null) {
  clearFormValidation(formElement);
  const fieldErrors = getRequiredTransactionFieldErrors(formElement);
  fieldErrors.forEach(({ field, message }) => setFieldError(field, message));
  if (fieldErrors.length) {
    showMessage(messageBox, `Save failed. ${fieldErrors.length} field(s) require attention.`, 'error');
    scrollToFirstInvalidField(formElement);
    return true;
  }

  const logicalErrors = validateTransaction(transaction, existingTransactions, transactionIdToIgnore);
  if (logicalErrors.length) {
    showMessage(messageBox, logicalErrors.join(' '), 'error');
    return true;
  }

  return false;
}

initializeEditPage().catch(error => {
  showMessage(messageBox, `Edit page startup failed: ${getErrorMessage(error)}`, 'error');
});

async function initializeEditPage() {
  bindEditEvents();
  await restoreSavedSession();
  prefillRememberedEmail();
  await refreshAuthenticationPanel();
  onAuthStateChange(async () => {
    try {
      await refreshAuthenticationPanel();
      transactions = await loadInitialTransactions();
      renderTransactionTable();
    } catch (error) {
      showMessage(messageBox, `Authentication refresh failed: ${getErrorMessage(error)}`, 'error');
    }
  });
  transactions = await loadInitialTransactions();
  renderTransactionTable();
}

function prefillRememberedEmail() {
  if (!authEmailInput) return;
  authEmailInput.value = getRememberedLoginEmail();
}

function bindEditEvents() {
  bindLiveValidationCleanup(editForm);
  editForm.addEventListener('submit', handleEditFormSubmit);
  clearFormButton.addEventListener('click', clearEditForm);
  confirmImpactButton.addEventListener('click', confirmPendingChange);
  cancelImpactButton.addEventListener('click', cancelPendingChange);
  exportButton.addEventListener('click', () => exportTransactionsAsJson(transactions));
  authForm?.addEventListener('submit', handleLoginSubmit);
  signOutButton?.addEventListener('click', handleSignOut);
}

async function refreshAuthenticationPanel() {
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

async function handleLoginSubmit(event) {
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

async function handleSignOut() {
  try {
    await signOutUser();
    transactions = await loadInitialTransactions();
    await refreshAuthenticationPanel();
    renderTransactionTable();
    showMessage(messageBox, 'Signed out successfully.', 'success');
  } catch (error) {
    showMessage(messageBox, `Logout failed: ${getErrorMessage(error)}`, 'error');
  }
}


function renderTransactionTable() {
  const portfolio = calculatePortfolioFromTransactions(transactions);
  transactionTableBody.innerHTML = '';

  portfolio.transactionRows.forEach(transaction => {
    const tableRow = document.createElement('tr');
    tableRow.innerHTML = `
      <td data-label="Date">${transaction.date}</td>
      <td data-label="Type">${transaction.type}</td>
      <td data-label="Company">${transaction.companyName}</td>
      <td data-label="Ticker">${transaction.ticker}</td>
      <td data-label="Price">${formatMoney(transaction.sharePrice)}</td>
      <td data-label="Quantity">${formatQuantity(transaction.quantity)}</td>
      <td data-label="Fee">${formatMoney(transaction.transactionFee)}</td>
      <td data-label="Average after">${formatMoney(transaction.averagePriceAfterTransaction)}</td>
      <td data-label="Realized after" class="${getGainLossClass(transaction.realizedGainLossAfterTransaction)}">${formatMoney(transaction.realizedGainLossAfterTransaction)}</td>
      <td data-label="Actions" class="table-actions">
        <button type="button" data-action="edit" data-id="${transaction.id}">Edit</button>
        <button type="button" data-action="delete" data-id="${transaction.id}" class="danger-button">Delete</button>
      </td>
    `;
    tableRow.addEventListener('click', handleTableActionClick);
    transactionTableBody.appendChild(tableRow);
  });
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

  if (applyTransactionFormValidation(editForm, editedTransaction, transactions, existingTransactionId)) return;

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
  const impactPreview = createImpactPreview(oldTransactions, newTransactions);
  pendingTransactionsAfterChange = newTransactions;
  pendingSuccessMessage = `${actionLabel} saved successfully.`;

  impactContent.innerHTML = `
    <p><strong>${actionLabel} impact preview</strong></p>
    <ul>
      <li>Total currently invested: ${formatMoney(impactPreview.oldPortfolio.totalCurrentlyInvested)} → ${formatMoney(impactPreview.newPortfolio.totalCurrentlyInvested)}</li>
      <li>Change in invested amount: ${formatMoney(impactPreview.totalCurrentlyInvestedChange)}</li>
      <li>Realized gain/loss: ${formatMoney(impactPreview.oldPortfolio.totalRealizedGainLoss)} → ${formatMoney(impactPreview.newPortfolio.totalRealizedGainLoss)}</li>
      <li>Change in realized gain/loss: ${formatMoney(impactPreview.realizedGainLossChange)}</li>
      <li>Total fees: ${formatMoney(impactPreview.oldPortfolio.totalFees)} → ${formatMoney(impactPreview.newPortfolio.totalFees)}</li>
      <li>Change in total fees: ${formatMoney(impactPreview.totalFeesChange)}</li>
    </ul>
    ${renderTickerImpactPreview(impactPreview)}
    <p>Fee edits are treated as part of the permanent transaction record. A buy fee changes average cost; a sell fee changes realized gain/loss. All later transactions for the same ticker are recalculated before saving.</p>
  `;

  impactDialog.showModal();
}

function renderTickerImpactPreview(impactPreview) {
  const affectedTickers = Array.from(new Set([
    ...Object.keys(impactPreview.oldPortfolio.holdingsByTicker),
    ...Object.keys(impactPreview.newPortfolio.holdingsByTicker)
  ])).filter(ticker => {
    const oldHolding = impactPreview.oldPortfolio.holdingsByTicker[ticker] || {};
    const newHolding = impactPreview.newPortfolio.holdingsByTicker[ticker] || {};
    return oldHolding.averagePrice !== newHolding.averagePrice ||
      oldHolding.remainingQuantity !== newHolding.remainingQuantity ||
      oldHolding.realizedGainLoss !== newHolding.realizedGainLoss;
  });

  if (!affectedTickers.length) return '';

  const rows = affectedTickers.map(ticker => {
    const oldHolding = impactPreview.oldPortfolio.holdingsByTicker[ticker] || { averagePrice: 0, remainingQuantity: 0, realizedGainLoss: 0 };
    const newHolding = impactPreview.newPortfolio.holdingsByTicker[ticker] || { averagePrice: 0, remainingQuantity: 0, realizedGainLoss: 0 };
    return `
      <tr>
        <td data-label="Ticker">${ticker}</td>
        <td data-label="Average price">${formatMoney(oldHolding.averagePrice)} → ${formatMoney(newHolding.averagePrice)}</td>
        <td data-label="Remaining qty">${formatQuantity(oldHolding.remainingQuantity)} → ${formatQuantity(newHolding.remainingQuantity)}</td>
        <td data-label="Realized gain/loss">${formatMoney(oldHolding.realizedGainLoss)} → ${formatMoney(newHolding.realizedGainLoss)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-scroll-wrapper">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Average price</th>
            <th>Remaining quantity</th>
            <th>Realized gain/loss</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
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
    renderTransactionTable();
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


function getErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : 'Unexpected error. Please check the browser console for details.';
}
