import { TRANSACTION_TYPES } from './constants.js';
import { findSellQuantityViolations } from './calculations.js';

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

  const proposedTransactions = [
    ...existingTransactions.filter(item => item.id !== transactionIdToIgnore),
    transaction
  ];

  const sellQuantityViolations = findSellQuantityViolations(proposedTransactions);
  const firstViolation = sellQuantityViolations[0];

  if (firstViolation) {
    errors.push(
      `Selling quantity cannot be over owned quantity. ` +
      `${firstViolation.ticker} has only ${firstViolation.availableQuantity} share(s) available on ${firstViolation.date}, ` +
      `but the sell transaction requests ${firstViolation.requestedQuantity}.`
    );
  }

  return errors;
}

export function validateTransactionSet(transactions) {
  const errors = [];

  transactions.forEach((transaction, index) => {
    const lineNumber = index + 1;
    if (!Object.values(TRANSACTION_TYPES).includes(transaction.type)) errors.push(`Transaction ${lineNumber}: Transaction type is required.`);
    if (!transaction.companyName) errors.push(`Transaction ${lineNumber}: Company name is required.`);
    if (!transaction.ticker) errors.push(`Transaction ${lineNumber}: Ticker is required.`);
    if (!transaction.date) errors.push(`Transaction ${lineNumber}: Date is required.`);
    if (!Number.isFinite(Number(transaction.sharePrice)) || Number(transaction.sharePrice) <= 0) errors.push(`Transaction ${lineNumber}: Share price must be greater than 0.`);
    if (!Number.isFinite(Number(transaction.quantity)) || Number(transaction.quantity) <= 0) errors.push(`Transaction ${lineNumber}: Quantity must be greater than 0.`);
    if (!Number.isFinite(Number(transaction.transactionFee || 0)) || Number(transaction.transactionFee || 0) < 0) errors.push(`Transaction ${lineNumber}: Transaction fee cannot be negative.`);
  });

  const sellQuantityViolations = findSellQuantityViolations(transactions);
  sellQuantityViolations.forEach(violation => {
    errors.push(
      `Selling quantity cannot be over owned quantity. ` +
      `${violation.ticker} has only ${violation.availableQuantity} share(s) available on ${violation.date}, ` +
      `but the sell transaction requests ${violation.requestedQuantity}.`
    );
  });

  return errors;
}
