import { TRANSACTION_TYPES } from './constants.js';

export function sortTransactionsByDate(transactions) {
  return [...transactions].sort((firstTransaction, secondTransaction) => {
    const firstDate = new Date(firstTransaction.date).getTime();
    const secondDate = new Date(secondTransaction.date).getTime();
    if (firstDate !== secondDate) return firstDate - secondDate;

    const firstCreatedAt = new Date(firstTransaction.createdAt || 0).getTime();
    const secondCreatedAt = new Date(secondTransaction.createdAt || 0).getTime();
    if (firstCreatedAt !== secondCreatedAt) return firstCreatedAt - secondCreatedAt;

    return String(firstTransaction.id || '').localeCompare(String(secondTransaction.id || ''));
  });
}

export function calculateNewAveragePrice(currentAveragePrice, currentQuantity, buyPrice, buyQuantity, buyTransactionFee = 0) {
  const currentCost = currentAveragePrice * currentQuantity;
  const newCost = buyPrice * buyQuantity + buyTransactionFee;
  const newQuantity = currentQuantity + buyQuantity;
  if (newQuantity === 0) return 0;
  return (currentCost + newCost) / newQuantity;
}

export function calculateRealizedGainLoss(sellPrice, averageBuyPrice, soldQuantity, transactionFee) {
  return (sellPrice - averageBuyPrice) * soldQuantity - transactionFee;
}

export function calculateUnrealizedGainLoss(currentMarketPrice, averageBuyPrice, remainingQuantity) {
  if (!Number.isFinite(currentMarketPrice)) return null;
  return (currentMarketPrice - averageBuyPrice) * remainingQuantity;
}

export function calculatePortfolioFromTransactions(transactions) {
  const sortedTransactions = sortTransactionsByDate(transactions);
  const holdingsByTicker = {};
  const transactionRows = [];
  let totalRealizedGainLoss = 0;
  let totalBuyCost = 0;
  let totalSellRevenue = 0;
  let totalFees = 0;

  for (const transaction of sortedTransactions) {
    const ticker = transaction.ticker.toUpperCase();
    const existingHolding = holdingsByTicker[ticker] || createEmptyHolding(transaction.companyName, ticker);

    if (transaction.type === TRANSACTION_TYPES.BUY) {
      existingHolding.averagePrice = calculateNewAveragePrice(
        existingHolding.averagePrice,
        existingHolding.remainingQuantity,
        transaction.sharePrice,
        transaction.quantity,
        transaction.transactionFee
      );
      existingHolding.remainingQuantity += transaction.quantity;
      existingHolding.companyName = transaction.companyName;
      totalBuyCost += transaction.sharePrice * transaction.quantity + transaction.transactionFee;
    }

    if (transaction.type === TRANSACTION_TYPES.SELL) {
      const soldQuantity = Math.min(transaction.quantity, existingHolding.remainingQuantity);
      const realizedGainLoss = calculateRealizedGainLoss(
        transaction.sharePrice,
        existingHolding.averagePrice,
        soldQuantity,
        transaction.transactionFee
      );
      existingHolding.remainingQuantity -= soldQuantity;
      existingHolding.realizedGainLoss += realizedGainLoss;
      totalRealizedGainLoss += realizedGainLoss;
      totalSellRevenue += transaction.sharePrice * soldQuantity - transaction.transactionFee;
    }

    totalFees += transaction.transactionFee;
    holdingsByTicker[ticker] = existingHolding;

    transactionRows.push({
      ...transaction,
      averagePriceAfterTransaction: existingHolding.averagePrice,
      remainingQuantityAfterTransaction: existingHolding.remainingQuantity,
      realizedGainLossAfterTransaction: existingHolding.realizedGainLoss
    });
  }

  const holdings = Object.values(holdingsByTicker);
  const totalCurrentlyInvested = holdings.reduce((sum, holding) => {
    return sum + holding.averagePrice * holding.remainingQuantity;
  }, 0);

  return {
    holdings,
    holdingsByTicker,
    transactionRows,
    totalCurrentlyInvested,
    totalRealizedGainLoss,
    totalBuyCost,
    totalSellRevenue,
    totalFees
  };
}

function createEmptyHolding(companyName, ticker) {
  return {
    companyName,
    ticker,
    averagePrice: 0,
    remainingQuantity: 0,
    realizedGainLoss: 0
  };
}

export function findSellQuantityViolations(transactions) {
  const sortedTransactions = sortTransactionsByDate(transactions);
  const remainingQuantityByTicker = {};
  const violations = [];

  for (const transaction of sortedTransactions) {
    const ticker = transaction.ticker.toUpperCase();
    const currentRemainingQuantity = remainingQuantityByTicker[ticker] || 0;

    if (transaction.type === TRANSACTION_TYPES.BUY) {
      remainingQuantityByTicker[ticker] = currentRemainingQuantity + transaction.quantity;
    }

    if (transaction.type === TRANSACTION_TYPES.SELL) {
      if (transaction.quantity > currentRemainingQuantity) {
        violations.push({
          transactionId: transaction.id,
          ticker,
          date: transaction.date,
          requestedQuantity: transaction.quantity,
          availableQuantity: currentRemainingQuantity
        });
      }

      remainingQuantityByTicker[ticker] = Math.max(0, currentRemainingQuantity - transaction.quantity);
    }
  }

  return violations;
}

