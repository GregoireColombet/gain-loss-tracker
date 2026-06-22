import { TRANSACTION_TYPES, API_STATUS } from './constants.js';
import { calculatePortfolioFromTransactions, calculatePortfolioWithMarketPrices, createGainLossTimeline } from './calculations.js';
import { loadInitialTransactions, loadManualCurrentPrices, saveManualCurrentPrice, saveTransactions, exportTransactionsAsJson, importTransactionsFromFile, loadFeeRules, saveFeeRules } from './storage.js';
import { fetchCurrentMarketPrices } from './marketPriceService.js';
import { onAuthStateChange, restoreSavedSession, getRememberedLoginEmail } from './authService.js';
import { createTransactionFromForm } from './validation.js';
import { drawGainLossChart } from './chart.js';
import { formatMoney, formatQuantity, showMessage, hideMessage, setSelectOptions } from './uiHelpers.js';
import { calculateFeeForTransaction, calculateMinimumBreakEvenSellPrice, getDefaultFeeRules, normalizeBuyFeeRule, normalizeSellFeeRule } from './feeCalculator.js';
import { findFirstElement, getErrorMessage, getTodayDateString, setButtonProcessing } from './utils/dom.js';
import { refreshAuthenticationPanel as renderAuthenticationPanel, sendLoginLinkFromForm, signOutAndReloadData } from './ui/authPanel.js';
import { applyFieldErrors, bindLiveValidationCleanup, clearFormValidation, scrollToFirstInvalidField, setFieldError, validateTransactionFormUi } from './ui/formValidation.js';
import { renderCompanyFeeSummary, renderCompanyList, renderSummary } from './ui/dashboardRenderer.js';
import { refreshTransactionInputSuggestions } from './ui/inputSuggestions.js';
import { initializeAiAnalysisPanel, refreshAiCompanyOptions } from './ui/aiAnalysisPanel.js';

const transactionForm = document.querySelector('#transactionForm');
const transactionTypeSelect = document.querySelector('#type');
const transactionActionLabel = document.querySelector('#transactionActionLabel');
const transactionSubmitButton = transactionForm?.querySelector('button[type="submit"]');
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
const companiesTotalFeesPaidElement = document.querySelector('#companiesTotalFeesPaid');
const companiesFeeDateRangeLabelElement = document.querySelector('#companiesFeeDateRangeLabel');
const companyFeeStartDateInput = document.querySelector('#companyFeeStartDate');
const companyFeeEndDateInput = document.querySelector('#companyFeeEndDate');
const resetCompanyFeeRangeButton = document.querySelector('#resetCompanyFeeRangeButton');

let transactions = [];
let latestMarketPriceResults = {};
let feeRules = getDefaultFeeRules();

