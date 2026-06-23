import { API_STATUS } from './constants.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabaseClient.js';

// Supabase Edge Function used to fetch current prices from Finnhub.
// The Finnhub API key should be stored as a Supabase secret named FINNHUB_API_KEY.
const DEFAULT_STOCK_PRICE_FUNCTION_NAME = 'get-stock-price';
const STOCK_PRICE_FUNCTION_NAME = window.STOCK_TRACKER_CONFIG?.stockPriceFunctionName || DEFAULT_STOCK_PRICE_FUNCTION_NAME;
const STOCK_PRICE_FUNCTION_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${STOCK_PRICE_FUNCTION_NAME}`;
const MARKET_PRICE_CACHE_KEY = 'stockTrackerLastMarketPrices';
const MARKET_PRICE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MARKET_PRICE_FUNCTION_DISABLED_KEY = 'stockTrackerStockPriceFunctionDisabled';
const MARKET_PRICE_FUNCTION_DISABLED_TTL_MS = 5 * 60 * 1000;

function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase();
}

const MARKET_PRICE_SOURCE_TYPES = {
  LIVE: 'live',
  CACHED: 'cached',
  MANUAL: 'manual',
  MISSING: 'missing'
};

function buildUnavailablePriceResult(ticker, source) {
  return {
    ticker,
    status: API_STATUS.NOT_REACHABLE,
    price: null,
    source,
    sourceType: MARKET_PRICE_SOURCE_TYPES.MISSING
  };
}

function buildReadyPriceResult(ticker, price, source, sourceType = MARKET_PRICE_SOURCE_TYPES.LIVE) {
  return {
    ticker,
    status: API_STATUS.READY,
    price,
    source,
    sourceType
  };
}

function normalizePriceResponse(data) {
  // Supported Edge Function response shapes:
  // { price: 298.05 }
  // { currentPrice: 298.05 }
  // { c: 298.05 } // raw Finnhub-compatible quote fallback
  const price = Number(data?.price ?? data?.currentPrice ?? data?.c);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Supabase Edge Function returned an invalid market price.');
  }

  return price;
}

function isStockPriceFunctionTemporarilyDisabled() {
  try {
    const storedStatus = JSON.parse(localStorage.getItem(MARKET_PRICE_FUNCTION_DISABLED_KEY) || 'null');
    if (storedStatus?.functionName !== STOCK_PRICE_FUNCTION_NAME || storedStatus?.disabled !== true) {
      return false;
    }

    // Do not permanently lock the app into cache-only mode. A missing Edge Function
    // can be deployed after the user first opens the app, so retry live API calls
    // after a short cooldown instead of relying on cached prices forever.
    const disabledAtTime = Date.parse(storedStatus.disabledAt || '');
    if (!Number.isFinite(disabledAtTime) || Date.now() - disabledAtTime > MARKET_PRICE_FUNCTION_DISABLED_TTL_MS) {
      enableStockPriceFunction();
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Unable to read market price function status.', error);
    return false;
  }
}

function disableStockPriceFunction(reason) {
  try {
    localStorage.setItem(
      MARKET_PRICE_FUNCTION_DISABLED_KEY,
      JSON.stringify({
        functionName: STOCK_PRICE_FUNCTION_NAME,
        disabled: true,
        reason,
        disabledAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn('Unable to save market price function status.', error);
  }
}

function enableStockPriceFunction() {
  try {
    localStorage.removeItem(MARKET_PRICE_FUNCTION_DISABLED_KEY);
  } catch (error) {
    console.warn('Unable to clear market price function status.', error);
  }
}

async function getSupabaseFunctionErrorDetails(error) {
  const details = {
    message: error?.message || 'Supabase Edge Function request failed.',
    status: error?.context?.status ?? null,
    bodyText: ''
  };

  try {
    if (error?.context && typeof error.context.clone === 'function') {
      details.bodyText = await error.context.clone().text();
      return details;
    }

    if (error?.context && typeof error.context.text === 'function') {
      details.bodyText = await error.context.text();
    }
  } catch (readError) {
    console.warn('Unable to read Supabase function error response.', readError);
  }

  return details;
}

function isFunctionNotFoundError(errorDetails) {
  return errorDetails.status === 404 || /NOT_FOUND|function was not found|Requested function was not found/i.test(errorDetails.bodyText);
}

function loadCachedMarketPrices() {
  try {
    const storedCache = localStorage.getItem(MARKET_PRICE_CACHE_KEY);
    if (!storedCache) return {};

    const parsedCache = JSON.parse(storedCache);
    return parsedCache && typeof parsedCache === 'object' ? parsedCache : {};
  } catch (error) {
    console.warn('Unable to read cached market prices.', error);
    return {};
  }
}

function saveCachedMarketPrice(ticker, price) {
  if (!Number.isFinite(price) || price <= 0) return;

  const cachedPrices = loadCachedMarketPrices();
  cachedPrices[ticker] = {
    price,
    savedAt: new Date().toISOString()
  };

  localStorage.setItem(MARKET_PRICE_CACHE_KEY, JSON.stringify(cachedPrices));
}

function getRecentCachedMarketPrice(ticker) {
  const cachedPrice = loadCachedMarketPrices()[ticker];
  const price = Number(cachedPrice?.price);
  const savedAtTime = Date.parse(cachedPrice?.savedAt || '');

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(savedAtTime)) {
    return null;
  }

  const cacheAge = Date.now() - savedAtTime;
  if (cacheAge > MARKET_PRICE_CACHE_MAX_AGE_MS) {
    return null;
  }

  return price;
}

function buildCachedFallbackResult(ticker, reason) {
  const cachedPrice = getRecentCachedMarketPrice(ticker);

  if (!Number.isFinite(cachedPrice)) {
    return buildUnavailablePriceResult(ticker, reason);
  }

  return buildReadyPriceResult(
    ticker,
    cachedPrice,
    `${reason}; using last cached price`,
    MARKET_PRICE_SOURCE_TYPES.CACHED
  );
}

export async function fetchCurrentMarketPrice(ticker) {
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedTicker) {
    return buildUnavailablePriceResult(normalizedTicker, 'Missing ticker symbol');
  }

  if (!isSupabaseConfigured()) {
    return buildCachedFallbackResult(
      normalizedTicker,
      'Supabase is not configured for live market prices'
    );
  }

  if (isStockPriceFunctionTemporarilyDisabled()) {
    return buildCachedFallbackResult(
      normalizedTicker,
      `Supabase Edge Function ${STOCK_PRICE_FUNCTION_NAME} is not deployed`
    );
  }

  try {
    // Use the explicit Edge Function URL instead of supabase.functions.invoke so every
    // live-price request always targets the same endpoint:
    // https://<project-ref>.supabase.co/functions/v1/get-stock-price
    const response = await fetch(STOCK_PRICE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'x-client-info': 'stock-tracker-web'
      },
      body: JSON.stringify({ symbol: normalizedTicker })
    });

    const responseText = await response.text();
    let data = null;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      throw new Error(`Stock price function returned non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
      const errorDetails = {
        status: response.status,
        message: data?.error || `Stock price function returned HTTP ${response.status}.`,
        bodyText: responseText
      };

      if (isFunctionNotFoundError(errorDetails)) {
        disableStockPriceFunction(errorDetails.bodyText || errorDetails.message);
      }

      throw new Error(errorDetails.bodyText || errorDetails.message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    const marketPrice = normalizePriceResponse(data);
    enableStockPriceFunction();
    saveCachedMarketPrice(normalizedTicker, marketPrice);

    return buildReadyPriceResult(
      normalizedTicker,
      marketPrice,
      `Supabase Edge Function: ${STOCK_PRICE_FUNCTION_NAME}`,
      MARKET_PRICE_SOURCE_TYPES.LIVE
    );
  } catch (error) {
    console.warn(`Market price API not reachable for ${normalizedTicker}.`, error);
    return buildCachedFallbackResult(
      normalizedTicker,
      `Supabase Edge Function ${STOCK_PRICE_FUNCTION_NAME} not reachable`
    );
  }
}

export async function fetchCurrentMarketPrices(tickers) {
  const uniqueTickers = [...new Set(tickers.map(normalizeTicker).filter(Boolean))];
  const priceResults = await Promise.all(uniqueTickers.map(fetchCurrentMarketPrice));

  return priceResults.reduce((result, priceResult) => {
    result[priceResult.ticker] = priceResult;
    return result;
  }, {});
}
