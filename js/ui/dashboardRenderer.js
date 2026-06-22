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


function getMarketPriceSourceBadge(holding) {
  if (!Number.isFinite(holding.currentMarketPrice)) {
    return '<span class="price-source-badge price-source-error">No price</span>';
  }

  if (holding.isLiveApiMarketPrice) {
    return '<span class="price-source-badge price-source-live">Live API</span>';
  }

  if (holding.isCachedMarketPrice) {
    return '<span class="price-source-badge price-source-cache">Cached</span>';
  }

  return '<span class="price-source-badge price-source-manual">Manual</span>';
}

function getMarketPriceSourceTitle(holding) {
  return holding.marketPriceSource ? ` title="${holding.marketPriceSource.replace(/"/g, '&quot;')}"` : '';
}

function createAmountPlacedText(holding) {
  const amountPlaced = calculateAmountPlacedInCompany(holding);

  if (holding.remainingQuantity <= 0 || amountPlaced === 0) return '';

  return ` <span class="amount-placed-value">${formatMoney(amountPlaced)} placed</span>`;
}

export function renderCompanyList(portfolio, companyListElement, onManualPriceSubmit) {
  companyListElement.innerHTML = '';

  if (!portfolio.holdings.length) {
    companyListElement.innerHTML = '<p class="empty-state">No transactions yet.</p>';
    return;
  }

  const sortedHoldings = sortHoldingsForCompanyList(portfolio.holdings);

  sortedHoldings.forEach(holding => {
    const companyCard = document.createElement('article');
    companyCard.className = 'company-card';

    const currentPriceText = Number.isFinite(holding.currentMarketPrice)
      ? formatMoney(holding.currentMarketPrice)
      : 'API not reachable';

    const relatedTransactions = portfolio.transactionRows.filter(row => row.ticker === holding.ticker);
    const transactionHistoryHtml = relatedTransactions.map(transaction => `
      <li>
        <strong>${transaction.type}</strong> ${transaction.date} — ${formatQuantity(transaction.quantity)} shares @ ${formatMoney(transaction.sharePrice)}, fee ${formatMoney(getTransactionFeeAmount(transaction))}
      </li>
    `).join('');

    companyCard.innerHTML = `
      <div class="company-card-header">
        <div>
          <h3>${holding.companyName} (${holding.ticker})</h3>
          <p>Remaining shares: <strong>${formatQuantity(holding.remainingQuantity)}</strong>${createAmountPlacedText(holding)}</p>
        </div>
        <span class="${getGainLossClass(holding.realizedGainLoss + (holding.unrealizedGainLoss || 0))}">
          ${formatMoney(holding.realizedGainLoss + (holding.unrealizedGainLoss || 0))}
        </span>
      </div>
      <div class="company-metrics">
        <span>Average price: ${formatMoney(holding.averagePrice)}</span>
        <span${getMarketPriceSourceTitle(holding)}>Current price: ${currentPriceText} ${getMarketPriceSourceBadge(holding)}</span>
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

    companyCard.querySelector('.manual-price-form').addEventListener('submit', onManualPriceSubmit);
    companyListElement.appendChild(companyCard);
  });
}
