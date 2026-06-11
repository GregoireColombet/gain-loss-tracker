import { TRANSACTION_TYPES, API_STATUS } from './constants.js';
import { calculatePortfolioFromTransactions, calculatePortfolioWithMarketPrices, createGainLossTimeline } from './calculations.js';
import { loadInitialTransactions, loadManualCurrentPrices, saveManualCurrentPrice, saveTransactions, exportTransactionsAsJson, importTransactionsFromFile, loadFeeRules, saveFeeRules } from './storage.js';
import { fetchCurrentMarketPrices } from './marketPriceService.js';
import { getCurrentUser, sendLoginLink, signOutUser, onAuthStateChange, restoreSavedSession, getRememberedLoginEmail } from './authService.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { createTransactionFromForm, validateTransaction } from './validation.js';
import { drawGainLossChart } from './chart.js';
import { formatMoney, formatQuantity, getGainLossClass, showMessage, hideMessage, setSelectOptions } from './uiHelpers.js';
import { calculateFeeForTransaction, calculateMinimumBreakEvenSellPrice, getDefaultFeeRules, normalizeBuyFeeRule, normalizeSellFeeRule } from './feeCalculator.js';

const transactionForm = document.querySelector('#transactionForm');
const transactionTypeSelect = document.querySelector('#type');
const sellTickerSelect = document.querySelector('#sellTickerSelect');
const messageBox = document.querySelector('#messageBox');
const companyListElement = document.querySelector('#companyList');
const totalInvestedElement = document.querySelector('#totalInvested');
const totalRealizedElement = document.querySelector('#totalRealized');
const totalUnrealizedElement = document.querySelector('#totalUnrealized');
const overallGainLossElement = document.querySelector('#overallGainLoss');
const chartCanvas = document.querySelector('#gainLossChart');
const gainLossPeriodInputs = document.querySelectorAll('input[name="gainLossPeriod"]');
const gainLossDisplayUnitInputs = document.querySelectorAll('input[name="gainLossDisplayUnit"]');
const gainLossStartDateInput = document.querySelector('#gainLossStartDate');
const gainLossEndDateInput = document.querySelector('#gainLossEndDate');
const resetGainLossRangeButton = document.querySelector('#resetGainLossRangeButton');
const exportButton = document.querySelector('#exportButton');
const importInput = document.querySelector('#importInput');
const authPanel = document.querySelector('#authPanel');
const authForm = document.querySelector('#authForm');
const authEmailInput = document.querySelector('#authEmail');
const authStatus = document.querySelector('#authStatus');
const signOutButton = document.querySelector('#signOutButton');
const breakEvenForm = document.querySelector('#breakEvenForm');
const breakEvenTickerSelect = document.querySelector('#breakEvenTickerSelect');
const breakEvenQuantityInput = document.querySelector('#breakEvenQuantity');
const buyFeeThresholdAmountInput = findFirstElement(['#buyFeeThresholdAmount', '#buyThresholdAmount']);
const buyFlatFeeAmountInput = findFirstElement(['#buyFlatFeeAmount', '#buyFlatFee']);
const buyPercentageFeeRateInput = findFirstElement(['#buyPercentageFeeRate', '#buyPercentageFee']);
const sellFeeThresholdAmountInput = findFirstElement(['#sellFeeThresholdAmount', '#sellThresholdAmount']);
const sellFlatFeeAmountInput = findFirstElement(['#sellFlatFeeAmount', '#sellFlatFee']);
const sellPercentageFeeRateInput = findFirstElement(['#sellPercentageFeeRate', '#sellPercentageFee']);
const saveFeeRuleButton = document.querySelector('#saveFeeRuleButton');
const breakEvenResultElement = document.querySelector('#breakEvenResult');
const transactionFeeInput = transactionForm?.elements.transactionFee;
const useFeeRuleForTransactionInput = document.querySelector('#useFeeRuleForTransaction');
const calculatedFeePreviewElement = document.querySelector('#calculatedFeePreview');

let transactions = [];
let latestMarketPriceResults = {};
let feeRules = getDefaultFeeRules();
let isAutomaticallyUpdatingTransactionFee = false;

