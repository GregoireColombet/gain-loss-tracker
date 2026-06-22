const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const finnhubApiKey = Deno.env.get('FINNHUB_API_KEY');

    if (!finnhubApiKey) {
      return Response.json(
        { error: 'Missing FINNHUB_API_KEY Supabase secret.' },
        { status: 500, headers: corsHeaders }
      );
    }

    const { symbol } = await req.json();
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();

    if (!normalizedSymbol) {
      return Response.json(
        { error: 'Missing stock symbol.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const finnhubUrl =
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(normalizedSymbol)}&token=${finnhubApiKey}`;
    const finnhubResponse = await fetch(finnhubUrl);
    const quote = await finnhubResponse.json();
    const price = Number(quote?.c);

    if (!finnhubResponse.ok || !Number.isFinite(price) || price <= 0) {
      return Response.json(
        { error: 'Price unavailable.', details: quote },
        { status: 404, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        symbol: normalizedSymbol,
        price,
        previousClose: quote.pc,
        change: quote.d,
        changePercent: quote.dp,
        timestamp: quote.t
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      {
        error: 'Unable to fetch stock price.',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500, headers: corsHeaders }
    );
  }
});
