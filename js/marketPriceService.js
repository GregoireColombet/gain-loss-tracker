import { API_STATUS } from "./constants.js";

// Finnhub quote endpoint documentation:
// https://finnhub.io/docs/api/quote
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";

// Replace this placeholder with your Finnhub API key.
// Note: because this is a browser-only app, this public key can be viewed by users.
// For production, call Finnhub from a small backend/Supabase Edge Function instead.
const FINNHUB_API_KEY = "d8r9kg1r01qni6tgv19gd8r9kg1r01qni6tgv1a0";

function normalizeTicker(ticker) {
  return String(ticker || "")
    .trim()
    .toUpperCase();
}

function isFinnhubConfigured() {
  return Boolean(FINNHUB_API_KEY && !FINNHUB_API_KEY.startsWith("PASTE_"));
}

function buildFinnhubQuoteUrl(ticker) {
  const url = new URL(FINNHUB_QUOTE_URL);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("token", FINNHUB_API_KEY);
  return url.toString();
}

export async function fetchCurrentMarketPrice(ticker) {
  const normalizedTicker = normalizeTicker(ticker);

  if (!normalizedTicker) {
    return {
      ticker: normalizedTicker,
      status: API_STATUS.NOT_REACHABLE,
      price: null,
    };
  }

  if (!isFinnhubConfigured()) {
    return {
      ticker: normalizedTicker,
      status: API_STATUS.NOT_REACHABLE,
      price: null,
      source: "Finnhub API key is not configured",
    };
  }

  try {
    const response = await fetch(buildFinnhubQuoteUrl(normalizedTicker));
    if (!response.ok) throw new Error("Finnhub response was not successful.");

    const quote = await response.json();
    const marketPrice = Number(quote?.c);

    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new Error("Finnhub current price is missing or invalid.");
    }

    return {
      ticker: normalizedTicker,
      status: API_STATUS.READY,
      price: marketPrice,
      source: "Finnhub quote API",
    };
  } catch (error) {
    console.warn(`Finnhub API not reachable for ${normalizedTicker}.`, error);
    return {
      ticker: normalizedTicker,
      status: API_STATUS.NOT_REACHABLE,
      price: null,
      source: "Finnhub API not reachable",
    };
  }
}

export async function fetchCurrentMarketPrices(tickers) {
  const uniqueTickers = [
    ...new Set(tickers.map(normalizeTicker).filter(Boolean)),
  ];
  const priceResults = await Promise.all(
    uniqueTickers.map(fetchCurrentMarketPrice),
  );

  return priceResults.reduce((result, priceResult) => {
    result[priceResult.ticker] = priceResult;
    return result;
  }, {});
}