function findFirstElement(selectorList) {
  for (const selector of selectorList) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function getMissingFeeRuleInputNames() {
  const missingInputNames = [];
  if (!buyFeeThresholdAmountInput) missingInputNames.push('buy threshold amount');
  if (!buyFlatFeeAmountInput) missingInputNames.push('buy flat fee amount');
  if (!buyPercentageFeeRateInput) missingInputNames.push('buy percentage fee rate');
  if (!sellFeeThresholdAmountInput) missingInputNames.push('sell threshold amount');
  if (!sellFlatFeeAmountInput) missingInputNames.push('sell flat fee amount');
  if (!sellPercentageFeeRateInput) missingInputNames.push('sell percentage fee rate');
  return missingInputNames;
}

function canReadFeeRuleInputs() {
  return getMissingFeeRuleInputNames().length === 0;
}


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

function applyFieldErrors(formElement, fieldErrors, messageTarget, failurePrefix = 'Save failed') {
  clearFormValidation(formElement);
  fieldErrors.forEach(({ field, message }) => setFieldError(field, message));
  if (fieldErrors.length) {
    showMessage(messageTarget, `${failurePrefix}. ${fieldErrors.length} field(s) require attention.`, 'error');
    scrollToFirstInvalidField(formElement);
    return true;
  }
  return false;
}

function validateTransactionFormUi(formElement, transaction, existingTransactions, transactionIdToIgnore = null, messageTarget = messageBox) {
  const fieldErrors = getRequiredTransactionFieldErrors(formElement);
  if (applyFieldErrors(formElement, fieldErrors, messageTarget)) return true;

  const logicalErrors = validateTransaction(transaction, existingTransactions, transactionIdToIgnore);
  if (logicalErrors.length) {
    showMessage(messageTarget, logicalErrors.join(' '), 'error');
    return true;
  }

  return false;
}

function getFeeRuleFieldErrors() {
  if (!canReadFeeRuleInputs()) {
    return [{ field: buyFeeThresholdAmountInput || buyFlatFeeAmountInput || buyPercentageFeeRateInput, message: `Fee rule input missing: ${getMissingFeeRuleInputNames().join(', ')}` }];
  }

  const fieldErrors = [];
  const feeFields = [
    { field: buyFeeThresholdAmountInput, label: 'Buy threshold' },
    { field: buyFlatFeeAmountInput, label: 'Buy flat fee' },
    { field: buyPercentageFeeRateInput, label: 'Buy percentage fee' },
    { field: sellFeeThresholdAmountInput, label: 'Sell threshold' },
    { field: sellFlatFeeAmountInput, label: 'Sell flat fee' },
    { field: sellPercentageFeeRateInput, label: 'Sell percentage fee' }
  ];

  feeFields.forEach(({ field, label }) => {
    const rawValue = String(field?.value || '').trim();
    const numericValue = Number(rawValue);
    if (!rawValue || !Number.isFinite(numericValue) || numericValue < 0) {
      fieldErrors.push({ field, message: `${label} must be 0 or greater.` });
    }
  });

  const buyFlatFee = Number(buyFlatFeeAmountInput?.value || 0);
  const buyPercentageFee = Number(buyPercentageFeeRateInput?.value || 0);
  if (Number.isFinite(buyFlatFee) && Number.isFinite(buyPercentageFee) && buyFlatFee <= 0 && buyPercentageFee <= 0) {
    fieldErrors.push({ field: buyFlatFeeAmountInput, message: 'Buy rule needs a flat fee or percentage fee greater than 0.' });
    fieldErrors.push({ field: buyPercentageFeeRateInput, message: 'Buy rule needs a flat fee or percentage fee greater than 0.' });
  }

  const sellFlatFee = Number(sellFlatFeeAmountInput?.value || 0);
  const sellPercentageFee = Number(sellPercentageFeeRateInput?.value || 0);
  if (Number.isFinite(sellFlatFee) && Number.isFinite(sellPercentageFee) && sellFlatFee <= 0 && sellPercentageFee <= 0) {
    fieldErrors.push({ field: sellFlatFeeAmountInput, message: 'Sell rule needs a flat fee or percentage fee greater than 0.' });
    fieldErrors.push({ field: sellPercentageFeeRateInput, message: 'Sell rule needs a flat fee or percentage fee greater than 0.' });
  }

  return fieldErrors;
}

function validateFeeRuleUi() {
  const fieldErrors = getFeeRuleFieldErrors();
  clearFormValidation(breakEvenForm);
  fieldErrors.forEach(({ field, message }) => setFieldError(field, message));
  if (fieldErrors.length) {
    renderBreakEvenStatus(`Save failed. ${fieldErrors.length} fee field(s) require attention.`, 'error');
    scrollToFirstInvalidField(breakEvenForm);
    return true;
  }
  return false;
}

function validateBreakEvenUi(selectedHolding) {
  const fieldErrors = [];
  if (!breakEvenTickerSelect?.value || !selectedHolding) {
    fieldErrors.push({ field: breakEvenTickerSelect, message: 'Select a stock with remaining shares.' });
  }
  const quantityToSell = Number(breakEvenQuantityInput?.value || 0);
  if (!Number.isFinite(quantityToSell) || quantityToSell <= 0) {
    fieldErrors.push({ field: breakEvenQuantityInput, message: 'Quantity must be greater than 0.' });
  } else if (selectedHolding && quantityToSell > selectedHolding.remainingQuantity) {
    fieldErrors.push({ field: breakEvenQuantityInput, message: `Quantity cannot be greater than remaining shares (${formatQuantity(selectedHolding.remainingQuantity)}).` });
  }
  clearFormValidation(breakEvenForm);
  fieldErrors.forEach(({ field, message }) => setFieldError(field, message));
  if (fieldErrors.length) {
    renderBreakEvenStatus(`Validation failed. ${fieldErrors.length} field(s) require attention.`, 'error');
    scrollToFirstInvalidField(breakEvenForm);
    return true;
  }
  return false;
}


initializeDashboard().catch(error => {
  showMessage(messageBox, `Application startup failed: ${getErrorMessage(error)}`, 'error');
});

async function initializeDashboard() {
  bindDashboardEvents();
  renderFeeRuleInputs();
  await restoreSavedSession();
  prefillRememberedEmail();
  await refreshAuthenticationPanel();
  onAuthStateChange(async () => {
    try {
      await refreshAuthenticationPanel();
      feeRules = await loadFeeRules(getDefaultFeeRules());
      renderFeeRuleInputs();
      updateTransactionFeeFromRule();
      transactions = await loadInitialTransactions();
      await refreshDashboard();
    } catch (error) {
      showMessage(messageBox, `Authentication refresh failed: ${getErrorMessage(error)}`, 'error');
    }
  });
  feeRules = await loadFeeRules(getDefaultFeeRules());
  renderFeeRuleInputs();
  transactions = await loadInitialTransactions();
  updateTransactionFeeFromRule();
  await refreshDashboard();
}

function prefillRememberedEmail() {
  if (!authEmailInput) return;
  authEmailInput.value = getRememberedLoginEmail();
}

function bindDashboardEvents() {
  bindLiveValidationCleanup(transactionForm);
  bindLiveValidationCleanup(breakEvenForm);
  transactionTypeSelect.addEventListener('change', handleTransactionTypeChange);
  sellTickerSelect.addEventListener('change', handleSellTickerSelection);
  transactionForm.addEventListener('submit', handleTransactionFormSubmit);
  transactionForm?.sharePrice?.addEventListener('input', updateTransactionFeeFromRule);
  transactionForm?.quantity?.addEventListener('input', updateTransactionFeeFromRule);
  transactionFeeInput?.addEventListener('input', handleTransactionFeeManualInput);
  useFeeRuleForTransactionInput?.addEventListener('change', updateTransactionFeeFromRule);
  exportButton.addEventListener('click', () => exportTransactionsAsJson(transactions));
  importInput.addEventListener('change', handleImportTransactions);
  authForm?.addEventListener('submit', handleLoginSubmit);
  signOutButton?.addEventListener('click', handleSignOut);
  breakEvenForm?.addEventListener('submit', handleBreakEvenFormSubmit);
  saveFeeRuleButton?.addEventListener('click', handleSaveFeeRules);
  breakEvenTickerSelect?.addEventListener('change', handleBreakEvenTickerChange);
  gainLossPeriodInputs.forEach(input => input.addEventListener('change', renderGainLossChart));
  gainLossDisplayUnitInputs.forEach(input => input.addEventListener('change', renderGainLossChart));
  gainLossStartDateInput?.addEventListener('change', renderGainLossChart);
  gainLossEndDateInput?.addEventListener('change', renderGainLossChart);
  resetGainLossRangeButton?.addEventListener('click', handleResetGainLossRange);
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
    await refreshDashboard();
    showMessage(messageBox, 'Signed out successfully.', 'success');
  } catch (error) {
    showMessage(messageBox, `Logout failed: ${getErrorMessage(error)}`, 'error');
  }
}


