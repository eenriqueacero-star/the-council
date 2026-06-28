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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await verifyAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  const FRED_KEY = process.env.FRED_API_KEY;
  if (!FRED_KEY) return res.status(500).json({ error: 'FRED_API_KEY not set' });

  const series = {
    fed_rate:    'FEDFUNDS',
    cpi:         'CPIAUCSL',
    unemployment:'UNRATE',
    gdp_growth:  'A191RL1Q225SBEA',
    treasury_10y:'DGS10',
    treasury_2y: 'DGS2',
    vix:         'VIXCLS',
  };

  try {
    const results = {};
    await Promise.all(Object.entries(series).map(async ([key, seriesId]) => {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=5`;
        const r = await fetch(url);
        if (!r.ok) { results[key] = null; return; }
        const data = await r.json();
        const obs = (data.observations || []).filter(o => o.value !== '.');
        results[key] = obs.length > 0 ? {
          current:  parseFloat(obs[0].value),
          date:     obs[0].date,
          previous: obs.length > 1 ? parseFloat(obs[1].value) : null,
          prevDate: obs.length > 1 ? obs[1].date : null,
        } : null;
      } catch {
        results[key] = null;
      }
    }));

    if (results.treasury_10y && results.treasury_2y) {
      results.yield_spread = {
        current:  +(results.treasury_10y.current - results.treasury_2y.current).toFixed(2),
        inverted: results.treasury_10y.current < results.treasury_2y.current,
      };
    }

    console.error('[get-fred] fetched:', Object.keys(results).filter(k => results[k] !== null).join(', '));
    res.status(200).json(results);
  } catch (err) {
    console.error('[get-fred] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
