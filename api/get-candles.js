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

  const { tickers, range = '1D' } = req.body || {};
  if (!Array.isArray(tickers) || !tickers.length) return res.status(400).json({ error: 'tickers required' });
  if (tickers.length > 50) return res.status(400).json({ error: 'Too many tickers (max 50)' });
  const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
  for (const t of tickers) {
    if (typeof t !== 'string' || !TICKER_RE.test(t.toUpperCase())) {
      return res.status(400).json({ error: `Invalid ticker: ${t}` });
    }
  }
  const VALID_RANGES = new Set(['1D','1W','1M','3M','6M','1Y','ALL']);
  if (!VALID_RANGES.has(range)) return res.status(400).json({ error: `Invalid range: ${range}` });

  const now = Math.floor(Date.now() / 1000);
  let resolution, from;
  switch (range) {
    case '1D':  resolution = '5';  from = now - 20 * 3600;        break; // 20h back covers full 4AM–8PM ET extended session
    case '1W':  resolution = 'D';  from = now - 7 * 86400;        break;
    case '1M':  resolution = 'D';  from = now - 30 * 86400;       break;
    case '3M':  resolution = 'D';  from = now - 90 * 86400;       break;
    case '6M':  resolution = 'D';  from = now - 180 * 86400;      break;
    case '1Y':  resolution = 'D';  from = now - 365 * 86400;      break;
    default:    resolution = 'W';  from = now - 5 * 365 * 86400;  break;
  }

  const results = {};
  await Promise.all(tickers.map(async t => {
    try {
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(t)}&resolution=${resolution}&from=${from}&to=${now}&token=${process.env.FINNHUB_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Finnhub ${r.status}`);
      const data = await r.json();
      if (data.s !== 'ok' || !data.t?.length) { results[t] = []; return; }
      results[t] = data.t.map((ts, i) => ({ t: ts, o: data.o[i], h: data.h[i], l: data.l[i], c: data.c[i] }));
    } catch { results[t] = []; }
  }));

  return res.status(200).json(results);
}
