const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

const EARNINGS_LOOKAHEAD_DAYS = 180;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeSymbol(symbol: unknown) {
  return String(symbol || '').trim().toUpperCase();
}

async function fetchFinnhubJson(path: string, finnhubApiKey: string) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`https://finnhub.io/api/v1/${path}${separator}token=${finnhubApiKey}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

function normalizeUpcomingEarnings(calendarResponse: any) {
  const events = Array.isArray(calendarResponse?.earningsCalendar)
    ? calendarResponse.earningsCalendar
    : [];

  return events
    .filter(event => event?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}

function normalizeLastEarnings(earningsResponse: any) {
  const rows = Array.isArray(earningsResponse) ? earningsResponse : [];
  const latestRow = rows
    .filter(row => row?.period)
    .sort((a, b) => String(b.period).localeCompare(String(a.period)))[0];

  if (!latestRow) return null;

  const actual = Number(latestRow.actual);
  const estimate = Number(latestRow.estimate);
  const surprise = Number(latestRow.surprise);
  const surprisePercent = Number(latestRow.surprisePercent);

  return {
    period: latestRow.period,
    quarter: latestRow.quarter ?? null,
    year: latestRow.year ?? null,
    actual: Number.isFinite(actual) ? actual : null,
    estimate: Number.isFinite(estimate) ? estimate : null,
    surprise: Number.isFinite(surprise) ? surprise : null,
    surprisePercent: Number.isFinite(surprisePercent) ? surprisePercent : null
  };
}

function normalizePriceTarget(priceTargetResponse: any) {
  const targetMean = Number(priceTargetResponse?.targetMean);
  const targetHigh = Number(priceTargetResponse?.targetHigh);
  const targetLow = Number(priceTargetResponse?.targetLow);
  const targetMedian = Number(priceTargetResponse?.targetMedian);

  if (![targetMean, targetHigh, targetLow, targetMedian].some(Number.isFinite)) {
    return null;
  }

  return {
    targetMean: Number.isFinite(targetMean) ? targetMean : null,
    targetHigh: Number.isFinite(targetHigh) ? targetHigh : null,
    targetLow: Number.isFinite(targetLow) ? targetLow : null,
    targetMedian: Number.isFinite(targetMedian) ? targetMedian : null,
    lastUpdated: priceTargetResponse?.lastUpdated || null
  };
}

async function fetchSymbolData(symbol: string, finnhubApiKey: string, today: Date) {
  const todayDate = formatDate(today);
  const toDate = formatDate(addDays(today, EARNINGS_LOOKAHEAD_DAYS));

  const [earningsCalendar, earningsHistory, priceTarget, peers] = await Promise.allSettled([
    fetchFinnhubJson(`calendar/earnings?symbol=${encodeURIComponent(symbol)}&from=${todayDate}&to=${toDate}`, finnhubApiKey),
    fetchFinnhubJson(`stock/earnings?symbol=${encodeURIComponent(symbol)}`, finnhubApiKey),
    fetchFinnhubJson(`stock/price-target?symbol=${encodeURIComponent(symbol)}`, finnhubApiKey),
    fetchFinnhubJson(`stock/peers?symbol=${encodeURIComponent(symbol)}`, finnhubApiKey)
  ]);

  return {
    ticker: symbol,
    source: 'Finnhub company market data',
    sourceType: 'live',
    nextEarnings: earningsCalendar.status === 'fulfilled'
      ? normalizeUpcomingEarnings(earningsCalendar.value)
      : null,
    lastEarnings: earningsHistory.status === 'fulfilled'
      ? normalizeLastEarnings(earningsHistory.value)
      : null,
    priceTarget: priceTarget.status === 'fulfilled'
      ? normalizePriceTarget(priceTarget.value)
      : null,
    peers: peers.status === 'fulfilled' && Array.isArray(peers.value)
      ? peers.value.filter(Boolean).map(normalizeSymbol).filter(Boolean)
      : []
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');

    if (!finnhubApiKey) {
      return jsonResponse({ error: 'Missing FINNHUB_API_KEY Supabase secret.' }, 500);
    }

    const body = await req.json();
    const symbols = Array.isArray(body?.symbols)
      ? body.symbols.map(normalizeSymbol).filter(Boolean)
      : [normalizeSymbol(body?.symbol)].filter(Boolean);
    const uniqueSymbols = [...new Set(symbols)].slice(0, 30);

    if (!uniqueSymbols.length) {
      return jsonResponse({ error: 'Missing stock symbols.' }, 400);
    }

    const today = new Date();
    const symbolDataEntries = await Promise.all(
      uniqueSymbols.map(async symbol => [symbol, await fetchSymbolData(symbol, finnhubApiKey, today)] as const)
    );

    return jsonResponse({ data: Object.fromEntries(symbolDataEntries) });
  } catch (error) {
    return jsonResponse(
      {
        error: 'Unable to fetch company market data.',
        details: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
});
