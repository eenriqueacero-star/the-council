import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

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

// All ranges use chart() — historical() is deprecated in yahoo-finance2 v3
const RANGE_CONFIG = {
  '1D':  { interval: '5m',  periodMs: 20 * 3600 * 1000         }, // 20h back covers full 4AM–8PM ET extended session
  '1W':  { interval: '1d',  periodMs: 7 * 86400 * 1000         },
  '1M':  { interval: '1d',  periodMs: 30 * 86400 * 1000        },
  '3M':  { interval: '1d',  periodMs: 90 * 86400 * 1000        },
  '6M':  { interval: '1d',  periodMs: 180 * 86400 * 1000       },
  '1Y':  { interval: '1d',  periodMs: 365 * 86400 * 1000       },
  'ALL': { interval: '1wk', periodMs: 5 * 365 * 86400 * 1000   },
};

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

  const { interval, periodMs } = RANGE_CONFIG[range];
  const period1 = new Date(Date.now() - periodMs);

  const results = {};
  await Promise.all(tickers.map(async t => {
    try {
      const data = await yahooFinance.chart(t, { period1, interval });
      const bars = (data?.quotes ?? []).filter(q => q.close != null);
      results[t] = bars.map(bar => ({
        t: Math.floor(new Date(bar.date).getTime() / 1000),
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume ?? 0,
      }));
      console.error('[get-candles]', t, 'range:', range, 'interval:', interval, 'points:', results[t].length);
    } catch (err) {
      console.error('[get-candles]', t, 'error:', err.message);
      results[t] = [];
    }
  }));

  console.error('[get-candles] Response:', Object.entries(results).map(([k, v]) => `${k}:${v.length}`).join(', '));
  return res.status(200).json(results);
}
