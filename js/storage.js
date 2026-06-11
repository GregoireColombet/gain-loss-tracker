import { STORAGE_KEYS } from './constants.js';
import { validateTransactionSet } from './validation.js';
import { isSupabaseConfigured } from './supabaseClient.js';
import { getCurrentUser } from './authService.js';
import { loadTransactionsFromSupabase, saveTransactionsToSupabase, loadFeeRulesFromSupabase, saveFeeRulesToSupabase } from './supabaseStorage.js';

export function loadTransactionsFromLocalStorage() {
  const storedTransactions = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
  if (!storedTransactions) return [];

  try {
    const transactions = JSON.parse(storedTransactions);
    return Array.isArray(transactions) ? transactions : [];
  } catch (error) {
    console.error('Unable to parse stored transactions.', error);
    return [];
  }
}

export function saveTransactionsToLocalStorage(transactions) {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions, null, 2));
}

export async function loadTransactions() {
  if (isSupabaseConfigured()) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    try {
      return await loadTransactionsFromSupabase();
    } catch (error) {
      console.error('Unable to load from Supabase. Falling back to localStorage.', error);
      return loadTransactionsFromLocalStorage();
    }
  }

  return loadTransactionsFromLocalStorage();
}

export async function saveTransactions(transactions) {
  saveTransactionsToLocalStorage(transactions);

  if (!isSupabaseConfigured()) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  try {
    await saveTransactionsToSupabase(transactions);
  } catch (error) {
    console.error('Unable to save to Supabase. Local copy was kept.', error);
    throw error;
  }
}

export async function loadInitialTransactions() {
  const existingTransactions = await loadTransactions();
  if (existingTransactions.length > 0) return existingTransactions;

  if (isSupabaseConfigured()) return [];

  try {
    const response = await fetch('./data/transactions.json');
    if (!response.ok) throw new Error('Sample JSON file not reachable.');
    const sampleTransactions = await response.json();
    await saveTransactions(sampleTransactions);
    return sampleTransactions;
  } catch (error) {
    console.warn('Starting with empty transaction list.', error);
    return [];
  }
}

export function loadManualCurrentPrices() {
  const storedPrices = localStorage.getItem(STORAGE_KEYS.MANUAL_CURRENT_PRICES);
  if (!storedPrices) return {};

  try {
    return JSON.parse(storedPrices) || {};
  } catch (error) {
    console.error('Unable to parse manual prices.', error);
    return {};
  }
}

export function saveManualCurrentPrice(ticker, currentPrice) {
  const manualCurrentPrices = loadManualCurrentPrices();
  manualCurrentPrices[ticker.toUpperCase()] = Number(currentPrice);
  localStorage.setItem(STORAGE_KEYS.MANUAL_CURRENT_PRICES, JSON.stringify(manualCurrentPrices, null, 2));
}

export function exportTransactionsAsJson(transactions) {
  const jsonBlob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(jsonBlob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'transactions.json';
  downloadLink.click();
  URL.revokeObjectURL(downloadUrl);
}

export function importTransactionsFromFile(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = async () => {
      try {
        const importedTransactions = JSON.parse(fileReader.result);
        if (!Array.isArray(importedTransactions)) {
          reject(new Error('Imported file must contain a JSON array.'));
          return;
        }
        const validationErrors = validateTransactionSet(importedTransactions);
        if (validationErrors.length) {
          reject(new Error(validationErrors.join(' ')));
          return;
        }
        await saveTransactions(importedTransactions);
        resolve(importedTransactions);
      } catch (error) {
        reject(error);
      }
    };
    fileReader.onerror = () => reject(fileReader.error);
    fileReader.readAsText(file);
  });
}


export function loadFeeRulesFromLocalStorage(defaultFeeRules = {}) {
  const fallbackFeeRules = {
    buyFeeRule: defaultFeeRules.buyFeeRule || defaultFeeRules.sellFeeRule || {},
    sellFeeRule: defaultFeeRules.sellFeeRule || {}
  };

  const combinedStoredRules = localStorage.getItem(STORAGE_KEYS.FEE_RULES);
  if (combinedStoredRules) {
    try {
      return { ...fallbackFeeRules, ...JSON.parse(combinedStoredRules) };
    } catch (error) {
      console.error('Unable to parse combined fee rules.', error);
    }
  }

  const storedBuyRule = localStorage.getItem(STORAGE_KEYS.BUY_FEE_RULE);
  const storedSellRule = localStorage.getItem(STORAGE_KEYS.SELL_FEE_RULE);

  return {
    buyFeeRule: storedBuyRule ? { ...fallbackFeeRules.buyFeeRule, ...safeParseStoredRule(storedBuyRule) } : fallbackFeeRules.buyFeeRule,
    sellFeeRule: storedSellRule ? { ...fallbackFeeRules.sellFeeRule, ...safeParseStoredRule(storedSellRule) } : fallbackFeeRules.sellFeeRule
  };
}

export function saveFeeRulesToLocalStorage(feeRules) {
  localStorage.setItem(STORAGE_KEYS.FEE_RULES, JSON.stringify(feeRules, null, 2));
  localStorage.setItem(STORAGE_KEYS.BUY_FEE_RULE, JSON.stringify(feeRules.buyFeeRule, null, 2));
  localStorage.setItem(STORAGE_KEYS.SELL_FEE_RULE, JSON.stringify(feeRules.sellFeeRule, null, 2));
}

export async function loadFeeRules(defaultFeeRules) {
  const localFeeRules = loadFeeRulesFromLocalStorage(defaultFeeRules);

  if (!isSupabaseConfigured()) return localFeeRules;

  const currentUser = await getCurrentUser();
  if (!currentUser) return localFeeRules;

  try {
    const supabaseFeeRules = await loadFeeRulesFromSupabase();
    if (supabaseFeeRules) {
      saveFeeRulesToLocalStorage(supabaseFeeRules);
      return { ...localFeeRules, ...supabaseFeeRules };
    }
  } catch (error) {
    console.error('Unable to load fee rules from Supabase. Falling back to localStorage.', error);
  }

  return localFeeRules;
}

export async function saveFeeRules(feeRules) {
  saveFeeRulesToLocalStorage(feeRules);

  if (!isSupabaseConfigured()) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  try {
    await saveFeeRulesToSupabase(feeRules);
  } catch (error) {
    console.error('Unable to save fee rules to Supabase. Local copy was kept.', error);
    throw error;
  }
}

function safeParseStoredRule(storedRule) {
  try {
    return JSON.parse(storedRule);
  } catch (error) {
    console.error('Unable to parse stored fee rule.', error);
    return {};
  }
}
