import { formatMoney, formatQuantity, getGainLossClass } from '../uiHelpers.js';

export function renderSummary(portfolio, elements) {
  const { totalInvestedElement, totalRealizedElement, totalUnrealizedElement, overallGainLossElement } = elements;
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


function getTransactionFeeAmount(transaction) {
  return Number(transaction.transactionFee ?? transaction.transaction_fee ?? transaction.fee ?? 0);
}

export function calculateTotalTransactionFees(transactions, dateRange = {}) {
  const startDate = dateRange.startDate || '';
  const endDate = dateRange.endDate || '';

  return transactions
    .filter(transaction => {
      if (startDate && transaction.date < startDate) return false;
      if (endDate && transaction.date > endDate) return false;
      return true;
    })
    .reduce((totalFees, transaction) => totalFees + getTransactionFeeAmount(transaction), 0);
}

export function renderCompanyFeeSummary(transactions, elements, dateRange = {}) {
  const { totalFeesElement, dateRangeLabelElement } = elements;
  if (!totalFeesElement) return;

  const startDate = dateRange.startDate || '';
  const endDate = dateRange.endDate || '';
  const totalFees = calculateTotalTransactionFees(transactions, { startDate, endDate });

  totalFeesElement.textContent = formatMoney(totalFees);

  if (!dateRangeLabelElement) return;
  if (startDate && endDate) {
    dateRangeLabelElement.textContent = `${startDate} to ${endDate}`;
  } else if (startDate) {
    dateRangeLabelElement.textContent = `From ${startDate}`;
  } else if (endDate) {
    dateRangeLabelElement.textContent = `Until ${endDate}`;
  } else {
    dateRangeLabelElement.textContent = 'All dates';
  }
}

export function sortHoldingsForCompanyList(holdings) {
  return [...holdings].sort((firstHolding, secondHolding) => {
    const firstHasRemainingShares = firstHolding.remainingQuantity > 0;
    const secondHasRemainingShares = secondHolding.remainingQuantity > 0;

    if (firstHasRemainingShares !== secondHasRemainingShares) {
      return firstHasRemainingShares ? -1 : 1;
    }

    return firstHolding.companyName.localeCompare(secondHolding.companyName, undefined, {
      sensitivity: 'base',
      numeric: true
    });
  });
}

export function calculateAmountPlacedInCompany(holding) {
  return holding.averagePrice * holding.remainingQuantity;
}


const PRICE_SOURCE_DOT_CLASS_BY_TYPE = {
  live: 'price-source-live',
  cached: 'price-source-cached',
  manual: 'price-source-manual',
  missing: 'price-source-missing'
};

const PRICE_SOURCE_LABEL_BY_TYPE = {
  live: 'Live API price',
  cached: 'Cached price',
  manual: 'Manual price',
  missing: 'No price available'
};

function getMarketPriceSourceType(holding) {
  if (!Number.isFinite(holding.currentMarketPrice)) return 'missing';
  return PRICE_SOURCE_DOT_CLASS_BY_TYPE[holding.marketPriceSourceType]
    ? holding.marketPriceSourceType
    : 'manual';
}

function getMarketPriceSourceBadge(holding) {
  const sourceType = getMarketPriceSourceType(holding);
  const dotClass = PRICE_SOURCE_DOT_CLASS_BY_TYPE[sourceType];
  const label = PRICE_SOURCE_LABEL_BY_TYPE[sourceType];

  // The source dot is rendered from the final holding data after live prices,
  // cached prices, or manual fallbacks have been resolved. There is no separate
  // dot refresh path, which avoids transparent/stale indicators after price updates.
  return `<span class="price-source-dot ${dotClass}" title="${label}" aria-label="${label}"></span>`;
}

function getMarketPriceSourceTitle(holding) {
  return holding.marketPriceSource ? ` title="${holding.marketPriceSource.replace(/"/g, '&quot;')}"` : '';
}

function createAmountPlacedText(holding) {
  const amountPlaced = calculateAmountPlacedInCompany(holding);

  if (holding.remainingQuantity <= 0 || amountPlaced === 0) return '';

  return ` <span class="amount-placed-value">${formatMoney(amountPlaced)} placed</span>`;
}

function createRemainingSharesLine(holding) {
  if (holding.remainingQuantity <= 0) return '';

  return `
    <p class="company-remaining-shares-line">
      <strong>${formatQuantity(holding.remainingQuantity)}</strong> shares remaining${createAmountPlacedText(holding)}
    </p>
  `;
}

function createTotalProfitLossLine(combinedGainLoss) {
  const gainLossClass = getGainLossClass(combinedGainLoss);

  return `
    <p class="company-total-pl-line">
      <span class="${gainLossClass}">Total P/L</span>
      <strong class="${gainLossClass}">${formatMoney(combinedGainLoss)}</strong>
    </p>
  `;
}

function createManualPriceForm(holding) {
  if (holding.remainingQuantity <= 0) return '';

  return `
    <details class="company-history-details manual-price-details">
      <summary>Enter manual price</summary>
      <form class="manual-price-form" data-ticker="${holding.ticker}">
        <div class="manual-price-row">
          <input type="number" step="0.000001" min="0" name="manualPrice" placeholder="Manual price">
          <button type="submit" class="secondary-button">Save</button>
        </div>
      </form>
    </details>
  `;
}

export function renderCompanyList(portfolio, companyListElement, onManualPriceSubmit, filterText = '') {
  companyListElement.innerHTML = '';

  if (!portfolio.holdings.length) {
    companyListElement.innerHTML = '<p class="empty-state">No transactions yet.</p>';
    return;
  }

  const normalizedFilter = String(filterText || '').trim().toLowerCase();
  const sortedHoldings = sortHoldingsForCompanyList(portfolio.holdings)
    .filter(holding => {
      if (!normalizedFilter) return true;
      return [holding.companyName, holding.ticker]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalizedFilter));
    });

  if (!sortedHoldings.length) {
    companyListElement.innerHTML = '<p class="empty-state empty-state-card">No companies match your search.</p>';
    return;
  }

  sortedHoldings.forEach(holding => {
    const companyCard = document.createElement('article');
    companyCard.className = 'company-card';
    companyCard.id = `company-${String(holding.ticker || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    const currentPriceText = Number.isFinite(holding.currentMarketPrice)
      ? formatMoney(holding.currentMarketPrice)
      : 'API not reachable';

    const relatedTransactions = portfolio.transactionRows.filter(row => row.ticker === holding.ticker);
    const transactionHistoryHtml = relatedTransactions.map(transaction => {
      const transactionTypeClass = transaction.type === 'SELL'
        ? 'company-transaction-type-sell'
        : 'company-transaction-type-buy';

      return `
        <li>
          <strong class="company-transaction-type ${transactionTypeClass}">${transaction.type}</strong> ${transaction.date} — ${formatQuantity(transaction.quantity)} shares @ ${formatMoney(transaction.sharePrice)}, fee ${formatMoney(getTransactionFeeAmount(transaction))}
        </li>
      `;
    }).join('');

    const combinedGainLoss = holding.realizedGainLoss + (holding.unrealizedGainLoss || 0);
    const holdingStatus = holding.remainingQuantity > 0 ? 'Open position' : 'Closed position';
    const holdingStatusClass = holding.remainingQuantity > 0 ? 'status-pill-open' : 'status-pill-closed';

    companyCard.innerHTML = `
      <div class="company-card-header">
        <div class="company-identity">
          <span class="status-pill ${holdingStatusClass}">${holdingStatus}</span>
          <h3>${holding.companyName} <span>${holding.ticker}</span></h3>
          ${createTotalProfitLossLine(combinedGainLoss)}
          ${createRemainingSharesLine(holding)}
        </div>
      </div>
      <div class="company-metrics">
        <span><small>Average price</small><b>${formatMoney(holding.averagePrice)}</b></span>
        <span${getMarketPriceSourceTitle(holding)}><small>Current price</small><b>${currentPriceText} ${getMarketPriceSourceBadge(holding)}</b></span>
        <span><small>Realized</small><b class="${getGainLossClass(holding.realizedGainLoss)}">${formatMoney(holding.realizedGainLoss)}</b></span>
        <span><small>Unrealized</small><b class="${getGainLossClass(holding.unrealizedGainLoss)}">${formatMoney(holding.unrealizedGainLoss)}</b></span>
      </div>
      <details class="company-history-details">
        <summary>Transaction history</summary>
        <ul class="transaction-history">${transactionHistoryHtml}</ul>
      </details>
      ${createManualPriceForm(holding)}
    `;

    companyCard.querySelector('.manual-price-form')?.addEventListener('submit', onManualPriceSubmit);
    companyListElement.appendChild(companyCard);
  });
}

export function renderPortfolioInsights(portfolio, container) {
  if (!container) return;

  if (!portfolio?.holdings?.length) {
    container.innerHTML = '<p class="empty-state empty-state-card">Add transactions to see portfolio insights.</p>';
    return;
  }

  const openHoldings = portfolio.holdings.filter(holding => holding.remainingQuantity > 0);
  const feeByTicker = calculateFeesByTicker(portfolio.transactionRows || []);
  const insights = [
    createInsight('Largest position', findLargestPosition(openHoldings), holding => formatMoney(getHoldingMarketValue(holding))),
    createInsight('Best performer', findByValue(portfolio.holdings, getCombinedGainLoss, 'max'), holding => formatMoney(getCombinedGainLoss(holding)), true),
    createInsight('Worst performer', findByValue(portfolio.holdings, getCombinedGainLoss, 'min'), holding => formatMoney(getCombinedGainLoss(holding)), true),
    createFeeInsight('Highest fees', feeByTicker, portfolio.holdings)
  ];

  container.replaceChildren(...insights.map(renderInsightCard));
}

function createInsight(label, holding, valueFormatter, showClass = false) {
  return {
    label,
    ticker: holding?.ticker || '',
    title: holding ? `${holding.companyName} (${holding.ticker})` : 'Not available',
    value: holding ? valueFormatter(holding) : '—',
    valueClass: showClass && holding ? getGainLossClass(getCombinedGainLoss(holding)) : '',
    subtitle: holding ? `${formatQuantity(holding.remainingQuantity)} shares` : 'Add open positions'
  };
}

function createFeeInsight(label, feeByTicker, holdings) {
  const [ticker, fee] = [...feeByTicker.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const holding = holdings.find(item => item.ticker === ticker);
  return {
    label,
    ticker,
    title: holding ? `${holding.companyName} (${ticker})` : 'No fees yet',
    value: fee ? formatMoney(fee) : '—',
    valueClass: fee ? 'negative-value' : '',
    subtitle: fee ? 'Total transaction fees' : 'Fees appear after transactions'
  };
}

function renderInsightCard(insight) {
  const element = document.createElement(insight.ticker ? 'a' : 'article');
  element.className = 'insight-card';
  if (insight.ticker) element.href = `#company-${slugifyTicker(insight.ticker)}`;
  element.innerHTML = `
    <span>${insight.label}</span>
    <strong class="${insight.valueClass || ''}">${insight.value}</strong>
    <small>${insight.title}</small>
    <small>${insight.subtitle}</small>
  `;
  return element;
}

function calculateFeesByTicker(transactionRows) {
  return transactionRows.reduce((fees, transaction) => {
    const ticker = String(transaction.ticker || '').toUpperCase();
    if (!ticker) return fees;
    fees.set(ticker, (fees.get(ticker) || 0) + getTransactionFeeAmount(transaction));
    return fees;
  }, new Map());
}

function findLargestPosition(holdings) {
  return findByValue(holdings, getHoldingMarketValue, 'max');
}

function findByValue(items, getValue, mode = 'max') {
  const finiteItems = items.filter(item => Number.isFinite(getValue(item)));
  if (!finiteItems.length) return null;
  return finiteItems.reduce((bestItem, item) => {
    const bestValue = getValue(bestItem);
    const itemValue = getValue(item);
    return mode === 'min'
      ? (itemValue < bestValue ? item : bestItem)
      : (itemValue > bestValue ? item : bestItem);
  });
}

function getHoldingMarketValue(holding) {
  if (Number.isFinite(holding.currentMarketPrice)) {
    return holding.currentMarketPrice * holding.remainingQuantity;
  }
  return calculateAmountPlacedInCompany(holding);
}

function getCombinedGainLoss(holding) {
  return holding.realizedGainLoss + (holding.unrealizedGainLoss || 0);
}

function slugifyTicker(ticker) {
  return String(ticker || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
