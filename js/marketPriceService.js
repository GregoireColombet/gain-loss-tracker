import { API_STATUS } from './constants.js';

const YAHOO_FINANCE_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';

export async function fetchCurrentMarketPrice(ticker) {
  const normalizedTicker = String(ticker || '').trim().toUpperCase();
  if (!normalizedTicker) {
    return { ticker: normalizedTicker, status: API_STATUS.NOT_REACHABLE, price: null };
  }

  try {
    const response = await fetch(`${YAHOO_FINANCE_QUOTE_URL}${encodeURIComponent(normalizedTicker)}`);
    if (!response.ok) throw new Error('Yahoo Finance response was not successful.');

    const data = await response.json();
    const quote = data?.quoteResponse?.result?.[0];
    const marketPrice = Number(quote?.regularMarketPrice);

    if (!Number.isFinite(marketPrice)) throw new Error('Yahoo Finance price is missing or invalid.');

    return {
      ticker: normalizedTicker,
      status: API_STATUS.READY,
      price: marketPrice,
      source: 'Yahoo Finance unofficial endpoint, personal/educational use only'
    };
  } catch (error) {
    console.warn(`API not reachable for ${normalizedTicker}.`, error);
    return {
      ticker: normalizedTicker,
      status: API_STATUS.NOT_REACHABLE,
      price: null,
      source: 'API not reachable'
    };
  }
}

export async function fetchCurrentMarketPrices(tickers) {
  const uniqueTickers = [...new Set(tickers.map(ticker => String(ticker).toUpperCase()))];
  const priceResults = await Promise.all(uniqueTickers.map(fetchCurrentMarketPrice));

  return priceResults.reduce((result, priceResult) => {
    result[priceResult.ticker] = priceResult;
    return result;
  }, {});
}
