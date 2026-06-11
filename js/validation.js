import { TRANSACTION_TYPES } from './constants.js';
import { calculatePortfolioFromTransactions } from './calculations.js';

export function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase();
}

export function createTransactionFromForm(formElement) {
  const formData = new FormData(formElement);
  return {
    id: formData.get('transactionId') || `tx_${crypto.randomUUID()}`,
    type: formData.get('type'),
    companyName: String(formData.get('companyName') || '').trim(),
    ticker: normalizeTicker(formData.get('ticker')),
    date: formData.get('date'),
    sharePrice: Number(formData.get('sharePrice')),
    quantity: Number(formData.get('quantity')),
    transactionFee: Number(formData.get('transactionFee') || 0)
  };
}

export function validateTransaction(transaction, existingTransactions, transactionIdToIgnore = null) {
  const errors = [];

  if (!Object.values(TRANSACTION_TYPES).includes(transaction.type)) errors.push('Transaction type is required.');
  if (!transaction.companyName) errors.push('Company name is required.');
  if (!transaction.ticker) errors.push('Ticker is required.');
  if (!transaction.date) errors.push('Date is required.');
  if (!Number.isFinite(transaction.sharePrice) || transaction.sharePrice <= 0) errors.push('Share price must be greater than 0.');
  if (!Number.isFinite(transaction.quantity) || transaction.quantity <= 0) errors.push('Quantity must be greater than 0.');
  if (!Number.isFinite(transaction.transactionFee) || transaction.transactionFee < 0) errors.push('Transaction fee cannot be negative.');

  if (transaction.type === TRANSACTION_TYPES.SELL) {
    const filteredTransactions = existingTransactions.filter(item => item.id !== transactionIdToIgnore);
    const portfolioBeforeSale = calculatePortfolioFromTransactions(filteredTransactions);
    const holding = portfolioBeforeSale.holdingsByTicker[transaction.ticker];
    const availableQuantity = holding ? holding.remainingQuantity : 0;

    if (transaction.quantity > availableQuantity) {
      errors.push(`Selling quantity cannot be over currently owned quantity. Available quantity: ${availableQuantity}.`);
    }
  }

  return errors;
}
