async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const idToken = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data.users?.length);
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { tickers } = req.body;
  if (!Array.isArray(tickers) || !tickers.length) return res.status(400).json({ error: 'tickers must be a non-empty array' });
  if (tickers.length > 50) return res.status(400).json({ error: 'Too many tickers (max 50)' });
  const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
  for (const t of tickers) {
    if (typeof t !== 'string' || !TICKER_RE.test(t.toUpperCase())) {
      return res.status(400).json({ error: `Invalid ticker: ${t}` });
    }
  }

  const { withEarnings = false } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const in90d = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);

  const results = {};
  await Promise.all(tickers.map(async ticker => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${process.env.FINNHUB_KEY}`;

    // Retry up to 3 attempts when price comes back null/zero (transient miss)
    let quoteData = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
      try {
        const r = await fetch(url);
        if (r.status === 429) {
          console.error(`[quote] Finnhub 429 rate-limited for ${ticker}`);
          results[ticker] = { error: 'rate_limited', rateLimited: true };
          break;
        }
        if (!r.ok) throw new Error(`Finnhub ${r.status}`);
        const data = await r.json();
        console.error(`[get-quotes] ${ticker} raw Finnhub attempt ${attempt + 1}: c=${data.c} dp=${data.dp} h=${data.h} l=${data.l} pc=${data.pc} t=${data.t}`);
        // Accept if we have at least a prevClose — price may be 0 when market is closed
        if ((data.c ?? 0) > 0 || (data.pc ?? 0) > 0) {
          quoteData = data;
          break;
        }
        console.error(`[quote] ${ticker} attempt ${attempt + 1}: both c and pc are zero/null${attempt < 2 ? ', retrying in 1s' : ', giving up'}`);
      } catch (err) {
        console.error(`[quote] ${ticker} fetch error attempt ${attempt + 1}: ${err.message}`);
        if (attempt === 2) results[ticker] = { error: err.message };
      }
    }

    if (!results[ticker]) {
      if (quoteData) {
        results[ticker] = { price: quoteData.c, changePct: quoteData.dp, high: quoteData.h, low: quoteData.l, open: quoteData.o, prevClose: quoteData.pc };
      } else {
        console.error(`[quote] Finnhub returned null price after retry for ${ticker}`);
      results[ticker] = { error: 'no_price_after_retries' };
      }
    }

    if (withEarnings && !results[ticker]?.rateLimited) {
      try {
        const eUrl = `https://finnhub.io/api/v1/stock/earnings-calendar?from=${today}&to=${in90d}&symbol=${encodeURIComponent(ticker)}&token=${process.env.FINNHUB_KEY}`;
        const er = await fetch(eUrl);
        if (er.ok) {
          const ed = await er.json();
          const next = ed.earningsCalendar?.[0];
          if (next?.date) results[ticker].nextEarnings = next.date;
        }
      } catch {}
    }
  }));

  return res.status(200).json(results);
}
