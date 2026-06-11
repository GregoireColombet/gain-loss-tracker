export const TRANSACTION_TYPES = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL'
});

export const API_STATUS = Object.freeze({
  READY: 'READY',
  NOT_REACHABLE: 'API_NOT_REACHABLE',
  LOADING: 'LOADING'
});

export const STORAGE_KEYS = Object.freeze({
  TRANSACTIONS: 'stockTrackerTransactions',
  MANUAL_CURRENT_PRICES: 'stockTrackerManualCurrentPrices',
  SELL_FEE_RULE: 'stockTrackerSellFeeRule'
});
