import { normalizeTicker } from './validation.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseClient.js';

const DEFAULT_COMPANY_MARKET_DATA_FUNCTION_NAME = 'get-company-market-data';
const COMPANY_MARKET_DATA_FUNCTION_NAME = window.STOCK_TRACKER_CONFIG?.companyMarketDataFunctionName || DEFAULT_COMPANY_MARKET_DATA_FUNCTION_NAME;
const COMPANY_MARKET_DATA_FUNCTION_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${COMPANY_MARKET_DATA_FUNCTION_NAME}`;
const COMPANY_MARKET_DATA_CACHE_KEY = 'stockTrackerCompanyMarketData';
const COMPANY_MARKET_DATA_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function normalizeCompanyMarketDataResponse(data) {
  if (!data || typeof data !== 'object') return {};
  return data.data && typeof data.data === 'object' ? data.data : data;
}

function loadCachedCompanyMarketData() {
  try {
    const storedCache = localStorage.getItem(COMPANY_MARKET_DATA_CACHE_KEY);
    return storedCache ? JSON.parse(storedCache) : {};
  } catch (error) {
    console.warn('Unable to read cached company market data.', error);
    return {};
  }
}

function saveCachedCompanyMarketData(dataByTicker) {
  try {
    const existingCache = loadCachedCompanyMarketData();
    const savedAt = new Date().toISOString();
    const nextCache = { ...existingCache };

    Object.entries(dataByTicker || {}).forEach(([ticker, data]) => {
      nextCache[ticker] = { data, savedAt };
    });

    localStorage.setItem(COMPANY_MARKET_DATA_CACHE_KEY, JSON.stringify(nextCache));
  } catch (error) {
    console.warn('Unable to cache company market data.', error);
  }
}

function getRecentCachedCompanyMarketData(ticker) {
  const cachedItem = loadCachedCompanyMarketData()[ticker];
  const savedAtTime = Date.parse(cachedItem?.savedAt || '');

  if (!cachedItem?.data || !Number.isFinite(savedAtTime)) return null;
  if (Date.now() - savedAtTime > COMPANY_MARKET_DATA_CACHE_MAX_AGE_MS) return null;

  return {
    ...cachedItem.data,
    source: cachedItem.data?.source || 'cached Finnhub company market data',
    sourceType: 'cached'
  };
}

function buildCachedFallback(tickers) {
  return tickers.reduce((result, ticker) => {
    result[ticker] = getRecentCachedCompanyMarketData(ticker) || {
      ticker,
      source: 'No company market data available',
      sourceType: 'missing',
      nextEarnings: null,
      lastEarnings: null,
      priceTarget: null,
      peers: []
    };
    return result;
  }, {});
}

export async function fetchCompanyMarketData(tickers) {
  const uniqueTickers = [...new Set((tickers || []).map(normalizeTicker).filter(Boolean))];

  if (!uniqueTickers.length) return {};

  if (!isSupabaseConfigured()) {
    return buildCachedFallback(uniqueTickers);
  }

  try {
    const response = await fetch(COMPANY_MARKET_DATA_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'x-client-info': 'stock-tracker-web'
      },
      body: JSON.stringify({ symbols: uniqueTickers })
    });

    const responseText = await response.text();
    let parsedResponse = null;

    try {
      parsedResponse = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      throw new Error(`Company market data function returned non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(parsedResponse?.error || `Company market data function returned HTTP ${response.status}.`);
    }

    const dataByTicker = normalizeCompanyMarketDataResponse(parsedResponse);
    saveCachedCompanyMarketData(dataByTicker);

    return {
      ...buildCachedFallback(uniqueTickers),
      ...dataByTicker
    };
  } catch (error) {
    console.warn('Company market data API not reachable.', error);
    return buildCachedFallback(uniqueTickers);
  }
}