const DEFAULT_COMPANY_FEE_START_DATE = '2026-01-01';

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function setDefaultCompanyFeeDateRange() {
  if (companyFeeStartDateInput && !companyFeeStartDateInput.value) {
    companyFeeStartDateInput.value = DEFAULT_COMPANY_FEE_START_DATE;
  }

  if (companyFeeEndDateInput && !companyFeeEndDateInput.value) {
    companyFeeEndDateInput.value = getTodayDateString();
  }
}
let isAutomaticallyUpdatingTransactionFee = false;

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
  await updateAuthenticationPanel();
  onAuthStateChange(async () => {
    try {
      await updateAuthenticationPanel();
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
  initializeAiAnalysisPanel({ getTransactions: () => transactions });
  setDefaultCompanyFeeDateRange();
  updateTransactionActionUi();
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
  authForm?.addEventListener('submit', event => sendLoginLinkFromForm(event, authEmailInput, messageBox));
  signOutButton?.addEventListener('click', handleSignOut);
  breakEvenForm?.addEventListener('submit', handleBreakEvenFormSubmit);
  saveFeeRuleButton?.addEventListener('click', handleSaveFeeRules);
  breakEvenTickerSelect?.addEventListener('change', handleBreakEvenTickerChange);
  gainLossPeriodInputs.forEach(input => input.addEventListener('change', renderGainLossChart));
  gainLossDisplayUnitInputs.forEach(input => input.addEventListener('change', renderGainLossChart));
  gainLossStartDateInput?.addEventListener('change', renderGainLossChart);
  gainLossEndDateInput?.addEventListener('change', renderGainLossChart);
  resetGainLossRangeButton?.addEventListener('click', handleResetGainLossRange);
  companyFeeStartDateInput?.addEventListener('change', refreshCompanyFeeSummary);
  companyFeeEndDateInput?.addEventListener('change', refreshCompanyFeeSummary);
  resetCompanyFeeRangeButton?.addEventListener('click', handleResetCompanyFeeRange);
}


async function updateAuthenticationPanel() {
  await renderAuthenticationPanel({ authPanel, authForm, authStatus, signOutButton });
}

async function handleSignOut() {
  await signOutAndReloadData({
    messageBox,
    loadData: loadInitialTransactions,
    refreshAuthPanel: updateAuthenticationPanel,
    afterSignOut: async reloadedTransactions => {
      transactions = reloadedTransactions;
      await refreshDashboard();
    }
  });
}


async function refreshDashboard() {
  const basePortfolio = calculatePortfolioFromTransactions(transactions);
  const tickers = basePortfolio.holdings.map(holding => holding.ticker);
  latestMarketPriceResults = await fetchCurrentMarketPrices(tickers);
  const marketPricesByTicker = createMarketPricesMap(latestMarketPriceResults);
  const manualPricesByTicker = loadManualCurrentPrices();
  const portfolio = calculatePortfolioWithMarketPrices(basePortfolio, marketPricesByTicker, manualPricesByTicker);

  renderSummary(portfolio, { totalInvestedElement, totalRealizedElement, totalUnrealizedElement, overallGainLossElement });
  refreshCompanyFeeSummary();
  renderCompanyList(portfolio, companyListElement, handleManualPriceSubmit);
  refreshTransactionInputSuggestions(transactions, transactionForm);
  refreshAiCompanyOptions(transactions);
  const openHoldings = basePortfolio.holdings.filter(holding => holding.remainingQuantity > 0);
  setSelectOptions(sellTickerSelect, openHoldings);
  setSelectOptions(breakEvenTickerSelect, openHoldings);
  updateBreakEvenQuantityFromSelectedHolding(basePortfolio);
  initializeDefaultGainLossDateRange();
  renderGainLossChart();
}

function refreshCompanyFeeSummary() {
  renderCompanyFeeSummary(
    transactions,
    {
      totalFeesElement: companiesTotalFeesPaidElement,
      dateRangeLabelElement: companiesFeeDateRangeLabelElement
    },
    getCompanyFeeDateRange()
  );
}

function getCompanyFeeDateRange() {
  return {
    startDate: companyFeeStartDateInput?.value || '',
    endDate: companyFeeEndDateInput?.value || ''
  };
}

function handleResetCompanyFeeRange() {
  if (companyFeeStartDateInput) companyFeeStartDateInput.value = DEFAULT_COMPANY_FEE_START_DATE;
  if (companyFeeEndDateInput) companyFeeEndDateInput.value = getTodayDateString();
  refreshCompanyFeeSummary();
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

function createMarketPricesMap(priceResultsByTicker) {
  return Object.values(priceResultsByTicker).reduce((result, priceResult) => {
    if (priceResult.status === API_STATUS.READY) result[priceResult.ticker] = priceResult.price;
    return result;
  }, {});
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
  updateTransactionActionUi();
  updateTransactionFeeFromRule();
}

function updateTransactionActionUi() {
  if (!transactionTypeSelect) return;

  const isSell = transactionTypeSelect.value === TRANSACTION_TYPES.SELL;
  const actionClass = isSell ? 'transaction-action-sell' : 'transaction-action-buy';
  const inactiveClass = isSell ? 'transaction-action-buy' : 'transaction-action-sell';

  transactionTypeSelect.classList.remove(inactiveClass);
  transactionTypeSelect.classList.add(actionClass);
  transactionActionLabel?.classList.remove(inactiveClass);
  transactionActionLabel?.classList.add(actionClass);

  if (transactionSubmitButton && !transactionSubmitButton.disabled) {
    transactionSubmitButton.textContent = isSell ? 'Add Sell Transaction' : 'Add Buy Transaction';
  }
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
    updateTransactionActionUi();
    updateTransactionFeeFromRule();
    showMessage(messageBox, 'Transaction saved successfully. The fee value was stored permanently in this transaction.', 'success');
  } catch (error) {
    transactionForm.reset();
    clearFormValidation(transactionForm);
    if (useFeeRuleForTransactionInput) useFeeRuleForTransactionInput.checked = true;
    updateTransactionActionUi();
    updateTransactionFeeFromRule();
    showMessage(messageBox, 'Saved locally, but Supabase sync failed. Check your Supabase setup or connection.', 'error');
  } finally {
    setButtonProcessing(submitButton, false);
    updateTransactionActionUi();
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