async function refreshDashboard() {
  const basePortfolio = calculatePortfolioFromTransactions(transactions);
  const tickers = basePortfolio.holdings.map(holding => holding.ticker);
  latestMarketPriceResults = await fetchCurrentMarketPrices(tickers);
  const marketPricesByTicker = createMarketPricesMap(latestMarketPriceResults);
  const manualPricesByTicker = loadManualCurrentPrices();
  const portfolio = calculatePortfolioWithMarketPrices(basePortfolio, marketPricesByTicker, manualPricesByTicker);

  renderSummary(portfolio);
  renderCompanyList(portfolio);
  const openHoldings = basePortfolio.holdings.filter(holding => holding.remainingQuantity > 0);
  setSelectOptions(sellTickerSelect, openHoldings);
  setSelectOptions(breakEvenTickerSelect, openHoldings);
  updateBreakEvenQuantityFromSelectedHolding(basePortfolio);
  initializeDefaultGainLossDateRange();
  renderGainLossChart();
}

function renderGainLossChart() {
  if (!chartCanvas) return;
  const timelineData = createGainLossTimeline(transactions, getGainLossChartOptions());
  chartCanvas.width = calculateChartCanvasWidth(timelineData.length);
  drawGainLossChart(chartCanvas, timelineData, { displayUnit: getSelectedGainLossDisplayUnit() });
}

