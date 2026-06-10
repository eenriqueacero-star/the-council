function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const projectId = 'the-council-89570';
    return payload.exp > now
      && payload.iss === `https://securetoken.google.com/${projectId}`
      && payload.aud === projectId;
  } catch { return false; }
}

const RANGE_CONFIG = {
  '1H':  { resolution: '5',  offsetSec: 3600 },
  '1D':  { resolution: '30', offsetSec: 86400 },
  '1W':  { resolution: '60', offsetSec: 7 * 86400 },
  '1M':  { resolution: 'D',  offsetSec: 30 * 86400 },
  '1Y':  { resolution: 'D',  offsetSec: 365 * 86400 },
  'All': { resolution: 'W',  offsetSec: 5 * 365 * 86400 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { tickers = [], range = '1D' } = req.body;
  const cfg = RANGE_CONFIG[range] || RANGE_CONFIG['1D'];
  const to = Math.floor(Date.now() / 1000);
  const from = to - cfg.offsetSec;

  const allTickers = [...new Set([...tickers, 'SPY'])];
  const results = {};

  await Promise.all(allTickers.map(async ticker => {
    try {
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(ticker)}&resolution=${cfg.resolution}&from=${from}&to=${to}&token=${process.env.FINNHUB_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Finnhub ${r.status}`);
      const data = await r.json();
      if (data.s !== 'ok' || !data.t?.length) throw new Error('no_data');
      results[ticker] = { t: data.t, c: data.c };
    } catch (err) {
      results[ticker] = { error: err.message };
    }
  }));

  return res.status(200).json(results);
}
