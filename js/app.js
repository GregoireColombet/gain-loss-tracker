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
const buyFeeThresholdAmountInput = document.querySelector('#buyFeeThresholdAmount');
const buyFlatFeeAmountInput = document.querySelector('#buyFlatFeeAmount');
const buyPercentageFeeRateInput = document.querySelector('#buyPercentageFeeRate');
const sellFeeThresholdAmountInput = document.querySelector('#sellFeeThresholdAmount');
const sellFlatFeeAmountInput = document.querySelector('#sellFlatFeeAmount');
const sellPercentageFeeRateInput = document.querySelector('#sellPercentageFeeRate');
const saveFeeRuleButton = document.querySelector('#saveFeeRuleButton');
const breakEvenResultElement = document.querySelector('#breakEvenResult');
const transactionFeeInput = transactionForm?.elements.transactionFee;
const useFeeRuleForTransactionInput = document.querySelector('#useFeeRuleForTransaction');
const calculatedFeePreviewElement = document.querySelector('#calculatedFeePreview');

let transactions = [];
let latestMarketPriceResults = {};
let feeRules = getDefaultFeeRules();
let isAutomaticallyUpdatingTransactionFee = false;

initializeDashboard();

async function initializeDashboard() {
  bindDashboardEvents();
  renderFeeRuleInputs();
  await restoreSavedSession();
  prefillRememberedEmail();
  await refreshAuthenticationPanel();
  onAuthStateChange(async () => {
    await refreshAuthenticationPanel();
    feeRules = await loadFeeRules(getDefaultFeeRules());
    renderFeeRuleInputs();
    updateTransactionFeeFromRule();
    transactions = await loadInitialTransactions();
    await refreshDashboard();
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
  await signOutUser();
  transactions = await loadInitialTransactions();
  await refreshAuthenticationPanel();
  await refreshDashboard();
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
  if (!buyFeeThresholdAmountInput || !buyFlatFeeAmountInput || !buyPercentageFeeRateInput) return;
  if (!sellFeeThresholdAmountInput || !sellFlatFeeAmountInput || !sellPercentageFeeRateInput) return;

  buyFeeThresholdAmountInput.value = feeRules.buyFeeRule.thresholdAmount;
  buyFlatFeeAmountInput.value = feeRules.buyFeeRule.flatFee;
  buyPercentageFeeRateInput.value = feeRules.buyFeeRule.percentageFeeRate * 100;

  sellFeeThresholdAmountInput.value = feeRules.sellFeeRule.thresholdAmount;
  sellFlatFeeAmountInput.value = feeRules.sellFeeRule.flatFee;
  sellPercentageFeeRateInput.value = feeRules.sellFeeRule.percentageFeeRate * 100;
}

function readFeeRulesFromInputs() {
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
  feeRules = readFeeRulesFromInputs();
  hideMessage(messageBox);
  try {
    await saveFeeRules(feeRules);
    renderFeeRuleInputs();
    updateTransactionFeeFromRule();
    renderBreakEvenStatus('Fee rules saved. New transactions will use these rules by default. Existing transaction fees were not changed.', 'success');
  } catch (error) {
    renderFeeRuleInputs();
    updateTransactionFeeFromRule();
    renderBreakEvenStatus('Fee rules saved locally, but Supabase settings sync failed. Existing transaction fees were not changed.', 'error');
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

  if (!selectedHolding || selectedHolding.remainingQuantity <= 0) {
    renderBreakEvenError('Select a stock with remaining shares.');
    return;
  }

  const quantityToSell = Number(breakEvenQuantityInput.value || selectedHolding.remainingQuantity);
  if (quantityToSell > selectedHolding.remainingQuantity) {
    renderBreakEvenError(`Quantity cannot be greater than remaining shares (${formatQuantity(selectedHolding.remainingQuantity)}).`);
    return;
  }

  feeRules = readFeeRulesFromInputs();
  saveFeeRules(feeRules).catch(error => console.error('Unable to save fee rules during break-even calculation.', error));
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

  const transaction = createTransactionFromForm(transactionForm);
  const errors = validateTransaction(transaction, transactions);
  if (errors.length) {
    showMessage(messageBox, errors.join(' '), 'error');
    return;
  }

  transactions.push(transaction);
  try {
    await saveTransactions(transactions);
    transactionForm.reset();
    if (useFeeRuleForTransactionInput) useFeeRuleForTransactionInput.checked = true;
    updateTransactionFeeFromRule();
    showMessage(messageBox, 'Transaction saved successfully. The fee value was stored permanently in this transaction.', 'success');
  } catch (error) {
    transactionForm.reset();
    if (useFeeRuleForTransactionInput) useFeeRuleForTransactionInput.checked = true;
    updateTransactionFeeFromRule();
    showMessage(messageBox, 'Saved locally, but Supabase sync failed. Check your Supabase setup or connection.', 'error');
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

  saveManualCurrentPrice(ticker, manualPrice);
  showMessage(messageBox, `Manual current price saved for ${ticker}.`, 'success');
  await refreshDashboard();
}

async function handleImportTransactions(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    transactions = await importTransactionsFromFile(file);
    showMessage(messageBox, 'Transactions imported successfully.', 'success');
    await refreshDashboard();
  } catch (error) {
    showMessage(messageBox, `Import failed: ${error.message}`, 'error');
  }
}