function getGainLossChartOptions() {
  return {
    period: getSelectedGainLossPeriod(),
    startDate: gainLossStartDateInput?.value || '',
    endDate: gainLossEndDateInput?.value || getTodayDateString()
  };
}

function getSelectedGainLossPeriod() {
  const selectedInput = [...gainLossPeriodInputs].find(input => input.checked);
  return selectedInput?.value || 'week';
}

function getSelectedGainLossDisplayUnit() {
  const selectedInput = [...gainLossDisplayUnitInputs].find(input => input.checked);
  return selectedInput?.value || 'compact';
}

function calculateChartCanvasWidth(numberOfPoints) {
  const selectedPeriod = getSelectedGainLossPeriod();
  const spacingByPeriod = { day: 72, week: 96, month: 112, year: 128 };
  const spacing = spacingByPeriod[selectedPeriod] || spacingByPeriod.week;
  return Math.max(900, numberOfPoints * spacing);
}

function initializeDefaultGainLossDateRange() {
  if (gainLossEndDateInput && !gainLossEndDateInput.value) {
    gainLossEndDateInput.value = getTodayDateString();
  }
}

function handleResetGainLossRange() {
  if (gainLossStartDateInput) gainLossStartDateInput.value = '';
  if (gainLossEndDateInput) gainLossEndDateInput.value = getTodayDateString();
  renderGainLossChart();
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createMarketPricesMap(priceResultsByTicker) {
  return Object.values(priceResultsByTicker).reduce((result, priceResult) => {
    if (priceResult.status === API_STATUS.READY) result[priceResult.ticker] = priceResult.price;
    return result;
  }, {});
}

function renderSummary(portfolio) {
  totalInvestedElement.textContent = formatMoney(portfolio.totalCurrentlyInvested);
  totalRealizedElement.textContent = formatMoney(portfolio.totalRealizedGainLoss);
  totalRealizedElement.className = getGainLossClass(portfolio.totalRealizedGainLoss);
  totalUnrealizedElement.textContent = portfolio.hasMissingUnrealizedValue
    ? 'API not reachable'
    : formatMoney(portfolio.totalUnrealizedGainLoss);
  totalUnrealizedElement.className = portfolio.hasMissingUnrealizedValue ? 'neutral-value' : getGainLossClass(portfolio.totalUnrealizedGainLoss);
  overallGainLossElement.textContent = portfolio.hasMissingUnrealizedValue
    ? `${formatMoney(portfolio.overallGainLoss)} + missing live price`
    : formatMoney(portfolio.overallGainLoss);
  overallGainLossElement.className = getGainLossClass(portfolio.overallGainLoss);
}

function renderCompanyList(portfolio) {
  companyListElement.innerHTML = '';

  if (!portfolio.holdings.length) {
    companyListElement.innerHTML = '<p class="empty-state">No transactions yet.</p>';
    return;
  }

  portfolio.holdings.forEach(holding => {
    const companyCard = document.createElement('article');
    companyCard.className = 'company-card';

    const currentPriceText = Number.isFinite(holding.currentMarketPrice)
      ? formatMoney(holding.currentMarketPrice)
      : 'API not reachable';

    const relatedTransactions = portfolio.transactionRows.filter(row => row.ticker === holding.ticker);
    const transactionHistoryHtml = relatedTransactions.map(transaction => `
      <li>
        <strong>${transaction.type}</strong> ${transaction.date} — ${formatQuantity(transaction.quantity)} shares @ ${formatMoney(transaction.sharePrice)}, fee ${formatMoney(transaction.transactionFee)}
      </li>
    `).join('');

    companyCard.innerHTML = `
      <div class="company-card-header">
        <div>
          <h3>${holding.companyName} (${holding.ticker})</h3>
          <p>Remaining shares: <strong>${formatQuantity(holding.remainingQuantity)}</strong></p>
        </div>
        <span class="${getGainLossClass(holding.realizedGainLoss + (holding.unrealizedGainLoss || 0))}">
          ${formatMoney(holding.realizedGainLoss + (holding.unrealizedGainLoss || 0))}
        </span>
      </div>
      <div class="company-metrics">
        <span>Average price: ${formatMoney(holding.averagePrice)}</span>
        <span>Current price: ${currentPriceText}</span>
        <span>Realized: <b class="${getGainLossClass(holding.realizedGainLoss)}">${formatMoney(holding.realizedGainLoss)}</b></span>
        <span>Unrealized: <b class="${getGainLossClass(holding.unrealizedGainLoss)}">${formatMoney(holding.unrealizedGainLoss)}</b></span>
      </div>
      <details>
        <summary>Transaction history</summary>
        <ul class="transaction-history">${transactionHistoryHtml}</ul>
      </details>
      <form class="manual-price-form" data-ticker="${holding.ticker}">
        <label>Manual current price fallback</label>
        <input type="number" step="0.000001" min="0" name="manualPrice" placeholder="Manual price">
        <button type="submit">Save manual price</button>
      </form>
    `;

    companyCard.querySelector('.manual-price-form').addEventListener('submit', handleManualPriceSubmit);
    companyListElement.appendChild(companyCard);
  });
}


function renderFeeRuleInputs() {
  if (!canReadFeeRuleInputs()) return;

  buyFeeThresholdAmountInput.value = feeRules.buyFeeRule.thresholdAmount;
  buyFlatFeeAmountInput.value = feeRules.buyFeeRule.flatFee;
  buyPercentageFeeRateInput.value = feeRules.buyFeeRule.percentageFeeRate * 100;

  sellFeeThresholdAmountInput.value = feeRules.sellFeeRule.thresholdAmount;
  sellFlatFeeAmountInput.value = feeRules.sellFeeRule.flatFee;
  sellPercentageFeeRateInput.value = feeRules.sellFeeRule.percentageFeeRate * 100;
}

function readFeeRulesFromInputs() {
  if (!canReadFeeRuleInputs()) {
    throw new Error(`Fee rule input missing: ${getMissingFeeRuleInputNames().join(', ')}`);
  }

  return {
    buyFeeRule: normalizeBuyFeeRule({
      thresholdAmount: Number(buyFeeThresholdAmountInput.value),
      flatFee: Number(buyFlatFeeAmountInput.value),
      percentageFeeRate: Number(buyPercentageFeeRateInput.value) / 100
    }),
    sellFeeRule: normalizeSellFeeRule({
      thresholdAmount: Number(sellFeeThresholdAmountInput.value),
      flatFee: Number(sellFlatFeeAmountInput.value),
      percentageFeeRate: Number(sellPercentageFeeRateInput.value) / 100
    })
  };
}

async function handleSaveFeeRules() {
  hideMessage(messageBox);
  if (validateFeeRuleUi()) return;
  setButtonProcessing(saveFeeRuleButton, true, 'Saving...');

  try {
    feeRules = readFeeRulesFromInputs();
    await saveFeeRules(feeRules);
    renderFeeRuleInputs();
    updateTransactionFeeFromRule();
    renderBreakEvenStatus('Fee rules saved. New transactions will use these rules by default. Existing transaction fees were not changed.', 'success');
  } catch (error) {
    renderFeeRuleInputs();
    updateTransactionFeeFromRule();

    const errorMessage = error instanceof Error && error.message.startsWith('Fee rule input missing')
      ? `${error.message}. Please refresh the page after deploying the latest index.html and app.js.`
      : `Fee rules saved locally, but Supabase settings sync failed: ${getErrorMessage(error)}. Existing transaction fees were not changed.`;

    renderBreakEvenStatus(errorMessage, 'error');
  } finally {
    setButtonProcessing(saveFeeRuleButton, false);
  }
}

function handleTransactionFeeManualInput() {
  if (isAutomaticallyUpdatingTransactionFee) return;
  if (useFeeRuleForTransactionInput) useFeeRuleForTransactionInput.checked = false;
  renderCalculatedFeePreview('Manual fee override is active for this transaction.');
}

function renderBreakEvenStatus(message, type = 'info') {
  if (!breakEvenResultElement) return;
  breakEvenResultElement.hidden = false;
  breakEvenResultElement.className = `break-even-result message-box ${type}`;
  breakEvenResultElement.textContent = message;
}

function updateTransactionFeeFromRule() {
  if (!transactionForm || !transactionFeeInput || !useFeeRuleForTransactionInput) return;

  if (!useFeeRuleForTransactionInput.checked) {
    renderCalculatedFeePreview('Manual fee override is active for this transaction.');
    return;
  }

  const transactionType = transactionTypeSelect.value;
  const sharePrice = Number(transactionForm.sharePrice.value);
  const quantity = Number(transactionForm.quantity.value);
  const calculatedFee = calculateFeeForTransaction(transactionType, sharePrice, quantity, feeRules);

  isAutomaticallyUpdatingTransactionFee = true;
  transactionFeeInput.value = Number.isFinite(calculatedFee) ? calculatedFee.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') : '0';
  isAutomaticallyUpdatingTransactionFee = false;

  if (Number.isFinite(calculatedFee) && calculatedFee > 0) {
    renderCalculatedFeePreview(`${transactionType} fee calculated from saved rule: ${formatMoney(calculatedFee)}. This amount will be stored permanently in the transaction.`);
  } else {
    renderCalculatedFeePreview('Fee will be calculated after price and quantity are entered.');
  }
}

function renderCalculatedFeePreview(message) {
  if (!calculatedFeePreviewElement) return;
  calculatedFeePreviewElement.textContent = message;
}

function handleBreakEvenTickerChange() {
  const portfolio = calculatePortfolioFromTransactions(transactions);
  updateBreakEvenQuantityFromSelectedHolding(portfolio);
}

function updateBreakEvenQuantityFromSelectedHolding(portfolio) {
  if (!breakEvenTickerSelect || !breakEvenQuantityInput) return;
  const selectedTicker = breakEvenTickerSelect.value;
  if (!selectedTicker) return;
  const selectedHolding = portfolio.holdingsByTicker[selectedTicker];
  if (!selectedHolding) return;
  if (!breakEvenQuantityInput.value || Number(breakEvenQuantityInput.value) > selectedHolding.remainingQuantity) {
    breakEvenQuantityInput.value = selectedHolding.remainingQuantity;
  }
}

function handleBreakEvenFormSubmit(event) {
  event.preventDefault();
  const portfolio = calculatePortfolioFromTransactions(transactions);
  const selectedTicker = breakEvenTickerSelect.value;
  const selectedHolding = portfolio.holdingsByTicker[selectedTicker];

  if (validateBreakEvenUi(selectedHolding)) return;
  if (validateFeeRuleUi()) return;

  const quantityToSell = Number(breakEvenQuantityInput.value || selectedHolding.remainingQuantity);

  feeRules = readFeeRulesFromInputs();
  saveFeeRules(feeRules).catch(error => {
    renderBreakEvenStatus(`Break-even calculation completed, but fee-rule sync failed: ${getErrorMessage(error)}. Local values remain available.`, 'error');
  });
  const breakEvenResult = calculateMinimumBreakEvenSellPrice(
    selectedHolding.averagePrice,
    quantityToSell,
    feeRules.sellFeeRule
  );

  if (!breakEvenResult.isValid) {
    renderBreakEvenError(breakEvenResult.message);
    return;
  }

  renderBreakEvenSuccess(selectedHolding, quantityToSell, breakEvenResult);
}

function renderBreakEvenError(message) {
  breakEvenResultElement.hidden = false;
  breakEvenResultElement.className = 'break-even-result error-message';
  breakEvenResultElement.textContent = message;
}

function renderBreakEvenSuccess(holding, quantityToSell, breakEvenResult) {
  breakEvenResultElement.hidden = false;
  breakEvenResultElement.className = 'break-even-result';
  breakEvenResultElement.innerHTML = `
    <h3>${holding.companyName} (${holding.ticker})</h3>
    <p>Minimum sell price: <strong>${formatMoney(breakEvenResult.minimumSellPrice)}</strong> per share</p>
    <div class="company-metrics">
      <span>Quantity: ${formatQuantity(quantityToSell)}</span>
      <span>Average buy price: ${formatMoney(holding.averagePrice)}</span>
      <span>Gross sell amount: ${formatMoney(breakEvenResult.grossSellAmount)}</span>
      <span>Estimated sell fee: ${formatMoney(breakEvenResult.sellFeeAmount)} (${breakEvenResult.feeMode})</span>
      <span>Net after fee: ${formatMoney(breakEvenResult.netAmountAfterFee)}</span>
    </div>
  `;
}

function handleTransactionTypeChange() {
  const isSell = transactionTypeSelect.value === TRANSACTION_TYPES.SELL;
  document.querySelector('#sellSelectorWrapper').hidden = !isSell;
  updateTransactionFeeFromRule();
}

function handleSellTickerSelection() {
  const selectedTicker = sellTickerSelect.value;
  if (!selectedTicker) return;
  const portfolio = calculatePortfolioFromTransactions(transactions);
  const holding = portfolio.holdingsByTicker[selectedTicker];
  if (!holding) return;
  transactionForm.companyName.value = holding.companyName;
  transactionForm.ticker.value = holding.ticker;
  updateTransactionFeeFromRule();
}

async function handleTransactionFormSubmit(event) {
  event.preventDefault();
  hideMessage(messageBox);

  const submitButton = transactionForm.querySelector('button[type="submit"]');
  const transaction = createTransactionFromForm(transactionForm);
  if (validateTransactionFormUi(transactionForm, transaction, transactions, null, messageBox)) return;

  setButtonProcessing(submitButton, true, 'Saving...');
  transactions.push(transaction);
  try {
    await saveTransactions(transactions);
    transactionForm.reset();
    clearFormValidation(transactionForm);
    if (useFeeRuleForTransactionInput) useFeeRuleForTransactionInput.checked = true;
    updateTransactionFeeFromRule();
    showMessage(messageBox, 'Transaction saved successfully. The fee value was stored permanently in this transaction.', 'success');
  } catch (error) {
    transactionForm.reset();
    clearFormValidation(transactionForm);
    if (useFeeRuleForTransactionInput) useFeeRuleForTransactionInput.checked = true;
    updateTransactionFeeFromRule();
    showMessage(messageBox, 'Saved locally, but Supabase sync failed. Check your Supabase setup or connection.', 'error');
  } finally {
    setButtonProcessing(submitButton, false);
  }
  await refreshDashboard();
}

async function handleManualPriceSubmit(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const ticker = formElement.dataset.ticker;
  const manualPrice = Number(new FormData(formElement).get('manualPrice'));

  if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
    showMessage(messageBox, 'Manual current price must be greater than 0.', 'error');
    return;
  }

  try {
    saveManualCurrentPrice(ticker, manualPrice);
    showMessage(messageBox, `Manual current price saved for ${ticker}.`, 'success');
    await refreshDashboard();
  } catch (error) {
    showMessage(messageBox, `Manual current price could not be saved: ${getErrorMessage(error)}`, 'error');
  }
}

async function handleImportTransactions(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    transactions = await importTransactionsFromFile(file);
    showMessage(messageBox, 'Transactions imported successfully.', 'success');
    await refreshDashboard();
  } catch (error) {
    showMessage(messageBox, `Import failed: ${getErrorMessage(error)}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function getErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : 'Unexpected error. Please check the browser console for details.';
}
