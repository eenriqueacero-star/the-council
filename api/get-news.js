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

  const { ticker } = req.body;
  const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
  if (!ticker || typeof ticker !== 'string' || !TICKER_RE.test(ticker.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  const sym = ticker.toUpperCase();
  const to   = new Date();
  const from = new Date(Date.now() - 5 * 864e5); // 5 days ago
  const toStr   = to.toISOString().slice(0, 10);
  const fromStr = from.toISOString().slice(0, 10);

  try {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${fromStr}&to=${toStr}&token=${process.env.FINNHUB_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`[get-news] Finnhub error ${r.status} for ${sym}`);
      return res.status(200).json({ articles: [], raw: [] });
    }
    const data = await r.json();
    if (!Array.isArray(data)) {
      console.error(`[get-news] Unexpected Finnhub response for ${sym}:`, JSON.stringify(data).slice(0, 200));
      return res.status(200).json({ articles: [], raw: [] });
    }

    // Sort by datetime desc, take top 5
    const sorted = [...data].sort((a, b) => b.datetime - a.datetime).slice(0, 5);

    const articles = sorted.map(item => ({
      headline: item.headline || '',
      source:   item.source   || '',
      date:     item.datetime ? new Date(item.datetime * 1000).toISOString().slice(0, 10) : '',
      summary:  item.summary  || '',
    }));

    console.error(`[get-news] ${sym}: ${articles.length} articles from Finnhub (${fromStr} to ${toStr})`);
    return res.status(200).json({ articles, raw: sorted });
  } catch (err) {
    console.error(`[get-news] fetch threw for ${sym}:`, err.message);
    return res.status(200).json({ articles: [], raw: [] });
  }
}
