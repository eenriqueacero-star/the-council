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

  const results = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${process.env.FINNHUB_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Finnhub ${r.status}`);
      const data = await r.json();
      results[ticker] = { price: data.c, changePct: data.dp, high: data.h, low: data.l, open: data.o, prevClose: data.pc };
    } catch (err) {
      results[ticker] = { error: err.message };
    }
  }));

  return res.status(200).json(results);
}
