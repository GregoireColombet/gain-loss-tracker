import { API_STATUS } from './constants.js';
import { supabaseClient, isSupabaseConfigured } from './supabaseClient.js';

// Supabase Edge Function used to fetch current prices from Finnhub.
// The Finnhub API key should be stored as a Supabase secret named FINNHUB_API_KEY.
const STOCK_PRICE_FUNCTION_NAME = 'get-stock-price';

function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase();
}

function buildUnavailablePriceResult(ticker, source) {
  return {
    ticker,
    status: API_STATUS.NOT_REACHABLE,
    price: null,
    source
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

export async function fetchCurrentMarketPrice(ticker) {
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedTicker) {
    return buildUnavailablePriceResult(normalizedTicker, 'Missing ticker symbol');
  }

  if (!isSupabaseConfigured() || !supabaseClient) {
    return buildUnavailablePriceResult(
      normalizedTicker,
      'Supabase is not configured for live market prices'
    );
  }

  try {
    const { data, error } = await supabaseClient.functions.invoke(STOCK_PRICE_FUNCTION_NAME, {
      body: { symbol: normalizedTicker }
    });

    if (error) {
      throw new Error(error.message || 'Supabase Edge Function request failed.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    const marketPrice = normalizePriceResponse(data);

    return {
      ticker: normalizedTicker,
      status: API_STATUS.READY,
      price: marketPrice,
      source: 'Supabase Edge Function: get-stock-price'
    };
  } catch (error) {
    console.warn(`Market price API not reachable for ${normalizedTicker}.`, error);
    return buildUnavailablePriceResult(
      normalizedTicker,
      'Supabase Edge Function not reachable'
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