export function calculatePortfolioWithMarketPrices(portfolio, marketPricesByTicker, manualPricesByTicker = {}, marketPriceResultsByTicker = {}) {
  let totalUnrealizedGainLoss = 0;
  let hasMissingUnrealizedValue = false;

  const holdings = portfolio.holdings.map(holding => {
    const liveMarketPrice = marketPricesByTicker[holding.ticker];
    const manualMarketPrice = manualPricesByTicker[holding.ticker];
    const selectedMarketPrice = Number.isFinite(liveMarketPrice) ? liveMarketPrice : manualMarketPrice;
    const marketPriceResult = marketPriceResultsByTicker[holding.ticker];
    const marketPriceSource = Number.isFinite(liveMarketPrice)
      ? marketPriceResult?.source || 'Live market price API'
      : Number.isFinite(manualMarketPrice)
        ? 'Manual fallback price'
        : 'No market price available';
    const isCachedMarketPrice = /cached/i.test(marketPriceSource);
    const isLiveApiMarketPrice = Number.isFinite(liveMarketPrice) && !isCachedMarketPrice;
    const unrealizedGainLoss = calculateUnrealizedGainLoss(
      selectedMarketPrice,
      holding.averagePrice,
      holding.remainingQuantity
    );

    if (unrealizedGainLoss === null && holding.remainingQuantity > 0) {
      hasMissingUnrealizedValue = true;
    } else if (unrealizedGainLoss !== null) {
      totalUnrealizedGainLoss += unrealizedGainLoss;
    }

    return {
      ...holding,
      currentMarketPrice: selectedMarketPrice,
      liveMarketPrice,
      manualMarketPrice,
      marketPriceSource,
      isCachedMarketPrice,
      isLiveApiMarketPrice,
      unrealizedGainLoss
    };
  });

  return {
    ...portfolio,
    holdings,
    totalUnrealizedGainLoss,
    hasMissingUnrealizedValue,
    overallGainLoss: portfolio.totalRealizedGainLoss + totalUnrealizedGainLoss
  };
}

export function createImpactPreview(oldTransactions, newTransactions) {
  const oldPortfolio = calculatePortfolioFromTransactions(oldTransactions);
  const newPortfolio = calculatePortfolioFromTransactions(newTransactions);

  return {
    oldPortfolio,
    newPortfolio,
    totalCurrentlyInvestedChange: newPortfolio.totalCurrentlyInvested - oldPortfolio.totalCurrentlyInvested,
    realizedGainLossChange: newPortfolio.totalRealizedGainLoss - oldPortfolio.totalRealizedGainLoss,
    totalFeesChange: newPortfolio.totalFees - oldPortfolio.totalFees
  };
}

export function createGainLossTimeline(transactions, options = {}) {
  const sortedTransactions = sortTransactionsByDate(transactions);
  if (!sortedTransactions.length) return [];

  const period = options.period || 'week';
  const firstTransactionDate = parseDateOnly(sortedTransactions[0].date);
  const startDate = options.startDate ? parseDateOnly(options.startDate) : firstTransactionDate;
  const endDate = options.endDate ? parseDateOnly(options.endDate) : parseDateOnly(getTodayDateString());

  if (!startDate || !endDate || startDate > endDate) return [];

  const bucketStarts = createBucketStarts(startDate, endDate, period);
  const timelineData = [];
  let cumulativeRealizedGainLoss = 0;
  let transactionIndex = 0;
  const temporaryTransactions = [];

  for (const bucketStart of bucketStarts) {
    const bucketEnd = getBucketEndDate(bucketStart, period, endDate);

    while (transactionIndex < sortedTransactions.length) {
      const transactionDate = parseDateOnly(sortedTransactions[transactionIndex].date);
      if (transactionDate > bucketEnd) break;
      temporaryTransactions.push(sortedTransactions[transactionIndex]);
      const portfolio = calculatePortfolioFromTransactions(temporaryTransactions);
      cumulativeRealizedGainLoss = portfolio.totalRealizedGainLoss;
      transactionIndex += 1;
    }

    if (bucketEnd >= startDate) {
      timelineData.push({
        date: formatDateOnly(bucketStart),
        label: createBucketLabel(bucketStart, period),
        value: cumulativeRealizedGainLoss
      });
    }
  }

  return timelineData;
}

function createBucketStarts(startDate, endDate, period) {
  const bucketStarts = [];
  let cursor = alignDateToPeriodStart(startDate, period);

  while (cursor <= endDate) {
    bucketStarts.push(new Date(cursor));
    cursor = addPeriod(cursor, period);
  }

  return bucketStarts;
}

function alignDateToPeriodStart(date, period) {
  const alignedDate = new Date(date);
  alignedDate.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const dayOfWeek = alignedDate.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    alignedDate.setDate(alignedDate.getDate() - daysSinceMonday);
  }

  if (period === 'month') {
    alignedDate.setDate(1);
  }

  if (period === 'year') {
    alignedDate.setMonth(0, 1);
  }

  return alignedDate;
}

function addPeriod(date, period) {
  const nextDate = new Date(date);

  if (period === 'day') nextDate.setDate(nextDate.getDate() + 1);
  else if (period === 'month') nextDate.setMonth(nextDate.getMonth() + 1);
  else if (period === 'year') nextDate.setFullYear(nextDate.getFullYear() + 1);
  else nextDate.setDate(nextDate.getDate() + 7);

  return nextDate;
}

function getBucketEndDate(bucketStart, period, maximumEndDate) {
  const nextBucketStart = addPeriod(bucketStart, period);
  nextBucketStart.setDate(nextBucketStart.getDate() - 1);
  return nextBucketStart > maximumEndDate ? maximumEndDate : nextBucketStart;
}

function createBucketLabel(date, period) {
  if (period === 'day') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  if (period === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }

  if (period === 'year') {
    return String(date.getFullYear());
  }

  return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function parseDateOnly(dateString) {
  if (!dateString) return null;
  const [year, month, day] = String(dateString).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateString() {
  return formatDateOnly(new Date());
}
