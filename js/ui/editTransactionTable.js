import { calculatePortfolioFromTransactions } from '../calculations.js';
import { formatMoney, formatQuantity, getGainLossClass } from '../uiHelpers.js';

export const TRANSACTION_SORT_FIELDS = Object.freeze({
  DATE: 'date',
  COMPANY: 'companyName'
});

export const TRANSACTION_SORT_DIRECTIONS = Object.freeze({
  ASC: 'asc',
  DESC: 'desc'
});

const DEFAULT_TRANSACTION_SORT = Object.freeze({
  field: TRANSACTION_SORT_FIELDS.DATE,
  direction: TRANSACTION_SORT_DIRECTIONS.DESC
});

function compareText(firstValue, secondValue) {
  return String(firstValue || '').localeCompare(String(secondValue || ''), undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

function compareDates(firstTransaction, secondTransaction) {
  const dateComparison = compareText(firstTransaction.date, secondTransaction.date);
  if (dateComparison !== 0) return dateComparison;

  return compareText(firstTransaction.createdAt, secondTransaction.createdAt);
}

export function sortTransactionRows(transactionRows, sortConfig = DEFAULT_TRANSACTION_SORT) {
  const activeSort = { ...DEFAULT_TRANSACTION_SORT, ...sortConfig };

  return [...transactionRows].sort((firstTransaction, secondTransaction) => {
    const comparison = activeSort.field === TRANSACTION_SORT_FIELDS.COMPANY
      ? compareText(firstTransaction.companyName, secondTransaction.companyName) || compareDates(firstTransaction, secondTransaction)
      : compareDates(firstTransaction, secondTransaction);

    return activeSort.direction === TRANSACTION_SORT_DIRECTIONS.DESC ? comparison * -1 : comparison;
  });
}

function createTransactionTypeBadge(type) {
  const badgeClass = type === 'SELL' ? 'transaction-type-badge sell' : 'transaction-type-badge buy';
  return `<span class="${badgeClass}">${type}</span>`;
}

export function renderTransactionTable(transactions, transactionTableBody, onTableActionClick, sortConfig = DEFAULT_TRANSACTION_SORT) {
  const portfolio = calculatePortfolioFromTransactions(transactions);
  transactionTableBody.innerHTML = '';

  const sortedTransactionRows = sortTransactionRows(portfolio.transactionRows, sortConfig);

  sortedTransactionRows.forEach(transaction => {
    const tableRow = document.createElement('tr');
    tableRow.innerHTML = `
      <td data-label="Date">${transaction.date}</td>
      <td data-label="Type">${createTransactionTypeBadge(transaction.type)}</td>
      <td data-label="Company">${transaction.companyName}</td>
      <td data-label="Ticker">${transaction.ticker}</td>
      <td data-label="Price">${formatMoney(transaction.sharePrice)}</td>
      <td data-label="Quantity">${formatQuantity(transaction.quantity)}</td>
      <td data-label="Fee">${formatMoney(transaction.transactionFee)}</td>
      <td data-label="Average after">${formatMoney(transaction.averagePriceAfterTransaction)}</td>
      <td data-label="Realized after" class="${getGainLossClass(transaction.realizedGainLossAfterTransaction)}">${formatMoney(transaction.realizedGainLossAfterTransaction)}</td>
      <td data-label="Actions" class="table-actions">
        <button type="button" data-action="edit" data-id="${transaction.id}">Edit</button>
        <button type="button" data-action="delete" data-id="${transaction.id}" class="danger-button">Delete</button>
      </td>
    `;
    tableRow.addEventListener('click', onTableActionClick);
    transactionTableBody.appendChild(tableRow);
  });
}
