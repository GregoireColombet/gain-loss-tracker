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

export function calculatePortfolioWithMarketPrices(portfolio, marketPricesByTicker, manualPricesByTicker = {}) {
  let totalUnrealizedGainLoss = 0;
  let hasMissingUnrealizedValue = false;

  const holdings = portfolio.holdings.map(holding => {
    const liveMarketPrice = marketPricesByTicker[holding.ticker];
    const manualMarketPrice = manualPricesByTicker[holding.ticker];
    const selectedMarketPrice = Number.isFinite(liveMarketPrice) ? liveMarketPrice : manualMarketPrice;
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

export function createGainLossTimeline(transactions) {
  const sortedTransactions = sortTransactionsByDate(transactions);
  const timelineTransactions = [];
  let cumulativeRealizedGainLoss = 0;
  const temporaryTransactions = [];

  for (const transaction of sortedTransactions) {
    temporaryTransactions.push(transaction);
    const portfolio = calculatePortfolioFromTransactions(temporaryTransactions);
    cumulativeRealizedGainLoss = portfolio.totalRealizedGainLoss;
    timelineTransactions.push({
      date: transaction.date,
      value: cumulativeRealizedGainLoss
    });
  }

  return timelineTransactions;
}
