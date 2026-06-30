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

const RANGE_CONFIG = {
  '1D':  { interval: '5min', outputsize: 78  },
  '1W':  { interval: '1day', outputsize: 5   },
  '1M':  { interval: '1day', outputsize: 22  },
  '3M':  { interval: '1day', outputsize: 65  },
  '6M':  { interval: '1day', outputsize: 130 },
  '1Y':  { interval: '1day', outputsize: 252 },
  'ALL': { interval: '1week', outputsize: 260 },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  if (!process.env.TWELVE_DATA_KEY) {
    console.error('[get-candles] ERROR: TWELVE_DATA_KEY env var is not set — all tickers will return []');
  }

  const { interval, outputsize } = RANGE_CONFIG[range];
  const results = {};

  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    if (i > 0) await sleep(200); // stay under 8 calls/min free tier limit
    try {
      const apiKey = process.env.TWELVE_DATA_KEY || '';
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t)}&interval=${interval}&outputsize=${outputsize}&prepost=true&timezone=America%2FNew_York&apikey=${apiKey}`;
      const safeUrl = url.replace(apiKey || 'MISSING', 'REDACTED');
      console.error('[get-candles] Fetching', t, 'interval:', interval, 'outputsize:', outputsize, 'url:', safeUrl);

      const r = await fetch(url);
      if (!r.ok) throw new Error(`Twelve Data HTTP ${r.status}`);
      const data = await r.json();

      console.error('[get-candles]', t, 'status:', data.status, 'values:', data.values?.length ?? 'n/a', 'error:', data.message || 'none');

      if (data.status === 'error' || !Array.isArray(data.values) || !data.values.length) {
        results[t] = [];
        continue;
      }
      // values are newest-first; reverse for chronological chart display
      const candles = data.values.slice().reverse().map(v => ({
        t: Math.floor(new Date(v.datetime.replace(' ', 'T')).getTime() / 1000),
        o: parseFloat(v.open),
        h: parseFloat(v.high),
        l: parseFloat(v.low),
        c: parseFloat(v.close),
        v: parseInt(v.volume) || 0,
      }));
      results[t] = candles;
    } catch (err) {
      console.error('[get-candles]', t, 'fetch error:', err.message);
      results[t] = [];
    }
  }

  console.error('[get-candles] Response:', Object.entries(results).map(([k, v]) => `${k}:${v.length}`).join(', '));
  return res.status(200).json(results);
}
