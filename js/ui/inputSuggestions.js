let currentSuggestionTransactions = [];

/**
 * Builds lightweight native autocomplete for transaction company and ticker inputs.
 * Suggestions are generated from saved transactions only, so no external calls are needed.
 */
export function refreshTransactionInputSuggestions(transactions, formElement) {
  currentSuggestionTransactions = Array.isArray(transactions) ? transactions : [];
  const companyDatalist = document.querySelector('#companyNameSuggestions');
  const tickerDatalist = document.querySelector('#tickerSuggestions');
  if (!companyDatalist || !tickerDatalist) return;

  populateDatalist(companyDatalist, getUniqueSortedValues(transactions, 'companyName'));
  populateDatalist(tickerDatalist, getUniqueSortedValues(transactions, 'ticker'));
  bindLinkedSuggestionAutofill(transactions, formElement);
}

function getUniqueSortedValues(transactions, fieldName) {
  return [...new Set(
    transactions
      .map(transaction => String(transaction[fieldName] || '').trim())
      .filter(Boolean)
  )].sort((firstValue, secondValue) => firstValue.localeCompare(secondValue, undefined, { sensitivity: 'base' }));
}

function populateDatalist(datalistElement, values) {
  datalistElement.replaceChildren(
    ...values.map(value => {
      const option = document.createElement('option');
      option.value = value;
      return option;
    })
  );
}

function bindLinkedSuggestionAutofill(transactions, formElement) {
  if (!formElement || formElement.dataset.suggestionAutofillBound === 'true') return;

  formElement.companyName?.addEventListener('change', () => {
    const matchedTransaction = findLatestTransactionByCompany(currentSuggestionTransactions, formElement.companyName.value);
    if (matchedTransaction && !String(formElement.ticker.value || '').trim()) {
      formElement.ticker.value = matchedTransaction.ticker;
    }
  });

  formElement.ticker?.addEventListener('change', () => {
    const matchedTransaction = findLatestTransactionByTicker(currentSuggestionTransactions, formElement.ticker.value);
    if (matchedTransaction && !String(formElement.companyName.value || '').trim()) {
      formElement.companyName.value = matchedTransaction.companyName;
    }
  });

  formElement.dataset.suggestionAutofillBound = 'true';
}

function findLatestTransactionByCompany(transactions, companyName) {
  const normalizedCompanyName = String(companyName || '').trim().toLowerCase();
  if (!normalizedCompanyName) return null;

  return [...transactions]
    .reverse()
    .find(transaction => String(transaction.companyName || '').trim().toLowerCase() === normalizedCompanyName) || null;
}

function findLatestTransactionByTicker(transactions, ticker) {
  const normalizedTicker = String(ticker || '').trim().toUpperCase();
  if (!normalizedTicker) return null;

  return [...transactions]
    .reverse()
    .find(transaction => String(transaction.ticker || '').trim().toUpperCase() === normalizedTicker) || null;
}
