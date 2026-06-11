import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculatePortfolioFromTransactions,
  calculatePortfolioWithMarketPrices,
  createImpactPreview,
  findSellQuantityViolations,
  sortTransactionsByDate
} from '../js/calculations.js';
import { validateTransactionSet } from '../js/validation.js';
import { calculateMinimumBreakEvenSellPrice, calculateSellFee } from '../js/feeCalculator.js';

const transactions = JSON.parse(await readFile(new URL('../data/test-transactions.json', import.meta.url), 'utf8'));

function nearlyEqual(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message}: expected ${expected}, got ${actual}`);
}

assert.equal(validateTransactionSet(transactions).length, 0, 'valid test dataset should have no validation errors');

const portfolio = calculatePortfolioFromTransactions(transactions);
const abc = portfolio.holdingsByTicker.ABC;
const xyz = portfolio.holdingsByTicker.XYZ;

nearlyEqual(abc.averagePrice, 200.25, 'ABC average price resets to new cycle after all previous ABC shares were sold and includes buy fee');
nearlyEqual(abc.remainingQuantity, 3, 'ABC remaining quantity after second cycle');
nearlyEqual(abc.realizedGainLoss, 121.75, 'ABC realized gain/loss including buy/sell fees');

nearlyEqual(xyz.averagePrice, 45.208333333333336, 'XYZ weighted average after partial sell and later buy including buy fees');
nearlyEqual(xyz.remainingQuantity, 4, 'XYZ remaining quantity');
nearlyEqual(xyz.realizedGainLoss, 9.333333333333332, 'XYZ realized gain/loss including buy/sell fees');

nearlyEqual(portfolio.totalCurrentlyInvested, 781.5833333333334, 'total currently invested including buy fees in cost basis');
nearlyEqual(portfolio.totalRealizedGainLoss, 131.08333333333331, 'total realized gain/loss including fees');

const marketPortfolio = calculatePortfolioWithMarketPrices(portfolio, { ABC: 220 }, { XYZ: 50 });
nearlyEqual(marketPortfolio.totalUnrealizedGainLoss, 78.41666666666666, 'total unrealized gain/loss using live ABC and manual XYZ');
nearlyEqual(marketPortfolio.overallGainLoss, 209.5, 'overall gain/loss');
assert.equal(marketPortfolio.hasMissingUnrealizedValue, false, 'manual fallback should remove missing-value flag');

const missingMarketPortfolio = calculatePortfolioWithMarketPrices(portfolio, {}, {});
assert.equal(missingMarketPortfolio.hasMissingUnrealizedValue, true, 'missing live/manual prices should be flagged without changing records');
nearlyEqual(portfolio.holdingsByTicker.ABC.averagePrice, 200.25, 'market-price failure must not change average price');
nearlyEqual(portfolio.holdingsByTicker.ABC.remainingQuantity, 3, 'market-price failure must not change quantity');

const editedTransactions = transactions.map(transaction =>
  transaction.id === 'tx_abc_001'
    ? { ...transaction, sharePrice: 120 }
    : transaction
);
const editedPortfolio = calculatePortfolioFromTransactions(editedTransactions);
nearlyEqual(editedPortfolio.holdingsByTicker.ABC.realizedGainLoss, -78.25, 'editing first ABC buy propagates through sells before full liquidation only');
nearlyEqual(editedPortfolio.holdingsByTicker.ABC.averagePrice, 200.25, 'editing old fully sold cycle does not affect later new ABC buy cycle average');
nearlyEqual(editedPortfolio.holdingsByTicker.ABC.remainingQuantity, 3, 'editing old cycle does not affect later ABC remaining quantity');

const impactPreview = createImpactPreview(transactions, editedTransactions);
nearlyEqual(impactPreview.realizedGainLossChange, -200, 'impact preview shows changed realized gain/loss');
nearlyEqual(impactPreview.totalCurrentlyInvestedChange, 0, 'old fully sold cycle edit does not change current invested amount');

const editedFeeTransactions = transactions.map(transaction =>
  transaction.id === 'tx_abc_001'
    ? { ...transaction, transactionFee: 21 }
    : transaction
);
const editedFeePreview = createImpactPreview(transactions, editedFeeTransactions);
nearlyEqual(editedFeePreview.realizedGainLossChange, -20, 'editing an old buy fee propagates through later sells in the same open-cost cycle');
nearlyEqual(editedFeePreview.totalFeesChange, 20, 'impact preview shows changed total fees');

const invalidFutureBuyDataset = [
  { id: 'bad_sell', type: 'SELL', companyName: 'Late Buy Inc.', ticker: 'LATE', date: '2024-01-02', sharePrice: 10, quantity: 1, transactionFee: 0 },
  { id: 'future_buy', type: 'BUY', companyName: 'Late Buy Inc.', ticker: 'LATE', date: '2024-01-03', sharePrice: 8, quantity: 1, transactionFee: 0 }
];
assert.equal(findSellQuantityViolations(invalidFutureBuyDataset).length, 1, 'future buy cannot validate an earlier sell');
assert.ok(validateTransactionSet(invalidFutureBuyDataset).length > 0, 'invalid future-buy dataset should fail validation');

const invalidDeletionDataset = transactions.filter(transaction => transaction.id !== 'tx_abc_001');
assert.ok(validateTransactionSet(invalidDeletionDataset).length > 0, 'deleting an early buy should be blocked if later sells exceed available shares');

const sameDateSorted = sortTransactionsByDate([
  { id: 'b', date: '2024-01-01', createdAt: '2024-01-01T10:00:00Z' },
  { id: 'a', date: '2024-01-01', createdAt: '2024-01-01T09:00:00Z' }
]);
assert.deepEqual(sameDateSorted.map(transaction => transaction.id), ['a', 'b'], 'same-date transactions should sort by createdAt');


const flatBreakEven = calculateMinimumBreakEvenSellPrice(10, 10, {
  thresholdAmount: 200,
  flatFee: 5,
  percentageFeeRate: 0.01
});
assert.equal(flatBreakEven.feeMode, 'flat', 'break-even should use flat fee below threshold');
nearlyEqual(flatBreakEven.minimumSellPrice, 10.5, 'flat-fee break-even minimum price');
nearlyEqual(flatBreakEven.sellFeeAmount, 5, 'flat-fee break-even fee amount');

const percentageBreakEven = calculateMinimumBreakEvenSellPrice(100, 10, {
  thresholdAmount: 500,
  flatFee: 5,
  percentageFeeRate: 0.01
});
assert.equal(percentageBreakEven.feeMode, 'percentage', 'break-even should use percentage fee over threshold');
nearlyEqual(percentageBreakEven.grossSellAmount, 1010.1010101010102, 'percentage-fee break-even gross amount');
nearlyEqual(percentageBreakEven.sellFeeAmount, 10.101010101010102, 'percentage-fee break-even fee amount');
nearlyEqual(percentageBreakEven.netAmountAfterFee, 1000, 'percentage-fee net amount equals cost basis');

nearlyEqual(calculateSellFee(199.99, { thresholdAmount: 200, flatFee: 5, percentageFeeRate: 0.01 }), 5, 'fee below threshold is flat');
nearlyEqual(calculateSellFee(200, { thresholdAmount: 200, flatFee: 5, percentageFeeRate: 0.01 }), 2, 'fee at threshold is percentage');

console.log('All portfolio calculation, propagation, validation, API-failure, sort, and break-even fee tests passed.');

