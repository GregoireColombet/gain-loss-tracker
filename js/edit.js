import { calculatePortfolioFromTransactions, createImpactPreview } from './calculations.js';
import { loadInitialTransactions, saveTransactions, exportTransactionsAsJson } from './storage.js';
import { createTransactionFromForm, validateTransaction } from './validation.js';
import { getCurrentUser, sendLoginLink, signOutUser, onAuthStateChange } from './authService.js';
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

initializeEditPage();

async function initializeEditPage() {
  bindEditEvents();
  await refreshAuthenticationPanel();
  onAuthStateChange(async () => {
    await refreshAuthenticationPanel();
    transactions = await loadInitialTransactions();
    renderTransactionTable();
  });
  transactions = await loadInitialTransactions();
  renderTransactionTable();
}

function bindEditEvents() {
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
    authStatus.textContent = `Signed in as ${currentUser.email}. Transactions sync to Supabase.`;
    authForm.hidden = true;
    signOutButton.hidden = false;
  } else {
    authStatus.textContent = 'Sign in with your email to sync transactions to Supabase.';
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
    showMessage(messageBox, 'Login link sent. Check your email.', 'success');
  } catch (error) {
    showMessage(messageBox, error.message, 'error');
  }
}

async function handleSignOut() {
  await signOutUser();
  transactions = await loadInitialTransactions();
  await refreshAuthenticationPanel();
  renderTransactionTable();
}


function renderTransactionTable() {
  const portfolio = calculatePortfolioFromTransactions(transactions);
  transactionTableBody.innerHTML = '';

  portfolio.transactionRows.forEach(transaction => {
    const tableRow = document.createElement('tr');
    tableRow.innerHTML = `
      <td>${transaction.date}</td>
      <td>${transaction.type}</td>
      <td>${transaction.companyName}</td>
      <td>${transaction.ticker}</td>
      <td>${formatMoney(transaction.sharePrice)}</td>
      <td>${formatQuantity(transaction.quantity)}</td>
      <td>${formatMoney(transaction.transactionFee)}</td>
      <td>${formatMoney(transaction.averagePriceAfterTransaction)}</td>
      <td class="${getGainLossClass(transaction.realizedGainLossAfterTransaction)}">${formatMoney(transaction.realizedGainLossAfterTransaction)}</td>
      <td class="table-actions">
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
  if (!transaction) return;

  editForm.transactionId.value = transaction.id;
  editForm.type.value = transaction.type;
  editForm.companyName.value = transaction.companyName;
  editForm.ticker.value = transaction.ticker;
  editForm.date.value = transaction.date;
  editForm.sharePrice.value = transaction.sharePrice;
  editForm.quantity.value = transaction.quantity;
  editForm.transactionFee.value = transaction.transactionFee;
}

function clearEditForm() {
  editForm.reset();
  editForm.transactionId.value = '';
}

function handleEditFormSubmit(event) {
  event.preventDefault();
  hideMessage(messageBox);

  const editedTransaction = createTransactionFromForm(editForm);
  const existingTransactionId = editForm.transactionId.value;
  const errors = validateTransaction(editedTransaction, transactions, existingTransactionId);

  if (errors.length) {
    showMessage(messageBox, errors.join(' '), 'error');
    return;
  }

  const newTransactions = existingTransactionId
    ? transactions.map(transaction => transaction.id === existingTransactionId ? editedTransaction : transaction)
    : [...transactions, editedTransaction];

  openImpactDialog(transactions, newTransactions, existingTransactionId ? 'Modification' : 'New transaction');
}

function requestDeleteTransaction(transactionId) {
  const transactionToDelete = transactions.find(transaction => transaction.id === transactionId);
  if (!transactionToDelete) return;

  const userConfirmed = confirm(`Delete this transaction?\n${transactionToDelete.type} ${transactionToDelete.ticker} on ${transactionToDelete.date}`);
  if (!userConfirmed) return;

  const newTransactions = transactions.filter(transaction => transaction.id !== transactionId);
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
    </ul>
    <p>This may change average prices, remaining quantities, realized gain/loss, unrealized gain/loss, and dashboard totals.</p>
  `;

  impactDialog.showModal();
}

async function confirmPendingChange() {
  if (!pendingTransactionsAfterChange) return;
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
    showMessage(messageBox, 'Unable to save to Supabase. Records were reloaded.', 'error');
  }
}

function cancelPendingChange() {
  pendingTransactionsAfterChange = null;
  impactDialog.close();
  showMessage(messageBox, 'Change canceled. Records were not modified.', 'info');
}
